import { HttpError } from "../../shared/errors/http-error.js";
import type { PortalClient } from "../../services/portal.client.js";
import {
  PortalSyncRepository, periodCodeIsNewer, pickBestRecordRow, progressStatusFor, teacherCodeFor,
} from "./portal-sync.repository.js";
import {
  parseAulaVirtual, parseCicloActivo, parseConsolidadoMatricula, parseHorario,
  parseImpedimentos, parseInfoAcademica, parseRecordAcademico,
} from "./parsers/index.js";
import type {
  ImportResult, ImportSummary, PortalCookies, RecordRow, SyncStatus, SyncWarning,
} from "./portal-sync.types.js";

const emptySummary = (): ImportSummary => ({
  coursesCreated: 0, teachersCreated: 0, sectionsCreated: 0, sectionsUpdated: 0,
  sessionsUpserted: 0, enrollmentsUpserted: 0, enrollmentsWithdrawn: 0,
  progressUpserted: 0, progressSkipped: 0, alertsCreated: 0,
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

    // ── 4. Escrituras (todas dentro de UNA transacción) ─────────────────────
    const period = await this.repository.runInTransaction(async (tx) => {
      const active = await this.repository.findActivePeriod();
      const activate = periodCodeIsNewer(ciclo.data.periodCode, active?.code ?? null);
      const p = await this.repository.upsertPeriod(tx, ciclo.data.periodCode, activate);
      if (p.created) {
        await this.repository.ensureAcademicWeeks(tx, p.id, p.startDate);
        warnings.push({
          code: "PERIOD_DATES_DEFAULTED", block: "periodo",
          message: `Se creó el período ${p.code} con fechas por defecto; Sistemas debe corregirlas.`,
        });
      }

      const sectionIdByCourse = new Map<string, number>();
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
        const sec = await this.repository.upsertSection(tx, off.id, row.sectionCode, t.id);
        if (sec.created) summary.sectionsCreated++; else summary.sectionsUpdated++;
        sectionIdByCourse.set(row.courseCode, sec.id);

        // Nota final del récord para ESTE curso y ciclo, si ya existe.
        const finalGrade = rec.ok
          ? (rec.data.find((x) => x.periodCode === p.code && x.courseCode === row.courseCode)?.grade ?? null)
          : null;
        await this.repository.upsertEnrollment(tx, studentId, sec.id, finalGrade);
        summary.enrollmentsUpserted++;
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
        tx, studentId, p.id, [...sectionIdByCourse.values()],
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

      // Nivel del alumno, del consolidado del ciclo importado.
      const level = Math.max(0, ...mat.data.rows.map((r) => r.level));
      if (level >= 1 && level <= 10) {
        await this.repository.updateStudentLevel(tx, studentId, level);
      } else if (level > 10) {
        warnings.push({
          code: "LEVEL_OUT_OF_RANGE", block: "matricula",
          message: `El portal reporta nivel ${level}, fuera del rango 1..10; no se actualizó.`,
        });
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
