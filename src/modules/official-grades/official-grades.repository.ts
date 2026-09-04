import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";

export class OfficialGradesRepository {
  constructor(readonly database: typeof db) {}

  async findActivePeriodId(): Promise<number> {
    const rows = await this.database.execute(sql`
      select id from academic_period where is_active = true limit 1
    `) as unknown as Array<{ id: number }>;
    if (!rows[0]) throw new Error("No hay período académico activo");
    return Number(rows[0].id);
  }

  // ¿El docente es el PROFESOR TITULAR de la sección? Solo el titular califica;
  // el JP (jp_id) NO sube notas oficiales (da asesorías, no calificaciones).
  async teacherIsSectionProfesor(teacherId: number, sectionId: number): Promise<boolean> {
    const rows = await this.database.execute(sql`
      select 1 from section
      where id = ${sectionId} and teacher_id = ${teacherId}
      limit 1
    `) as unknown as Array<unknown>;
    return rows.length > 0;
  }

  // Secciones del período activo que el docente CALIFICA: solo donde es profesor
  // titular (teacher_id). El JP no aparece aquí (no sube notas).
  async findTeacherSections(teacherId: number, periodId: number) {
    return await this.database.execute(sql`
      select
        sec.id as "sectionId",
        c.name as "courseName",
        sec.code as "sectionCode",
        'Profesor' as "rol"
      from section sec
      join course_offering co on co.id = sec.course_offering_id and co.academic_period_id = ${periodId}
      join course c on c.id = co.course_id
      where sec.teacher_id = ${teacherId}
      order by c.name, sec.code
    `) as unknown as Array<{ sectionId: number; courseName: string; sectionCode: string; rol: "Profesor" | "JP" }>;
  }

  // Alumnos matriculados (no retirados) de la sección.
  async findSectionStudents(sectionId: number) {
    return await this.database.execute(sql`
      select
        e.id as "enrollmentId",
        u.code as "code",
        u.full_name as "fullName"
      from enrollment e
      join student st on st.id = e.student_id
      join app_user u on u.id = st.user_id
      where e.section_id = ${sectionId} and e.status <> 'withdrawn'
      order by u.full_name
    `) as unknown as Array<{ enrollmentId: number; code: string; fullName: string }>;
  }

  // Evaluaciones del sílabo de la sección.
  async findSectionAssessments(sectionId: number) {
    return await this.database.execute(sql`
      select
        a.id as "assessmentId",
        a.code as "code",
        a.name as "name",
        a.weight as "weight",
        a.week_number as "weekNumber"
      from assessment a
      join syllabus sy on sy.id = a.syllabus_id
      join course_offering co on co.id = sy.course_offering_id
      join section sec on sec.course_offering_id = co.id
      where sec.id = ${sectionId}
      order by a.week_number, a.code
    `) as unknown as Array<{ assessmentId: number; code: string; name: string; weight: string; weekNumber: number }>;
  }

  // Notas oficiales ya cargadas para las matrículas de la sección.
  async findSectionScores(sectionId: number) {
    return await this.database.execute(sql`
      select ss.enrollment_id as "enrollmentId", ss.assessment_id as "assessmentId", ss.value as "value"
      from student_score ss
      join enrollment e on e.id = ss.enrollment_id
      where e.section_id = ${sectionId} and ss.value is not null
    `) as unknown as Array<{ enrollmentId: number; assessmentId: number; value: string }>;
  }

  // IDs válidos de matrícula (no retirada) de la sección — para validar escrituras.
  async findSectionEnrollmentIds(sectionId: number): Promise<Set<number>> {
    const rows = await this.database.execute(sql`
      select id from enrollment where section_id = ${sectionId} and status <> 'withdrawn'
    `) as unknown as Array<{ id: number }>;
    return new Set(rows.map((r) => Number(r.id)));
  }

  // IDs válidos de evaluación de la sección — para validar escrituras.
  async findSectionAssessmentIds(sectionId: number): Promise<Set<number>> {
    const rows = await this.database.execute(sql`
      select a.id
      from assessment a
      join syllabus sy on sy.id = a.syllabus_id
      join course_offering co on co.id = sy.course_offering_id
      join section sec on sec.course_offering_id = co.id
      where sec.id = ${sectionId}
    `) as unknown as Array<{ id: number }>;
    return new Set(rows.map((r) => Number(r.id)));
  }

  async upsertScore(enrollmentId: number, assessmentId: number, value: number) {
    await this.database.execute(sql`
      insert into student_score (enrollment_id, assessment_id, value)
      values (${enrollmentId}, ${assessmentId}, ${value})
      on conflict (enrollment_id, assessment_id)
      do update set value = excluded.value
    `);
  }

  // Notas oficiales del alumno (todas sus matrículas), con peso de cada evaluación.
  /**
   * Notas oficiales del alumno, SOLO del período que se le pasa.
   *
   * `enrollment` no tiene columna de período: se resuelve por el join con
   * `course_offering`. Sin el filtro, la consulta devuelve las evaluaciones de
   * todos los ciclos que el alumno haya cursado y el cliente pondera notas de
   * ciclos distintos como si fueran un solo curso.
   */
  async findStudentOfficialScores(studentId: number, periodId: number) {
    return await this.database.execute(sql`
      select
        sec.id as "sectionId",
        c.name as "courseName",
        sec.code as "sectionCode",
        a.id as "assessmentId",
        a.code as "code",
        a.name as "name",
        a.weight as "weight",
        ss.value as "value"
      from enrollment e
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
        and co.academic_period_id = ${periodId}
      join course c on c.id = co.course_id
      join syllabus sy on sy.course_offering_id = co.id
      join assessment a on a.syllabus_id = sy.id
      left join student_score ss on ss.enrollment_id = e.id and ss.assessment_id = a.id
      where e.student_id = ${studentId} and e.status <> 'withdrawn'
      order by c.name, sec.code, a.week_number, a.code
    `) as unknown as Array<{
      sectionId: number; courseName: string; sectionCode: string;
      assessmentId: number; code: string; name: string; weight: string; value: string | null;
    }>;
  }
}
