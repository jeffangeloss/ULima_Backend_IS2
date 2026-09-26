import { HttpError } from "../../shared/errors/http-error.js";
import type { PortalClient } from "../../services/portal.client.js";
import {
  PortalSyncRepository, defaultPeriodDates, hasPublishedCalendar, pickBestRecordRow, progressStatusFor,
  shouldActivatePeriod, teacherCodeFor,
  levelFromCoverage, levelNeverGoesDown,
  academicWeekCount, resolveOfferingTotalHours, resolveAttendanceHours,
  type ProgressStatus, type Tx,
  careerNamesDiffer,
  courseColorHex,
} from "./portal-sync.repository.js";
import {
  parseAulaVirtual, parseCicloActivo, parseConsolidadoMatricula, parseHorario,
  parseInfoAcademica, parseSyllabusEntry,
  parseAulas, parseDelegados, parseAsistenciaCurso,
} from "./parsers/index.js";
// `parseRecordPage` y `recordRows` NO están en el barrel `./parsers/index.js`,
// que no se toca: `scripts/verificar-readme.py:68` cuenta sus `parse[A-Z]\w*`
// y el README cita esa cifra. Se importan del módulo concreto.
// `parseRecordAcademico` sale de la lista de arriba porque deja de usarse acá
// (`noUnusedLocals` rompería el build); sigue exportado para quien lo necesite.
import { parseRecordPage, recordRows } from "./parsers/record.js";
import {
  cleanupBlockers, evaluateRecordTrust, progressRemovedMessage,
} from "../academic-record/academic-record.logic.js";
// Vive en el seed porque de ahí sale `course_equivalence`, pero acá es otra
// cosa: los 12 códigos de Estudios Generales que se sabe que NO respaldan un
// electivo, y que por eso no bloquean la limpieza (RS-BE-23).
import { SIN_EQUIVALENCIA_CONOCIDA } from "../../db/seed/equivalencias.logic.js";
import { PORTAL_PATHS } from "../../services/portal.client.js";
import type {
  AsistenciaCurso, AsistenciaIdentificada, AulaMenu, DelegadosNomina,
  ImportResult, ImportSummary, PortalCookies, RecordRow, SyllabusEntry, SyncStatus, SyncWarning,
  WarningCode,
} from "./portal-sync.types.js";

/** Perfil de alumno tal como lo devuelve `findStudent`. */
export type StudentProfile = {
  id: number; userId: number; careerId: number; curriculumId: number;
  currentLevel: number | null; careerName: string;
};

/**
 * RS-BE-17. Crea la cuenta DENTRO de la transacción de la importación y
 * devuelve el perfil con la forma de `findStudent`, para que el resto del
 * import no distinga si el alumno ya existía.
 */
export type ProvisionFn = (
  tx: Tx,
  identidad: { studentCode: string; studentName: string; careerName: string },
) => Promise<StudentProfile>;

/**
 * RS-BE-18 ("todo o nada"). Comprobación final DENTRO de la transacción de la
 * importación, cuando el summary ya está completo y justo antes de que la
 * transacción cierre. Si lanza, `runInTransaction` revierte todo lo escrito
 * (incluida la cuenta que haya creado `provision`).
 */
export type ValidateFn = (summary: ImportSummary) => void;

const emptySummary = (): ImportSummary => ({
  coursesCreated: 0, teachersCreated: 0, sectionsCreated: 0, sectionsUpdated: 0,
  sessionsUpserted: 0, enrollmentsUpserted: 0, enrollmentsWithdrawn: 0,
  progressUpserted: 0, progressSkipped: 0, progressViaEquivalence: 0, progressRemoved: 0,
  alertsCreated: 0, syllabiUpserted: 0,
  claimsUpserted: 0, claimsDeleted: 0, representativesPromoted: 0, alertsDeleted: 0,
  attendanceUpdated: 0, attendanceSkipped: 0,
});

/**
 * RS-BE-48. Aviso de un aula que se arma al final de las fases del portal.
 * `mensaje` recibe «de <curso>/<sección>» o «del aula <aula>» y la etiqueta
 * sola, y lleva solo literales fijos y valores ya validados con una regex de
 * dígitos. `fase` e `i` fijan el orden del menú, que las descargas en paralelo
 * no respetan.
 */
type AvisoDeAula = {
  fase: 0 | 1; i: number;
  code: WarningCode; block: "asistencia" | "delegado";
  aula: AulaMenu;
  mensaje: (de: string, etiqueta: string) => string;
};

/** `approved` > `in_progress` > `failed`. `student_course_status` también tiene
 *  `withdrawn`, pero el récord académico nunca lo produce: `progressStatusFor`
 *  solo devuelve estos tres o `null`. */
const RANGO_PROGRESO: Record<ProgressStatus, number> = { approved: 3, in_progress: 2, failed: 1 };

/**
 * Desempate entre dos filas del récord que caen en el MISMO `curriculum_course`.
 * Solo es posible desde que hay segundo intento por equivalencia.
 *
 * 1. El match DIRECTO gana: si el alumno tiene en su récord el código viejo y el
 *    nuevo del mismo curso, manda lo que dice el código de la malla vigente.
 * 2. A igual procedencia, gana el MEJOR estado: aprobar la mitad de un curso
 *    fusionado no se pierde porque la otra mitad esté desaprobada.
 */
const ganaProgreso = (
  candidato: { status: ProgressStatus; directo: boolean },
  previo: { status: ProgressStatus; directo: boolean },
): boolean => {
  if (candidato.directo !== previo.directo) return candidato.directo;
  return RANGO_PROGRESO[candidato.status] > RANGO_PROGRESO[previo.status];
};

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
      reissueToken(
        userId: number,
        role: "delegate" | "subdelegate" | "student",
      ): Promise<string | null>;
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
    entrada: {
      cookies?: PortalCookies;
      credentials?: { password: string; passcode: string };
      /** RS-BE-29: `true` solo si el alumno aceptó la pantalla de consentimiento.
       *  Opcional para que `auth.service.ts` (registro) y las apps viejas sigan
       *  llamando igual que siempre. */
      consent?: boolean;
    },
    /**
     * Enganche de registro (RS-BE-17/RS-BE-18), opcional: sin él el
     * comportamiento es idéntico al de siempre. Ver `ProvisionFn`/`ValidateFn`.
     */
    provision?: ProvisionFn,
    validate?: ValidateFn,
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
      return await this.runImport(userId, studentId, sesion, entrada.consent === true, provision, validate);
    } finally {
      await this.client.logout(sesion);   // best effort, siempre
    }
  }

  private async runImport(
    userId: number, studentId: number, cookies: PortalCookies, consent: boolean,
    provision?: ProvisionFn, validate?: ValidateFn,
  ): Promise<ImportResult> {
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
    // Con hook de registro NO hay cuenta previa contra la cual comparar: el
    // portal ES la identidad. Sin hook, la comprobación sigue intacta — es lo
    // único que impide que alguien importe el ciclo de otra persona. En
    // ambos modos, de acá en adelante `userCode` es el código ya confirmado
    // (sin hook porque se acaba de verificar contra la cuenta; con hook
    // porque no hay cuenta previa y el portal ES la identidad).
    const userCode = mat.data.studentCode;
    if (!provision) {
      const accountCode = await this.repository.findUserCode(userId);
      if (!accountCode) throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
      if (userCode !== accountCode) {
        throw new HttpError(403, "La cuenta de miUlima no corresponde a tu usuario.", "PORTAL_IDENTITY_MISMATCH");
      }
    }

    // ── 3. Parsers restantes (degradan a warnings) ──────────────────────────
    const aula = parseAulaVirtual(layout);
    if (!aula.ok) warnings.push({ code: "PARSER_FAILED", block: "aula-virtual", message: aula.reason });
    const horario = parseHorario(layout);
    if (!horario.ok) warnings.push({ code: "PARSER_FAILED", block: "horario", message: horario.reason });
    // RS-BE-19/RS-BE-20: se lee la PÁGINA entera (tabla del récord, pie y filas
    // descartadas) y recién después se la reduce a las filas, que es lo único
    // que el resto de la importación usaba hasta hoy. `rec` conserva su forma y
    // su motivo de fallo exactos, así que nada de lo que sigue cambia.
    const recordPage = parseRecordPage(pages.record);
    const rec = recordRows(recordPage);
    if (!rec.ok) warnings.push({ code: "PARSER_FAILED", block: "record", message: rec.reason });
    const info = parseInfoAcademica(layout);

    // RS-BE-21: la confianza se evalúa SIEMPRE, con o sin consentimiento, y su
    // motivo va al log del servidor. El alumno NO recibe un aviso nuevo: no hay
    // nada que pueda hacer al respecto, y el resto de la importación —horario,
    // matrícula, malla y enrollment.final_grade— sigue exactamente igual.
    //
    // El log se emite SIEMPRE que el récord no sea de confianza, sin condición:
    // RS-BE-21 no la pone, y el caso más grave —la página no trae ninguna fila
    // legible: sesión caída, página de error con HTTP 200, récord truncado— es
    // justamente el que no puede quedar sin traza. El `PARSER_FAILED` no lo
    // sustituye: es un aviso al ALUMNO en la respuesta, no un registro en el
    // servidor, y no lleva el motivo de la regla de confianza.
    // Nunca lleva notas, nombres ni el código del alumno: este repo es público y
    // estas líneas terminan en los logs de Vercel.
    const confianza = evaluateRecordTrust(recordPage);
    if (!confianza.ok) console.warn("[portal-sync] récord no confiable:", confianza.reason);
    if (info.ok && info.data.unreadable.length) {
      console.warn("[portal-sync] información académica incompleta:", info.data.unreadable.join(", "));
    }
    // RS-BE-22/RS-BE-25/RS-BE-29: la ÚNICA condición para tocar las tres tablas
    // nuevas. Sin consentimiento o sin confianza, esta importación corre como la
    // de hoy y no llama a ninguno de los métodos nuevos del repositorio.
    const guardarRecord = consent && confianza.ok;

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
    // ── 3.6 Asistencia del Aula Virtual (RS-BE-15), FUERA de la transacción.
    // Fase HERMANA y SECUENCIAL a la de delegados, no fusionada: fusionarlas
    // llevaría el pico a 10 peticiones concurrentes sobre un solo JSESSIONID de
    // WebSphere, y no hay medición de cómo responde a eso.
    //
    // RS-BE-48. Corre ANTES que la de delegados porque el menú de lista no trae
    // el código del curso, y el aula es el mismo número en los tres paneles. Las
    // páginas de asistencia identifican cada aula, y ese mapa es el que usa
    // después la fase de delegados.
    //
    // Degrada igual que delegados: cada petición y cada parseo en su propio
    // try, y un fallo acá NUNCA aborta la importación. La asistencia es
    // secundaria y no puede borrar notas, horario ni matrícula.
    const asistenciaByCourse = new Map<string, { datos: AsistenciaCurso; leidaEn: Date }>();
    // Aula -> (curso, sección) según la identificación verificada de su página
    // de asistencia, que sale también cuando la página falla en los totales.
    const cursoPorAula = new Map<string, AsistenciaIdentificada>();
    // Los avisos de cada aula se arman al final, cuando ya terminaron todas las
    // fases, para nombrar el curso de un aula que su propia página no identifica.
    const avisosDeAula: AvisoDeAula[] = [];
    try {
      const sidebar = await this.client.fetchPage(PORTAL_PATHS.cursosAsistencia, cookies);
      const aulas = parseAulas(sidebar, "OpenAsistenciaAlumno");
      if (!aulas.ok) {
        warnings.push({ code: "PARSER_FAILED", block: "asistencia", message: aulas.reason });
      } else {
        await Promise.all(aulas.data.map(async (a, i) => {
          const aviso = (code: WarningCode, mensaje: AvisoDeAula["mensaje"]) =>
            avisosDeAula.push({ fase: 0, i, code, block: "asistencia", aula: a, mensaje });
          let html: string;
          try {
            html = await this.client.fetchPage(PORTAL_PATHS.asistenciaAlumno(a.aula), cookies);
          } catch {
            aviso("ASISTENCIA_UNAVAILABLE", (de) => `No se pudo traer la asistencia ${de}.`);
            return;
          }
          // RS-BE-58. El instante en que llega la respuesta, no el del UPDATE,
          // que ocurre recién dentro de la transacción.
          const leidaEn = new Date();
          // `userCode` ya se verificó contra `app_user`: si la página declara
          // otro alumno, el parser la rechaza sin imprimir ningún código.
          const parsed = parseAsistenciaCurso(html, a.aula, userCode);
          const id = parsed.identificado;
          // RS-BE-48. Si el menú trae una sección y la página declara otra, no
          // hay forma segura de saber cuál vale. El curso no se escribe y el
          // aula no entra al mapa.
          if (id && a.sectionCode !== null && a.sectionCode !== id.sectionCode) {
            aviso("PARSER_FAILED", () =>
              `La sección del menú no coincide con la de la página de asistencia del aula ${a.aula}.`);
            return;
          }
          if (id) cursoPorAula.set(a.aula, id);
          if (!parsed.ok) {
            aviso("PARSER_FAILED", (de) => `No se entendió la asistencia ${de}: ${parsed.reason}`);
            return;
          }
          asistenciaByCourse.set(`${parsed.data.courseCode}|${parsed.data.sectionCode}`, { datos: parsed.data, leidaEn });
        }));
      }
    } catch {
      warnings.push({
        code: "ASISTENCIA_UNAVAILABLE", block: "asistencia",
        message: "No se pudo abrir el panel de asistencia en miUlima.",
      });
    }

    /**
     * RS-BE-48. Curso y sección de un aula, en este orden, de los arreglos del
     * menú o de la identificación verificada de la página de asistencia de esa
     * misma aula. `null` cuando ninguna lo da. La importación no tiene fase de
     * notas, así que no hay un tercer panel que consultar.
     */
    const parDeAula = (a: AulaMenu): AsistenciaIdentificada | null =>
      a.courseCode !== null && a.sectionCode !== null
        ? { courseCode: a.courseCode, sectionCode: a.sectionCode }
        : (cursoPorAula.get(a.aula) ?? null);

    // ── 3.7 Delegados: sidebar + una nómina por aula, FUERA de la transacción.
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
        // RS-BE-48. Con arreglos rige la lectura de hoy. Con el menú de lista,
        // el par sale del mapa de la asistencia, y se consulta ANTES de pedir la
        // nómina, así que un aula sin curso conocido no gasta ninguna petición
        // ni escribe ningún claim. Un aula cuya sección del menú no coincide con
        // la del mapa corre la misma suerte.
        const identificadas: Array<{ a: AulaMenu; i: number; par: AsistenciaIdentificada }> = [];
        aulas.data.forEach((a, i) => {
          const par = parDeAula(a);
          if (!par || (a.courseCode === null && a.sectionCode !== null && a.sectionCode !== par.sectionCode)) {
            avisosDeAula.push({
              fase: 1, i, code: "PARSER_FAILED", block: "delegado", aula: a,
              mensaje: () => `No se pudo identificar el curso del aula ${a.aula}.`,
            });
            return;
          }
          identificadas.push({ a, i, par });
        });

        await Promise.all(identificadas.map(async ({ a, i, par }) => {
          const aviso = (mensaje: AvisoDeAula["mensaje"], code: WarningCode = "PARSER_FAILED") =>
            avisosDeAula.push({ fase: 1, i, code, block: "delegado", aula: a, mensaje });
          let html: string;
          try {
            html = await this.client.fetchPage(PORTAL_PATHS.nominaDelegado(a.aula), cookies);
          } catch {
            // El mensaje NUNCA lleva fragmentos del HTML del portal.
            aviso((de) => `No se pudo traer la nómina ${de}.`, "DELEGADOS_UNAVAILABLE");
            return;
          }
          // El instante de la RESPUESTA, no el del INSERT: la escritura ocurre
          // segundos después, dentro de la transacción, y `observed_at` es lo
          // que decide qué observación gana entre dos alumnos concurrentes.
          const observedAt = new Date();
          const parsed = parseDelegados(html, a.aula);
          if (!parsed.ok) {
            aviso((de) => `No se entendió la nómina ${de}: ${parsed.reason}`);
            return;
          }
          // Cargos que el portal marcó pero que vinieron inservibles. Se
          // reportan acá; el repositorio ya sabe que no debe borrarlos.
          for (const w of parsed.data.warnings ?? []) {
            aviso((_de, etiqueta) => `${etiqueta}: ${w.reason}`);
          }
          delegadosBySection.set(`${par.courseCode}|${par.sectionCode}`, { delegados: parsed.data, observedAt });
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
        //
        // RS-BE-48. Solo cuentan las aulas identificadas. Un aula sin curso
        // conocido ya tiene su propio aviso, y sumarla acá acusaría un cambio
        // del portal que nadie observó.
        const matriculado = new Set(mat.data.rows.map((r) => `${r.courseCode}|${r.sectionCode}`));
        const empatan = identificadas
          .filter(({ par }) => matriculado.has(`${par.courseCode}|${par.sectionCode}`)).length;
        if (identificadas.length > 0 && empatan === 0) {
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

    // RS-BE-48. Los avisos de cada aula se arman ahora, con todas las fases
    // terminadas, en el orden de cada menú. Con curso conocido nombran
    // `<curso>/<sección>` y sin él nombran el aula. Ningún aviso lleva `null`.
    avisosDeAula.sort((x, y) => x.fase - y.fase || x.i - y.i);
    for (const x of avisosDeAula) {
      const par = parDeAula(x.aula);
      const etiqueta = par ? `${par.courseCode}/${par.sectionCode}` : `aula ${x.aula.aula}`;
      const de = par ? `de ${etiqueta}` : `del aula ${x.aula.aula}`;
      warnings.push({ code: x.code, block: x.block, message: x.mensaje(de, etiqueta) });
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
      // RS-BE-17: el perfil se resuelve como primer paso DENTRO de la
      // transacción — con hook, `provision` recién crea la cuenta acá adentro
      // (si algo más abajo falla, se revierte con el resto). `userId`/
      // `studentId` pasan a los que devolvió el hook: el resto del import no
      // vuelve a distinguir si el alumno ya existía o se acaba de crear.
      let student: StudentProfile;
      if (provision) {
        student = await provision(tx, mat.data);
        userId = student.userId;
        studentId = student.id;
      } else {
        const found = await this.repository.findStudent(studentId);
        if (!found) throw new HttpError(422, "Perfil de alumno no encontrado.", "PORTAL_IDENTITY_UNVERIFIABLE");
        student = found;
      }
      // RS-BE-22: el candado va PRIMERO, y este es el primer punto donde
      // `studentId` ya es el definitivo en los dos modos (en el registro vale 0
      // hasta que `provision` devuelve el perfil, unas líneas más arriba).
      // Serializa dos importaciones del mismo alumno: el cliente corta a los
      // 90 s y el servidor sigue hasta 300 s, así que el alumno puede reintentar
      // mientras la primera todavía corre. Es `pg_advisory_xact_lock`: se suelta
      // solo cuando la transacción termina, confirme o revierta.
      if (guardarRecord) await this.repository.lockAcademicRecord(tx, studentId);
      if (careerNamesDiffer(mat.data.careerName, student.careerName)) {
        warnings.push({
          code: "CAREER_MISMATCH", block: "matricula",
          message: `El portal reporta "${mat.data.careerName}" y en ULima++ figura "${student.careerName}". No se modificó la carrera.`,
        });
      }

      const p = await this.repository.upsertPeriod(tx, ciclo.data.periodCode, activate);

      // Los datos de terceros mueren con su ciclo: es lo que hace defendible
      // guardarlos sin consentimiento. Va acá porque `upsertPeriod` es el
      // único cierre de ciclo que existe hoy en el repo (no hay cron).
      summary.claimsDeleted += await this.repository.deleteClaimsOfInactivePeriods(tx, p.id);
      // RS-BE-9: las horas del ciclo son `horas semanales x semanas`, y las
      // semanas salen del span real del período, no de un 16 fijo (2026-1 dura 17).
      const weeks = academicWeekCount(p.startDate, p.endDate);
      const touchedOfferingIds = new Set<number>();
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

        // Paso 7 (RS-BE-9): acá todavía no hay horario, así que el total sale de
        // la malla y, si el curso no está en ella, de los créditos. El paso 8.b
        // lo corrige después con el horario real.
        const { hours: offeringHours } = resolveOfferingTotalHours(
          { curriculumWeeklyHours: c.weeklyHours, credits: row.credits },
          weeks,
        );
        const off = await this.repository.upsertOffering(tx, p.id, c.id, offeringHours);
        touchedOfferingIds.add(off.id);

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

        // Horas de asistencia (RS-BE-15). Acá y no en un paso aparte porque
        // este es el único punto donde ya existe el `enrollment.id`. Si el
        // portal no reportó este curso, la fila NO se toca: nunca se escribe 0
        // por ausencia, que convertiría al alumno en `sin_datos` y borraría un
        // impedido legítimo.
        const asis = asistenciaByCourse.get(`${row.courseCode}|${row.sectionCode}`);
        if (asis) {
          const horas = resolveAttendanceHours(asis.datos);
          if (!horas.ok) {
            summary.attendanceSkipped++;
            warnings.push({
              code: "PARSER_FAILED", block: "asistencia",
              message: `No se escribió la asistencia de ${row.courseCode}/${row.sectionCode}: ${horas.reason}.`,
            });
          } else {
            // RS-BE-55 y RS-BE-58. `resolveAttendanceHours` ya cubre el CHECK
            // replicado en el WHERE, así que un UPDATE que no toca la fila solo
            // se debe a la guarda de lectura más reciente. Esa fila ya tiene
            // horas más nuevas y cuenta como actualizada (decisión 5).
            await this.repository.updateAttendanceHours(tx, enr.id, horas.hours, asis.leidaEn.toISOString());
            summary.attendanceUpdated++;
          }
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
        // Paso 8.b (RS-BE-9): recién ahora existen las sesiones, así que se
        // recalcula `total_hours` con el horario real. Pisa la estimación del
        // paso 7 aunque dé un número menor: el horario lo publica el portal.
        await this.repository.recomputeOfferingHoursFromSchedule(
          tx, [...touchedOfferingIds], weeks,
        );
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

        // 2b. SEGUNDO intento, SOLO con lo que sobró: la malla cambió al plan
        // 2026-1 y el récord es histórico, así que un alumno de ciclo alto trae
        // buena parte de sus cursos con códigos que ya no existen en
        // `curriculum_course` (26 de los 53 aprobados en el récord real de
        // 20235218). `course_equivalence` los mapea a la malla vigente.
        //
        // No se consulta si no sobró nada: sería un viaje de más DENTRO de la
        // transacción de la importación, que es justo lo que el lote evita.
        const sinMallaDirecta = conEstado.filter((x) => !ccIdPorCodigo.has(x.code));
        const ccIdPorLegado = sinMallaDirecta.length
          ? await this.repository.findEquivalentCurriculumCourseIds(
            tx, student.curriculumId, sinMallaDirecta.map((x) => x.code),
          )
          : new Map<string, number>();

        // 3. UNA sentencia: todo el progreso. Un curso que no resuelve por
        // ninguno de los dos caminos (convalidación, o código legado que aún no
        // está en `course_equivalence`) se omite igual que antes.
        //
        // Se colapsa por `curriculum_course_id` ANTES de escribir. Con el match
        // directo solo esto no podía pasar —el llamador ya agrupa por código—,
        // pero por equivalencia sí: el código viejo y el nuevo del mismo curso
        // en el mismo récord, o dos cursos viejos fusionados en uno. Y
        // `upsertProgressBatch` desempata con `distinct on (curriculum_course_id)`
        // SIN `order by`, así que dejarle dos filas con la misma clave sería un
        // ganador arbitrario.
        const mejorPorCurso = new Map<number, { status: ProgressStatus; directo: boolean }>();
        for (const { code, status } of conEstado) {
          const idDirecto = ccIdPorCodigo.get(code);
          const ccId = idDirecto ?? ccIdPorLegado.get(code);
          if (!ccId) { summary.progressSkipped++; continue; }
          const candidato = { status, directo: idDirecto !== undefined };
          const previo = mejorPorCurso.get(ccId);
          if (!previo || ganaProgreso(candidato, previo)) mejorPorCurso.set(ccId, candidato);
        }
        const aEscribir = [...mejorPorCurso].map(([curriculumCourseId, v]) => (
          { curriculumCourseId, status: v.status }
        ));
        // Cuenta CURSOS DE LA MALLA que entraron por equivalencia, no filas del
        // récord: así es comparable con `progressUpserted` y dos códigos viejos
        // fusionados en uno cuentan una vez.
        summary.progressViaEquivalence += [...mejorPorCurso.values()].filter((v) => !v.directo).length;
        // Se cuenta lo que la base dice haber escrito, no lo que se intentó.
        summary.progressUpserted += await this.repository.upsertProgressBatch(
          tx, studentId, student.curriculumId, aEscribir,
        );

        // RS-BE-23: limpieza de los electivos aprobados que el récord no
        // respalda. Corre acá —después de escribir el progreso y antes de
        // calcular el nivel— y solo con consentimiento y récord de confianza
        // (`guardarRecord`). La carga inicial de la base, anterior a
        // portal-sync, marcó como aprobados TODOS los electivos de los ciclos
        // ya cursados, y `upsertProgressBatch` nunca borra: sin esto esas
        // filas sobreviven a cualquier importación.
        //
        // El conjunto de respaldo se recalcula sobre TODAS las filas del
        // récord —con nota, sin nota o con una marca— y NO reutiliza
        // `ccIdPorCodigo`/`ccIdPorLegado`: esos solo cubren `conEstado`, del
        // que la fase de progreso ya sacó las filas sin nota numérica.
        // Reutilizarlos dejaría fuera del respaldo a un electivo aprobado con
        // una marca de convalidación, y esta misma limpieza lo borraría.
        if (guardarRecord) {
          const todos = [...new Set(rec.data.map((r) => r.courseCode))];
          const directos = await this.repository.findCurriculumCourseIds(
            tx, student.curriculumId, todos,
          );
          const restantes = todos.filter((c) => !directos.has(c));
          const legados = restantes.length
            ? await this.repository.findEquivalentCurriculumCourseIds(
              tx, student.curriculumId, restantes,
            )
            : new Map<string, number>();
          const resueltos = new Set([...directos.keys(), ...legados.keys()]);
          // "Si hay duda, no se borra" (decisión 7): un código aprobado que no
          // resuelve puede ser un electivo con un código viejo sin
          // equivalencia, y borrarlo sería definitivo.
          const bloqueos = cleanupBlockers(rec.data, resueltos, SIN_EQUIVALENCIA_CONOCIDA);
          if (bloqueos.length) {
            console.warn(
              "[portal-sync] limpieza de electivos omitida: códigos aprobados sin resolver:",
              bloqueos.join(", "),
            );
          } else {
            const respaldo = [...new Set([...directos.values(), ...legados.values()])];
            // Con el respaldo vacío la limpieza NO corre: `<> all('{}')` es
            // verdadero para toda fila y borraría todos los electivos
            // aprobados del alumno. El repository también se guarda de esto;
            // la guarda está en los dos lados a propósito.
            if (respaldo.length) {
              summary.progressRemoved += await this.repository.deleteUnbackedElectives(
                tx, studentId, student.curriculumId, respaldo,
              );
            }
          }
        }

        if (summary.progressSkipped > 0) {
          warnings.push({
            code: "PROGRESS_SKIPPED", block: "record",
            message: `${summary.progressSkipped} cursos del récord no están en tu malla (convalidaciones o códigos antiguos).`,
          });
        }
        if (summary.progressRemoved > 0) {
          warnings.push({
            code: "PROGRESS_REMOVED", block: "record",
            message: progressRemovedMessage(summary.progressRemoved),
          });
        }
      }

      // RS-BE-22 y RS-BE-25: la copia del récord, la foto acumulada y el resumen
      // por ciclo. Van DENTRO de la misma transacción y bajo el mismo candado de
      // arriba, así que si `validate` lanza (registro sin matrícula del ciclo
      // activo) se revierten con todo lo demás, y una importación concurrente del
      // mismo alumno espera en vez de pisar la copia a medio reemplazar.
      //
      // `rec.ok` ya está implícito en `guardarRecord` —un récord sin filas no es
      // de confianza—, pero el ternario deja explícito que acá nunca se escribe
      // una copia a medias.
      if (guardarRecord) {
        // El récord (esta copia) y el layout ("Información General"/"por
        // Período") son páginas DISTINTAS del portal: un rótulo que cambió en
        // el layout no dice nada sobre la confiabilidad del récord, así que
        // `replaceRecordEntries` se escribe siempre que `guardarRecord` sea
        // true, sin condición sobre `info`.
        await this.repository.replaceRecordEntries(tx, studentId, rec.ok ? rec.data : []);

        // La foto (`upsertAcademicSnapshot`) y el resumen por ciclo
        // (`replacePeriodSummaries`) sí dependen de que "Información General"
        // se haya podido leer. Si no —`!info.ok`, o el bloque general quedó en
        // `unreadable`—, NO se toca ninguna de las dos tablas: se conserva la
        // foto anterior con su `synced_at` de esa vez. Escribir acá pisaría el
        // PPA, la ubicación y los créditos de TODOS los que dieron su
        // consentimiento con nulos y una fecha de HOY, a la vez, y además
        // vaciaría el resumen del ciclo; el alumno vería una foto "fresca" con
        // todo en blanco en lugar de la buena. Un bloque "por período" ausente
        // SÍ es normal (alumno de primer ciclo sin ese bloque) y no bloquea la
        // foto: solo dice que el resumen del ciclo queda vacío, como ya hacía.
        const generalIlegible = !info.ok || info.data.unreadable.includes("general");
        if (generalIlegible) {
          console.warn(
            "[portal-sync] información general ilegible, no se actualiza la foto ni el resumen del ciclo:",
            info.ok ? info.data.unreadable.join(", ") : "bloque Información Académica no encontrado",
          );
        } else {
          await this.repository.upsertAcademicSnapshot(tx, studentId, info.data.general, new Date());
          await this.repository.replacePeriodSummaries(
            tx, studentId, info.data.period ? [info.data.period] : [],
          );
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

      // La alerta de "Impedimento de matrícula" se retiró el 2026-09-04: no le
      // servía a nadie y era el único dato de impedimento/deuda que la app
      // llegaba a PERSISTIR. `parseImpedimentos` sigue existiendo y probado,
      // pero ya no se invoca desde la importación: era su único consumidor.
      //
      // El borrado va acá y no en un script suelto porque la base solo es
      // alcanzable desde el backend desplegado: cada alumno se limpia la suya
      // en su próxima sincronización. Solo toca filas propias, así que respeta
      // la regla de "cada quien escribe lo suyo". Cuando ya no queden filas,
      // esta sentencia no hace nada y se puede quitar.
      summary.alertsDeleted += await this.repository.deleteImpedimentAlert(tx, studentId);

      // RS-BE-18 ("todo o nada"): último paso, con el summary ya completo. Si
      // `validate` lanza, la transacción entera revierte — la cuenta que haya
      // creado `provision` incluida. Sin `validate` no cambia nada de hoy.
      validate?.(summary);

      return p;
    });

    // Token re-firmado si esta importación otorgó un cargo. El rol viaja
    // DENTRO del JWT y hoy solo se calcula en el login, así que sin esto el
    // recién promovido no vería su pestaña hasta volver a entrar.
    //
    // El rol se relee de la BD ya confirmada, nunca se deriva del claim: quien
    // ya era delegado en otra sección no puede quedar degradado por haber sido
    // promovido a subdelegado en esta.
    // Se re-firma SIEMPRE, no solo al promover. Al empezar un ciclo nuevo el
    // ex delegado no promueve nada —`representativesPromoted` es 0— y con la
    // condición vieja conservaba el token de delegado hasta que venciera. La
    // degradación importa tanto como el ascenso.
    let token: string | null = null;
    if (this.auth) {
      const position = await this.repository.findActiveRepresentativePosition(studentId);
      token = await this.auth.reissueToken(userId, position ?? "student");
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
