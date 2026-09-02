import { HttpError } from "../../shared/errors/http-error.js";
import type { PortalClient } from "../../services/portal.client.js";
import {
  PortalSyncRepository, defaultPeriodDates, hasPublishedCalendar, pickBestRecordRow, progressStatusFor,
  shouldActivatePeriod, teacherCodeFor,
} from "./portal-sync.repository.js";
import {
  parseAulaVirtual, parseCicloActivo, parseConsolidadoMatricula, parseHorario,
  parseImpedimentos, parseInfoAcademica, parseRecordAcademico, parseSyllabusEntry,
} from "./parsers/index.js";
import type {
  ImportResult, ImportSummary, PortalCookies, RecordRow, SyllabusEntry, SyncStatus, SyncWarning,
} from "./portal-sync.types.js";

const emptySummary = (): ImportSummary => ({
  coursesCreated: 0, teachersCreated: 0, sectionsCreated: 0, sectionsUpdated: 0,
  sessionsUpserted: 0, enrollmentsUpserted: 0, enrollmentsWithdrawn: 0,
  progressUpserted: 0, progressSkipped: 0, alertsCreated: 0, syllabiUpserted: 0,
});

export class PortalSyncService {
  constructor(
    private readonly repository: PortalSyncRepository,
    private readonly client: PortalClient,
  ) {}

  async getStatus(studentId: number): Promise<SyncStatus> {
    const activePeriod = await this.repository.findActivePeriod();
    if (!activePeriod) return { activePeriod: null, enrollmentsInActivePeriod: 0, needsImport: true };
    const n = await this.repository.countEnrollmentsInPeriod(studentId, activePeriod.id);
    return { activePeriod, enrollmentsInActivePeriod: n, needsImport: n === 0 };
  }

  async importFromPortal(userId: number, studentId: number, cookies: PortalCookies): Promise<ImportResult> {
    try {
      return await this.runImport(userId, studentId, cookies);
    } finally {
      await this.client.logout(cookies);   // best effort, siempre
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
    if (mat.data.careerName && student.careerName && mat.data.careerName !== student.careerName) {
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

    // ── 4. Escrituras (todas dentro de UNA transacción) ─────────────────────
    // findActivePeriod se lee ANTES de abrir la transacción y se pasa adentro:
    // leerlo con this.repository dentro del callback corre sobre el pool, no
    // sobre `tx`, y devuelve una foto tomada FUERA de la transacción. Dos
    // alumnos importando al inicio de un ciclo pueden ambos leer "sin activo"
    // y ambos decidir activate=true; el segundo INSERT viola el índice único
    // parcial de período activo y responde 500. Leerlo antes no elimina la
    // carrera (haría falta un advisory lock) pero saca de en medio la segunda
    // conexión y la lectura obsoleta dentro de la propia transacción.
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

        // Nota final del récord para ESTE curso y ciclo, si ya existe.
        const finalGrade = rec.ok
          ? (rec.data.find((x) => x.periodCode === p.code && x.courseCode === row.courseCode)?.grade ?? null)
          : null;
        await this.repository.upsertEnrollment(tx, studentId, sec.id, finalGrade);
        summary.enrollmentsUpserted++;
      }

      // Un curso sin sílabo es normal (no todo curso publica uno) y NO se
      // advierte por curso; solo se avisa si NINGÚN curso de este ciclo trajo
      // sílabo, con una única advertencia agregada.
      if (summary.syllabiUpserted === 0) {
        warnings.push({
          code: "SYLLABUS_UNAVAILABLE", block: "silabo",
          message: "El portal no publicó sílabo para ningún curso de este ciclo.",
        });
      }

      if (horario.ok) {
        for (const s of horario.data) {
          const sectionId = sectionIdByCourse.get(s.courseCode);
          if (!sectionId) continue;
          await this.repository.upsertScheduleSession(tx, sectionId, s);
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
        for (const [code, rows] of byCourse) {
          const best = pickBestRecordRow(rows);
          if (!best) continue;
          const status = progressStatusFor(best.grade, best.periodCode === p.code);
          if (!status) { summary.progressSkipped++; continue; }
          const ccId = await this.repository.findCurriculumCourseId(tx, student.curriculumId, code);
          if (!ccId) { summary.progressSkipped++; continue; }
          await this.repository.upsertProgress(tx, studentId, student.curriculumId, ccId, status);
          summary.progressUpserted++;
        }
        if (summary.progressSkipped > 0) {
          warnings.push({
            code: "PROGRESS_SKIPPED", block: "record",
            message: `${summary.progressSkipped} cursos del récord no están en tu malla (convalidaciones o códigos antiguos).`,
          });
        }
      }

      // Nivel del alumno: el ciclo del curso obligatorio más bajo que aún le
      // falta (pendiente o cursándolo). Se calcula DESPUÉS del loop de progreso
      // de arriba para ver el progreso que esta misma importación acaba de
      // escribir. null = ya aprobó todos los obligatorios; no se toca nada.
      const level = await this.repository.findStudentLevel(tx, studentId, student.curriculumId);
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

    return {
      period: { id: period.id, code: period.code, created: period.created },
      identity: {
        portalCode: mat.data.studentCode,
        fullName: mat.data.studentName,
        career: info.ok && info.data.careerName ? info.data.careerName : mat.data.careerName,
      },
      summary,
      warnings,
    };
  }
}
