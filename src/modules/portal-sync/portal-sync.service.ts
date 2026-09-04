import { HttpError } from "../../shared/errors/http-error.js";
import type { PortalClient } from "../../services/portal.client.js";
import {
  PortalSyncRepository, defaultPeriodDates, hasPublishedCalendar, pickBestRecordRow, progressStatusFor,
  shouldActivatePeriod, teacherCodeFor,
  levelFromCoverage, levelNeverGoesDown,
  type ProgressStatus,
  careerNamesDiffer,
  courseColorHex,
} from "./portal-sync.repository.js";
import {
  parseAulaVirtual, parseCicloActivo, parseConsolidadoMatricula, parseHorario,
  parseImpedimentos, parseInfoAcademica, parseRecordAcademico, parseSyllabusEntry,
  parseAulas, parseDelegados,
} from "./parsers/index.js";
import { PORTAL_PATHS } from "../../services/portal.client.js";
import type {
  DelegadosNomina,
  ImportResult, ImportSummary, PortalCookies, RecordRow, SyllabusEntry, SyncStatus, SyncWarning,
} from "./portal-sync.types.js";

const emptySummary = (): ImportSummary => ({
  coursesCreated: 0, teachersCreated: 0, sectionsCreated: 0, sectionsUpdated: 0,
  sessionsUpserted: 0, enrollmentsUpserted: 0, enrollmentsWithdrawn: 0,
  progressUpserted: 0, progressSkipped: 0, alertsCreated: 0, syllabiUpserted: 0,
  claimsUpserted: 0, claimsDeleted: 0, representativesPromoted: 0,
});

export class PortalSyncService {
  constructor(
    private readonly repository: PortalSyncRepository,
    private readonly client: PortalClient,
    /**
     * Solo para re-firmar el JWT cuando la importación promueve al propio
     * alumno (RS-18). Es OPCIONAL y de tipo estructural a propósito: los dobles
     * de los tests existentes construyen el service con dos argumentos, y
     * tipar la dependencia por su forma evita acoplar portal-sync al módulo de
     * auth entero. Sin él, `token` sale `null` y el rol se actualiza en el
     * próximo login, que es la degradación aceptada.
     */
    private readonly auth?: {
      reissueToken(userId: number, role: "delegate" | "subdelegate"): Promise<string | null>;
    },
  ) {}

  async getStatus(studentId: number): Promise<SyncStatus> {
    const activePeriod = await this.repository.findActivePeriod();
    if (!activePeriod) return { activePeriod: null, enrollmentsInActivePeriod: 0, needsImport: true };
    const n = await this.repository.countEnrollmentsInPeriod(studentId, activePeriod.id);
    return { activePeriod, enrollmentsInActivePeriod: n, needsImport: n === 0 };
  }

  /**
   * Punto de entrada de la importación. Acepta la sesión del portal ya hecha
   * (`cookies`) o las credenciales para hacerla acá (`credentials`); el esquema
   * garantiza que llega exactamente una de las dos.
   *
   * Con `credentials`, el usuario del portal NO viene del cliente: sale de
   * `app_user.code`. La contraseña y el passcode se usan solo para el login y
   * se descartan; nunca se registran ni se persisten.
   */
  async importFromPortal(
    userId: number, studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string } },
  ): Promise<ImportResult> {
    let cookies = entrada.cookies;
    if (!cookies) {
      const creds = entrada.credentials!;
      const userCode = await this.repository.findUserCode(userId);
      if (!userCode) {
        throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
      }
      // Si esto lanza, no hay sesión que cerrar: el `finally` de abajo no corre
      // porque el try todavía no empezó.
      cookies = await this.client.login(userCode, creds.password, creds.passcode);
    }
    const sesion = cookies;
    try {
      return await this.runImport(userId, studentId, sesion);
    } finally {
      await this.client.logout(sesion);   // best effort, siempre
    }
  }

  private async runImport(userId: number, studentId: number, cookies: PortalCookies): Promise<ImportResult> {
    const warnings: SyncWarning[] = [];
    const summary = emptySummary();

    // ── 1. Descargas (FUERA de la transacción) ──────────────────────────────
    const layout = await this.client.fetchPage("layout.jsp", cookies);
    const ciclo = parseCicloActivo(layout);
    if (!ciclo.ok) throw new HttpError(502, "No se pudo determinar el ciclo en miUlima.", "PORTAL_UNAVAILABLE");
    const pages = await this.client.fetchAll(ciclo.data.cocicloUrl, cookies);

    // ── 2. Identidad: sin degradación, antes de escribir nada ───────────────
    const mat = parseConsolidadoMatricula(pages.matricula);
    if (!mat.ok) {
      throw new HttpError(422, "No se pudo confirmar tu identidad en el portal.", "PORTAL_IDENTITY_UNVERIFIABLE");
    }
    const userCode = await this.repository.findUserCode(userId);
    if (!userCode) throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
    if (mat.data.studentCode !== userCode) {
      throw new HttpError(403, "La cuenta de miUlima no corresponde a tu usuario.", "PORTAL_IDENTITY_MISMATCH");
    }

    const student = await this.repository.findStudent(studentId);
    if (!student) throw new HttpError(422, "Perfil de alumno no encontrado.", "PORTAL_IDENTITY_UNVERIFIABLE");
    if (careerNamesDiffer(mat.data.careerName, student.careerName)) {
      warnings.push({
        code: "CAREER_MISMATCH", block: "matricula",
        message: `El portal reporta "${mat.data.careerName}" y en ULima++ figura "${student.careerName}". No se modificó la carrera.`,
      });
    }

    // ── 3. Parsers restantes (degradan a warnings) ──────────────────────────
    const aula = parseAulaVirtual(layout);
    if (!aula.ok) warnings.push({ code: "PARSER_FAILED", block: "aula-virtual", message: aula.reason });
    const horario = parseHorario(layout);
    if (!horario.ok) warnings.push({ code: "PARSER_FAILED", block: "horario", message: horario.reason });
    const rec = parseRecordAcademico(pages.record);
    if (!rec.ok) warnings.push({ code: "PARSER_FAILED", block: "record", message: rec.reason });
    const info = parseInfoAcademica(layout);
    const imped = parseImpedimentos(layout);

    const nameByCode = new Map<string, string>();
    const teacherByCourse = new Map<string, string>();
    if (aula.ok) {
      for (const r of aula.data) {
        nameByCode.set(r.courseCode, r.courseName);
        teacherByCourse.set(r.courseCode, r.teacherName);
      }
    }

    // ── 3.5 Sílabos: en paralelo, FUERA de la transacción (misma razón que
    // matrícula/récord: son peticiones de red y no deben mantener la conexión
    // de BD abierta). Se resuelven por CURSO, no por fila: dos secciones del
    // mismo curso comparten un solo sílabo (una sola oferta por curso+ciclo).
    // Un sílabo es un dato adicional, no el propósito de la importación:
    // cualquier fallo (red, sesión, parseo) se degrada a "sin sílabo para
    // este curso" y NUNCA aborta el resto de la importación.
    const courseCodesToSync = [...new Set(mat.data.rows.map((r) => r.courseCode))];
    const syllabusByCourse = new Map<string, SyllabusEntry>();
    await Promise.all(
      courseCodesToSync.map(async (courseCode) => {
        try {
          const json = await this.client.fetchSyllabus(ciclo.data.cocicloUrl, courseCode, cookies);
          // La base que se le pasa al parser es la MISMA con la que el
          // cliente acaba de descargar: nunca se persiste la URL de un host
          // distinto del que respondió.
          const parsed = json ? parseSyllabusEntry(json, this.client.syllabusBaseUrl) : null;
          if (parsed) syllabusByCourse.set(courseCode, parsed);
        } catch {
          /* un sílabo perdido nunca aborta la importación */
        }
      }),
    );

    // Un curso sin sílabo es normal (no todo curso publica uno) y NO se
    // advierte por curso; solo se avisa si NINGÚN curso de este ciclo trajo
    // sílabo, con una única advertencia agregada.
    //
    // Se decide ACÁ, con los hechos de la descarga a la vista, y NO desde
    // `summary.syllabiUpserted`: con el `on conflict do nothing` de
    // `upsertSyllabus`, cero escrituras ya no significa "no hay sílabos" —
    // puede significar que todas las ofertas ya tenían fila.
    //
    // El mensaje no afirma que el portal no publicó nada: desde el backend no
    // se distingue "no hay sílabo publicado" de "cactus caído", "sesión de
    // Domino muerta" (el 409 que traga el catch de arriba) o "todas las peticiones
    // expiraron". Dar por buena una causa mandaría a soporte a descartar un
    // problema de infraestructura.
    //
    // La guarda de "había cursos que consultar" es defensiva: hoy
    // `parseConsolidadoMatricula` ya falla (422, más arriba) si el consolidado
    // no trae ninguna fila de curso, así que ese caso no llega hasta acá.
    if (courseCodesToSync.length > 0 && syllabusByCourse.size === 0) {
      warnings.push({
        code: "SYLLABUS_UNAVAILABLE", block: "silabo",
        message: "No se pudo obtener el sílabo de ningún curso de este ciclo.",
      });
    }

    // ── 4. Escrituras (todas dentro de UNA transacción) ─────────────────────
    // findActivePeriod se lee ANTES de abrir la transacción y se pasa adentro:
    // leerlo con this.repository dentro del callback corre sobre el pool, no
    // sobre `tx`, y devuelve una foto tomada FUERA de la transacción. Dos
    // alumnos importando al inicio de un ciclo pueden ambos leer "sin activo"
    // y ambos decidir activate=true; el segundo INSERT viola el índice único
    // parcial de período activo y responde 500. Leerlo antes no elimina la
    // carrera (haría falta un advisory lock) pero saca de en medio la segunda
    // conexión y la lectura obsoleta dentro de la propia transacción.
    // ── 3.6 Delegados: sidebar + una nómina por aula, FUERA de la transacción.
    //
    // `ComandoIngresarAulaVirtualBBDelegado` no sirve: devuelve un frameset. El
    // dato vive dos saltos más adentro, y el sidebar es además quien mapea
    // aula → curso → sección, que es el empate con nuestras secciones.
    //
    // Degrada POR AULA, no por fase: `Promise.all` rechaza entero al primer
    // fallo y descartaría los delegados de todas las secciones por una sola
    // nómina caída. Cada petición y cada parseo van en su propio try, y lo que
    // sí se entendió se escribe igual. Esto es una excepción explícita a la
    // regla general de portal-sync según la cual sesión inválida, portal caído
    // o timeout abortan la importación: los delegados son secundarios y no
    // pueden borrar notas, horario ni matrícula.
    const delegadosBySection = new Map<string, { delegados: DelegadosNomina; observedAt: Date }>();
    try {
      const sidebar = await this.client.fetchPage(PORTAL_PATHS.cursosDelegado, cookies);
      const aulas = parseAulas(sidebar);
      if (!aulas.ok) {
        warnings.push({ code: "PARSER_FAILED", block: "delegado", message: aulas.reason });
      } else {
        await Promise.all(aulas.data.map(async (a) => {
          const donde = `${a.courseCode}/${a.sectionCode}`;
          let html: string;
          try {
            html = await this.client.fetchPage(PORTAL_PATHS.nominaDelegado(a.aula), cookies);
          } catch {
            // El mensaje NUNCA lleva fragmentos del HTML del portal.
            warnings.push({
              code: "DELEGADOS_UNAVAILABLE", block: "delegado",
              message: `No se pudo traer la nómina de ${donde}.`,
            });
            return;
          }
          // El instante de la RESPUESTA, no el del INSERT: la escritura ocurre
          // segundos después, dentro de la transacción, y `observed_at` es lo
          // que decide qué observación gana entre dos alumnos concurrentes.
          const observedAt = new Date();
          const parsed = parseDelegados(html, a.aula);
          if (!parsed.ok) {
            warnings.push({
              code: "PARSER_FAILED", block: "delegado",
              message: `No se entendió la nómina de ${donde}: ${parsed.reason}`,
            });
            return;
          }
          // Cargos que el portal marcó pero que vinieron inservibles. Se
          // reportan acá; el repositorio ya sabe que no debe borrarlos.
          for (const w of parsed.data.warnings ?? []) {
            warnings.push({ code: "PARSER_FAILED", block: "delegado", message: `${donde}: ${w.reason}` });
          }
          delegadosBySection.set(`${a.courseCode}|${a.sectionCode}`, { delegados: parsed.data, observedAt });
        }));

        // Que el sidebar y el consolidado de matrícula no coincidan en NADA es
        // señal de un cambio en el portal, no de un salón sin delegado.
        //
        // Se mide contra las aulas que el sidebar DECLARÓ, no contra las
        // nóminas que sobrevivieron a la descarga. Medirlo sobre las
        // sobrevivientes hacía que una caída de red —todas las nóminas
        // fallando— se reportara además como "el portal cambió", que es
        // sencillamente falso y manda a soporte a buscar donde no es. Es el
        // mismo error de diagnóstico que este módulo ya se prohíbe a sí mismo
        // en el mensaje de SYLLABUS_UNAVAILABLE.
        const matriculado = new Set(mat.data.rows.map((r) => `${r.courseCode}|${r.sectionCode}`));
        const empatan = aulas.data.filter((x) => matriculado.has(`${x.courseCode}|${x.sectionCode}`)).length;
        if (aulas.data.length > 0 && empatan === 0) {
          warnings.push({
            code: "PARSER_FAILED", block: "delegado",
            message: "Ninguna de las aulas del panel de delegados empató con tu matrícula.",
          });
        }
      }
    } catch {
      warnings.push({
        code: "DELEGADOS_UNAVAILABLE", block: "delegado",
        message: "No se pudo abrir el panel de delegados en miUlima.",
      });
    }

    const activeBeforeTx = await this.repository.findActivePeriod();
    // La fecha de inicio del período entrante se conoce ANTES del upsert (sale
    // de KNOWN_PERIOD_CALENDARS/defaultPeriodDates, no de la BD): la misma
    // fuente que upsertPeriod usa internamente para las fechas que inserta.
    const { start: incomingStartDate } = defaultPeriodDates(ciclo.data.periodCode);
    const activate = shouldActivatePeriod(
      ciclo.data.periodCode, activeBeforeTx?.code ?? null, incomingStartDate, new Date(),
    );
    const period = await this.repository.runInTransaction(async (tx) => {
      const p = await this.repository.upsertPeriod(tx, ciclo.data.periodCode, activate);

      // Los datos de terceros mueren con su ciclo: es lo que hace defendible
      // guardarlos sin consentimiento. Va acá porque `upsertPeriod` es el
      // único cierre de ciclo que existe hoy en el repo (no hay cron).
      summary.claimsDeleted += await this.repository.deleteClaimsOfInactivePeriods(tx, p.id);
      if (p.created) {
        await this.repository.ensureAcademicWeeks(tx, p.id, p.startDate, p.endDate);
        if (!hasPublishedCalendar(p.code)) {
          warnings.push({
            code: "PERIOD_DATES_DEFAULTED", block: "periodo",
            message: `Se creó el período ${p.code} con fechas por defecto; Sistemas debe corregirlas.`,
          });
        }
        if (!activate) {
          // Consecuencia deliberada: un período creado antes de su fecha de
          // inicio queda inactivo hasta que una importación POSTERIOR corra
          // en o después de esa fecha (misma lógica de activación, evaluada
          // de nuevo en ese momento). Es aceptable: esta advertencia lo hace
          // visible en vez de dejarlo escondido para Sistemas/soporte.
          warnings.push({
            code: "PERIOD_NOT_ACTIVATED_YET", block: "periodo",
            message: `Se creó el período ${p.code} pero su fecha de inicio (${p.startDate}) aún no llega; seguirá inactivo hasta una importación posterior en o después de esa fecha.`,
          });
        }
      }

      // sectionIdByCourse resuelve el horario, que solo trae courseCode: dos filas
      // de matrícula con el mismo curso y distinta sección (columna GR.) colapsan
      // ahí a propósito. keepSectionIds NO debe colapsar: es la lista de todas las
      // secciones tocadas en esta importación, y de ella depende qué matrícula NO
      // se retira; perder una acá la retira por error dentro de la misma transacción.
      const sectionIdByCourse = new Map<string, number>();
      const keepSectionIds: number[] = [];
      // Evita upsertear el mismo sílabo dos veces cuando dos filas de
      // matrícula comparten curso (dos secciones): ambas resuelven a la
      // MISMA oferta (uq_course_offering es por período+curso, no por fila).
      const syllabusUpsertedOfferings = new Set<number>();
      for (const row of mat.data.rows) {
        const teacherName = teacherByCourse.get(row.courseCode) ?? "";
        const t = await this.repository.upsertTeacher(tx, teacherName);
        if (t.created) summary.teachersCreated++;
        if (!teacherName) {
          warnings.push({
            code: "TEACHER_MISSING", block: "aula-virtual",
            message: `El portal no indica docente para ${row.courseCode}; se usó ${teacherCodeFor("")}.`,
          });
        }

        const courseName = nameByCode.get(row.courseCode) ?? row.courseName;
        const c = await this.repository.upsertCourse(tx, row.courseCode, courseName, row.credits);
        if (c.created) summary.coursesCreated++;

        const off = await this.repository.upsertOffering(tx, p.id, c.id, row.credits);

        // Sílabo, si el portal publicó uno para este curso (§3.5). Después de
        // que la oferta existe, como exige la clave `course_offering_id` de
        // `syllabus`.
        const syllabusEntry = syllabusByCourse.get(row.courseCode);
        if (syllabusEntry && !syllabusUpsertedOfferings.has(off.id)) {
          // `upsertSyllabus` devuelve null cuando su `on conflict do nothing`
          // no escribió nada (la oferta YA tenía sílabo: sembrado o de una
          // importación anterior). `syllabiUpserted` cuenta filas
          // efectivamente escritas, no intentos. La oferta se marca igual como
          // ya atendida: reintentarla daría el mismo null.
          const saved = await this.repository.upsertSyllabus(tx, off.id, syllabusEntry);
          syllabusUpsertedOfferings.add(off.id);
          if (saved) summary.syllabiUpserted++;
        }

        const sec = await this.repository.upsertSection(tx, off.id, row.sectionCode, t.id);
        if (sec.created) summary.sectionsCreated++; else summary.sectionsUpdated++;
        sectionIdByCourse.set(row.courseCode, sec.id);
        keepSectionIds.push(sec.id);

        // Claims: acá y no antes, porque `section_id` recién existe ahora.
        const deleg = delegadosBySection.get(`${row.courseCode}|${row.sectionCode}`);
        if (deleg) {
          const r = await this.repository.upsertRepresentativeClaims(
            tx, sec.id, deleg.delegados, deleg.observedAt,
          );
          summary.claimsUpserted += r.upserted;
          summary.claimsDeleted += r.deleted;
        }

        // Nota final del récord para ESTE curso y ciclo, si ya existe.
        const finalGrade = rec.ok
          ? (rec.data.find((x) => x.periodCode === p.code && x.courseCode === row.courseCode)?.grade ?? null)
          : null;
        // El retorno se CAPTURA: la promoción necesita el `enrollment_id`, y
        // por eso va acá y no junto al claim de arriba.
        const enr = await this.repository.upsertEnrollment(tx, studentId, sec.id, finalGrade);
        summary.enrollmentsUpserted++;

        if (await this.repository.promoteClaimIfAny(tx, sec.id, enr.id, userCode)) {
          summary.representativesPromoted++;
        }
      }

      if (horario.ok) {
        for (const s of horario.data) {
          const sectionId = sectionIdByCourse.get(s.courseCode);
          if (!sectionId) continue;
          // El color va por CÓDIGO de curso, no por sección: así el mismo
          // curso se pinta igual para todos y en todos los ciclos.
          await this.repository.upsertScheduleSession(tx, sectionId, s, courseColorHex(s.courseCode));
          summary.sessionsUpserted++;
        }
      }

      const withdrawn = await this.repository.withdrawMissingEnrollments(
        tx, studentId, p.id, keepSectionIds,
      );
      if (withdrawn === -1) {
        warnings.push({
          code: "WITHDRAW_SKIPPED_WOULD_LOCK_OUT", block: "matricula",
          message: "No se retiraron matrículas porque te habrías quedado sin acceso a la app.",
        });
      } else {
        summary.enrollmentsWithdrawn = withdrawn;
      }

      // Progreso de malla, con todos los ciclos del récord.
      if (rec.ok) {
        const byCourse = new Map<string, RecordRow[]>();
        for (const r of rec.data) {
          byCourse.set(r.courseCode, [...(byCourse.get(r.courseCode) ?? []), r]);
        }
        // En tres fases, para no hacer dos viajes a la base por cada curso del
        // récord. Con el récord completo eso eran ~90 de los ~115 viajes
        // secuenciales de la importación, todos manteniendo abierta la misma
        // transacción. Los conteos de `progressUpserted`/`progressSkipped` y
        // las razones para omitir son exactamente los de antes.

        // 1. Sin tocar la base: decidir el estado de cada curso.
        const conEstado: Array<{ code: string; status: ProgressStatus }> = [];
        for (const [code, rows] of byCourse) {
          const best = pickBestRecordRow(rows);
          if (!best) continue;
          const status = progressStatusFor(best.grade, best.periodCode === p.code);
          if (!status) { summary.progressSkipped++; continue; }
          conEstado.push({ code, status });
        }

        // 2. UNA consulta: todos los códigos contra la malla de una vez.
        const ccIdPorCodigo = await this.repository.findCurriculumCourseIds(
          tx, student.curriculumId, conEstado.map((x) => x.code),
        );

        // 3. UNA sentencia: todo el progreso. Un curso del récord que no está
        // en la malla (convalidación, código antiguo) se omite igual que antes.
        const aEscribir: Array<{ curriculumCourseId: number; status: ProgressStatus }> = [];
        for (const { code, status } of conEstado) {
          const ccId = ccIdPorCodigo.get(code);
          if (!ccId) { summary.progressSkipped++; continue; }
          aEscribir.push({ curriculumCourseId: ccId, status });
        }
        // Se cuenta lo que la base dice haber escrito, no lo que se intentó.
        summary.progressUpserted += await this.repository.upsertProgressBatch(
          tx, studentId, student.curriculumId, aEscribir,
        );
        if (summary.progressSkipped > 0) {
          warnings.push({
            code: "PROGRESS_SKIPPED", block: "record",
            message: `${summary.progressSkipped} cursos del récord no están en tu malla (convalidaciones o códigos antiguos).`,
          });
        }
      }

      // Nivel del alumno: el ciclo del curso obligatorio más bajo que aún le
      // falta (pendiente o cursándolo), ignorando lo que esté por debajo del
      // ciclo más alto ya completo. Se calcula DESPUÉS del loop de progreso de
      // arriba para ver el progreso que esta misma importación acaba de
      // escribir. null = no hay ciclo que asignar; no se toca nada.
      const coverage = await this.repository.findCycleCoverage(tx, studentId, student.curriculumId);
      const calculado = levelFromCoverage(coverage);
      const { level, regresion } = levelNeverGoesDown(calculado, student.currentLevel ?? null);
      if (regresion) {
        // El nivel no bajó, pero que las dos cuentas no coincidan es señal de
        // que faltan datos de progreso: se avisa en vez de esconderlo.
        warnings.push({
          code: "LEVEL_REGRESSION_BLOCKED", block: "matricula",
          message: `El cálculo dio ciclo ${calculado} y en ULima++ figura ${student.currentLevel}. `
            + "Se mantuvo el guardado: probablemente hay cursos de tu récord que no calzan con tu malla.",
        });
      }
      if (level !== null) {
        if (level >= 1 && level <= 10) {
          await this.repository.updateStudentLevel(tx, studentId, level);
        } else if (level > 10) {
          warnings.push({
            code: "LEVEL_OUT_OF_RANGE", block: "matricula",
            message: `El portal reporta nivel ${level}, fuera del rango 1..10; no se actualizó.`,
          });
        }
      }

      // Nombre: solo se completa si app_user.full_name está vacío (nunca el correo).
      await this.repository.fillFullNameIfEmpty(tx, userId, mat.data.studentName);

      if (imped.hasImpediment || imped.hasDebt) {
        const created = await this.repository.upsertImpedimentAlert(tx, studentId, imped.text);
        if (created) summary.alertsCreated++;
      }

      return p;
    });

    // Token re-firmado si esta importación otorgó un cargo. El rol viaja
    // DENTRO del JWT y hoy solo se calcula en el login, así que sin esto el
    // recién promovido no vería su pestaña hasta volver a entrar.
    //
    // El rol se relee de la BD ya confirmada, nunca se deriva del claim: quien
    // ya era delegado en otra sección no puede quedar degradado por haber sido
    // promovido a subdelegado en esta.
    let token: string | null = null;
    if (summary.representativesPromoted > 0 && this.auth) {
      const position = await this.repository.findActiveRepresentativePosition(studentId);
      if (position) token = await this.auth.reissueToken(userId, position);
    }

    return {
      period: { id: period.id, code: period.code, created: period.created },
      identity: {
        portalCode: mat.data.studentCode,
        fullName: mat.data.studentName,
        career: info.ok && info.data.careerName ? info.data.careerName : mat.data.careerName,
      },
      summary,
      warnings,
      token,
    };
  }
}
