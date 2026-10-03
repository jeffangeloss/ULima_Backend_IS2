import type { EventBus } from "../../events/index.js";
import type { GradesRepository } from "./grades.repository.js";
import { calcularPromedioPonderado, esUrlDeDrive, sumaDePesos } from "./grades.logic.js";
import type { LectorDelModo } from "../app-setting/modo-estatico.lector.js";
import { construirVistaUlima } from "./grades-ulima.logic.js";
import type {
  NotaInput,
  CalculateAverageResponse,
  SaveNotasRequest,
  LoadNotasResponse,
  CursoNotasEntry,
  UlimaGradesView,
} from "./grades.types.js";

export class GradesService {
  constructor(
    readonly repository: GradesRepository,
    readonly events: EventBus,
    /** RF-EST-7 y RF-IRM-3. Lector del modo, consultado en cada `getCoursesAndSyllabi`. En modo
     *  estático solo se publican enlaces de sílabo de Drive. Sin lector, se publican tal cual. */
    private readonly opciones: { modoEstatico?: LectorDelModo } = {},
  ) {}

  async getCoursesAndSyllabi(code?: string) {
    const rows = await this.repository.findCoursesAndAssessments(code);
    const soloDrive = (await this.opciones.modoEstatico?.()) ?? false;

    const cursos = new Map<string, any>();
    const syllabi = new Map<string, any>();

    for (const row of rows) {
      const courseId = String(row.curriculum_course_id ?? row.course_id);
      if (!cursos.has(courseId)) {
        cursos.set(courseId, {
          id: courseId,
          nombre: row.course_name,
          ciclo: row.period_code,
          silaboUrl: soloDrive && !esUrlDeDrive(row.syllabus_url) ? null : (row.syllabus_url ?? null),
          secciones: [],
        });
      }

      if (row.section_id != null) {
        const sectionId = String(row.section_id);
        const course = cursos.get(courseId);
        if (!course.secciones.some((s: any) => s.idSeccion === sectionId)) {
          course.secciones.push({
            idSeccion: sectionId,
            codigoSeccion: row.section_code ?? "",
          });
        }

        if (!syllabi.has(sectionId)) {
          syllabi.set(sectionId, {
            cursoId: sectionId,
            cursoNombre: row.course_name,
            evaluaciones: [],
          });
        }

        if (row.assessment_id != null) {
          const syllabus = syllabi.get(sectionId);
          if (!syllabus.evaluaciones.some((e: any) => e.id === String(row.assessment_id))) {
            syllabus.evaluaciones.push({
              id: String(row.assessment_id),
              nombre: row.assessment_name ?? row.assessment_code ?? "",
              sigla: row.assessment_code ?? "",
              peso: Number(row.assessment_weight ?? 0),
              tipo: row.assessment_type ?? "",
            });
          }
        }
      }
    }

    return { cursos: [...cursos.values()], syllabi: [...syllabi.values()] };
  }

  calculateAverage(notas: NotaInput[]): CalculateAverageResponse {
    return {
      promedio: calcularPromedioPonderado(notas),
      sumaPesos: sumaDePesos(notas),
    };
  }

  async saveNotas(studentId: number, body: SaveNotasRequest): Promise<void> {
    for (const curso of body.cursos) {
      const enrollmentId = await this.repository.findEnrollmentId(studentId, curso.sectionId);
      if (enrollmentId == null) continue;

      for (const nota of curso.notas) {
        await this.repository.upsertScore(enrollmentId, nota.assessmentId, nota.valor);
      }
    }
  }

  async deleteNota(studentId: number, sectionId: number, assessmentId: number): Promise<void> {
    const enrollmentId = await this.repository.findEnrollmentId(studentId, sectionId);
    if (enrollmentId == null) return;
    await this.repository.deleteScore(enrollmentId, assessmentId);
  }

  async loadNotas(studentId: number): Promise<LoadNotasResponse> {
    const rows = await this.repository.findScoresByStudentId(studentId);

    const grupos = new Map<number, CursoNotasEntry>();

    for (const row of rows) {
      if (!grupos.has(row.section_id)) {
        grupos.set(row.section_id, { sectionId: row.section_id, notas: [] });
      }
      const grupo = grupos.get(row.section_id)!;
      grupo.notas.push({
        assessmentId: row.assessment_id,
        valor: row.value != null ? Number(row.value) : null,
      });
    }

    return { cursos: [...grupos.values()] };
  }

  /** RS-BE-57. Notas de la ULima del propio alumno. */
  async getUlimaGrades(studentId: number): Promise<UlimaGradesView> {
    return construirVistaUlima(await this.repository.findUlimaGrades(studentId));
  }
}
