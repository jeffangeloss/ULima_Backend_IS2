import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import type {
  EntryRecord,
  PeriodSummaryRecord,
  SnapshotRecord,
} from "./academic-record.types.js";

/** Fila cruda de `database.execute`: claves snake_case y valores sin convertir. */
type Fila = Record<string, unknown>;

/** El driver devuelve `numeric` como string y `smallint`/`integer` como number:
 *  `Number` cubre los dos casos. El null se conserva, porque 0 es un dato y
 *  "sin dato" es null (RS-BE-24 y §Contrato). */
const numero = (valor: unknown): number | null => (valor == null ? null : Number(valor));
const texto = (valor: unknown): string | null => (valor == null ? null : String(valor));

/**
 * Lecturas y borrado de las tres tablas del récord. SQL crudo, como el resto
 * de los repositories del repo. Todas las consultas filtran por `student_id` y
 * lo pasan como parámetro: el id lo pone el controller desde el token y nunca
 * se concatena en el texto de la consulta.
 */
export class AcademicRecordRepository {
  constructor(readonly database: typeof db) {}

  async findSnapshot(studentId: number): Promise<SnapshotRecord | null> {
    const filas = await this.database.execute(sql`
      select ppa, relative_position, convalidated_courses, convalidated_credits,
             approved_courses, approved_credits, credits_accumulated, credits_required, synced_at
      from student_academic_snapshot
      where student_id = ${studentId}
      limit 1
    `) as unknown as Fila[];

    const fila = filas[0];
    if (!fila) return null;

    return {
      ppa: numero(fila.ppa),
      relativePosition: texto(fila.relative_position),
      convalidatedCourses: numero(fila.convalidated_courses),
      convalidatedCredits: numero(fila.convalidated_credits),
      approvedCourses: numero(fila.approved_courses),
      approvedCredits: numero(fila.approved_credits),
      creditsAccumulated: numero(fila.credits_accumulated),
      creditsRequired: numero(fila.credits_required),
      // `timestamptz` también vuelve como string con este driver.
      syncedAt: new Date(fila.synced_at as string),
    };
  }

  async findEntries(studentId: number): Promise<EntryRecord[]> {
    const filas = await this.database.execute(sql`
      select period_code, course_code, course_name, attempt, credits,
             grade, grade_raw, section_code, observation
      from student_record_entry
      where student_id = ${studentId}
      order by period_code desc, id asc
    `) as unknown as Fila[];

    return filas.map((fila) => ({
      periodCode: String(fila.period_code),
      courseCode: String(fila.course_code),
      courseName: String(fila.course_name),
      attempt: Number(fila.attempt),
      credits: Number(fila.credits),
      grade: numero(fila.grade),
      gradeRaw: texto(fila.grade_raw),
      sectionCode: texto(fila.section_code),
      observation: texto(fila.observation),
    }));
  }

  async findPeriodSummaries(studentId: number): Promise<PeriodSummaryRecord[]> {
    const filas = await this.database.execute(sql`
      select period_code, average, relative_position, level,
             convalidated_courses, convalidated_credits,
             enrolled_courses, enrolled_credits,
             approved_courses, approved_credits,
             failed_courses, failed_credits
      from student_period_summary
      where student_id = ${studentId}
      order by period_code desc
    `) as unknown as Fila[];

    return filas.map((fila) => ({
      periodCode: String(fila.period_code),
      average: numero(fila.average),
      relativePosition: texto(fila.relative_position),
      level: numero(fila.level),
      convalidatedCourses: numero(fila.convalidated_courses),
      convalidatedCredits: numero(fila.convalidated_credits),
      enrolledCourses: numero(fila.enrolled_courses),
      enrolledCredits: numero(fila.enrolled_credits),
      approvedCourses: numero(fila.approved_courses),
      approvedCredits: numero(fila.approved_credits),
      failedCourses: numero(fila.failed_courses),
      failedCredits: numero(fila.failed_credits),
    }));
  }

  /**
   * RS-BE-27: borra las tres tablas del récord del alumno, todo o nada. No
   * toca `student_course_progress`: ese progreso lo necesita la malla y es de
   * otra funcionalidad. Si el alumno vuelve a sincronizar y acepta, la copia
   * se guarda otra vez.
   */
  async deleteAll(studentId: number): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.execute(sql`delete from student_record_entry where student_id = ${studentId}`);
      await tx.execute(sql`delete from student_period_summary where student_id = ${studentId}`);
      await tx.execute(sql`delete from student_academic_snapshot where student_id = ${studentId}`);
    });
  }
}
