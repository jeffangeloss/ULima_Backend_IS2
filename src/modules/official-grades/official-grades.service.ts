import type { EventBus } from "../../events/index.js";
import type { OfficialGradesRepository } from "./official-grades.repository.js";
import type { OfficialScoreEntry } from "./official-grades.schemas.js";
import type {
  SectionGradingGrid,
  StudentOfficialCourse,
  TeacherGradingSection,
} from "./official-grades.types.js";
import { HttpError } from "../../shared/errors/http-error.js";

export class OfficialGradesService {
  constructor(
    readonly repository: OfficialGradesRepository,
    readonly events: EventBus,
  ) {}

  // ─── Docente ───────────────────────────────────────────────────────────────

  async getTeacherSections(teacherId: number): Promise<TeacherGradingSection[]> {
    const periodId = await this.repository.findActivePeriodId();
    const rows = await this.repository.findTeacherSections(teacherId, periodId);
    return rows.map((r) => ({
      sectionId: Number(r.sectionId),
      courseName: r.courseName,
      sectionCode: r.sectionCode,
      rol: r.rol,
    }));
  }

  // Solo el PROFESOR TITULAR califica: leer la grilla y guardar notas oficiales
  // exige ser teacher_id de la sección. El JP (jp_id) recibe 403 (no sube notas).
  private async assertOwnership(teacherId: number, sectionId: number) {
    const isProfesor = await this.repository.teacherIsSectionProfesor(teacherId, sectionId);
    if (!isProfesor) {
      throw new HttpError(403, "Solo el profesor titular puede calificar esta sección.", "NOT_SECTION_PROFESSOR");
    }
  }

  async getSectionGrid(teacherId: number, sectionId: number): Promise<SectionGradingGrid> {
    await this.assertOwnership(teacherId, sectionId);
    const [students, assessments, scores] = await Promise.all([
      this.repository.findSectionStudents(sectionId),
      this.repository.findSectionAssessments(sectionId),
      this.repository.findSectionScores(sectionId),
    ]);
    return {
      sectionId,
      students: students.map((s) => ({
        enrollmentId: Number(s.enrollmentId),
        code: s.code,
        fullName: s.fullName,
      })),
      assessments: assessments.map((a) => ({
        assessmentId: Number(a.assessmentId),
        code: a.code,
        name: a.name,
        weight: Number(a.weight),
        weekNumber: Number(a.weekNumber),
      })),
      scores: scores.map((s) => ({
        enrollmentId: Number(s.enrollmentId),
        assessmentId: Number(s.assessmentId),
        value: Number(s.value),
      })),
    };
  }

  // El profesor califica varias notas de su sección. Valida ownership y que cada
  // (matrícula, evaluación) pertenezca a la sección; valida TODO antes de escribir.
  async saveSectionScores(teacherId: number, sectionId: number, scores: OfficialScoreEntry[]): Promise<SectionGradingGrid> {
    await this.assertOwnership(teacherId, sectionId);

    const [validEnrollments, validAssessments] = await Promise.all([
      this.repository.findSectionEnrollmentIds(sectionId),
      this.repository.findSectionAssessmentIds(sectionId),
    ]);

    for (const s of scores) {
      if (!validEnrollments.has(s.enrollmentId)) {
        throw new HttpError(404, `La matrícula ${s.enrollmentId} no pertenece a esta sección.`, "ENROLLMENT_NOT_IN_SECTION");
      }
      if (!validAssessments.has(s.assessmentId)) {
        throw new HttpError(404, `La evaluación ${s.assessmentId} no pertenece a esta sección.`, "ASSESSMENT_NOT_IN_SECTION");
      }
    }

    for (const s of scores) {
      await this.repository.upsertScore(s.enrollmentId, s.assessmentId, s.value);
    }

    return this.getSectionGrid(teacherId, sectionId);
  }

  // ─── Alumno ──────────────────────────────────────────────────────────────

  // Notas oficiales del alumno agrupadas por curso/sección. La nota final la
  // calcula el cliente por ponderación (Σ nota×peso/100), igual que la calculadora.
  async getMyOfficialCourses(studentId: number): Promise<StudentOfficialCourse[]> {
    const periodId = await this.repository.findActivePeriodId();
    const rows = await this.repository.findStudentOfficialScores(studentId, periodId);
    const bySection = new Map<number, StudentOfficialCourse>();
    for (const r of rows) {
      const sectionId = Number(r.sectionId);
      let course = bySection.get(sectionId);
      if (!course) {
        course = {
          sectionId,
          courseName: r.courseName,
          sectionCode: r.sectionCode,
          assessments: [],
        };
        bySection.set(sectionId, course);
      }
      course.assessments.push({
        assessmentId: Number(r.assessmentId),
        code: r.code,
        name: r.name,
        weight: Number(r.weight),
        value: r.value == null ? null : Number(r.value),
      });
    }
    return [...bySection.values()];
  }
}
