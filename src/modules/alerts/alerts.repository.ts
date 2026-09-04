import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";

export interface EnrollmentWithScore {
  enrollment_id: number;
  course_id: number;
  course_name: string;
  section_code: string | null;
  assessment_id: number | null;
  assessment_weight: string | null;
  score_value: string | null;
}

export interface StoredAlert {
  id: number;
  studentId: number;
  type: "academic_risk" | "high_load";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  courseName?: string;
  sectionCode?: string;
}

export class AlertsRepository {
  constructor(readonly database: typeof db) {}

  async getActiveEnrollmentsWithScores(studentId: number): Promise<EnrollmentWithScore[]> {
    // Se filtra por período académico activo para evitar que evaluaciones de
    // semestres anteriores generen alertas de cursos que el alumno ya no cursa.
    return (await this.database.execute(sql`
      select
        e.id as enrollment_id,
        c.id as course_id,
        c.name as course_name,
        sec.code as section_code,
        a.id as assessment_id,
        a.weight as assessment_weight,
        ss.value as score_value
      from enrollment e
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true
      join course c on c.id = co.course_id
      left join syllabus sy on sy.course_offering_id = co.id
      left join assessment a on a.syllabus_id = sy.id
      left join student_score ss on ss.assessment_id = a.id and ss.enrollment_id = e.id
      where e.student_id = ${studentId}
        and e.status = 'active'
    `)) as unknown as EnrollmentWithScore[];
  }

  async getHighLoadWeeks(studentId: number): Promise<Array<{ week_number: number; assessment_count: number }>> {
    // También filtrado por período activo para evitar semanas de períodos pasados.
    return (await this.database.execute(sql`
      select
        a.week_number,
        count(a.id) as assessment_count
      from enrollment e
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true
      join syllabus sy on sy.course_offering_id = co.id
      join assessment a on a.syllabus_id = sy.id
      where e.student_id = ${studentId}
        and e.status = 'active'
      group by a.week_number
      having count(a.id) >= 3
    `)) as unknown as Array<{ week_number: number; assessment_count: number }>;
  }

  async getAlerts(studentId: number, since?: Date): Promise<StoredAlert[]> {
    const rows = await this.database.execute(sql`
      select 
        al.id, 
        al.student_id as "studentId", 
        al.type, 
        al.title, 
        al.message, 
        al.is_read as "isRead", 
        al.created_at as "createdAt"
      from alert al
      where al.student_id = ${studentId}
        ${since ? sql`and al.created_at >= ${since.toISOString()}` : sql``}
        -- "Impedimento de matrícula" se retiró el 2026-09-04 por no serle útil
        -- a nadie. Se excluye acá y no solo al borrarla durante la importación:
        -- el borrado obliga a cada alumno a sincronizar para dejar de verla, y
        -- mientras tanto le sigue apareciendo. Con este predicado desaparece
        -- para todos de inmediato. Cuando ya no queden filas, sobra.
        and al.title <> 'Impedimento de matrícula'
        and (
          al.type != 'academic_risk'
          or (al.title not like 'Riesgo Académico: %' and al.title not like 'Alerta de inasistencias - %')
          or exists (
            select 1
            from enrollment e
            join section sec on sec.id = e.section_id
            join course_offering co on co.id = sec.course_offering_id
            join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true
            join course c on c.id = co.course_id
            where e.student_id = al.student_id
              and e.status = 'active'
              and (
                al.title = 'Riesgo Académico: ' || c.name
                or al.title = 'Alerta de inasistencias - ' || c.name
              )
          )
        )
      order by al.created_at desc
    `) as unknown as any[];

    return rows.map(r => ({
      id: Number(r.id),
      studentId: Number(r.studentId),
      type: r.type as "academic_risk" | "high_load",
      title: String(r.title),
      message: String(r.message),
      isRead: Boolean(r.isRead),
      createdAt: new Date(r.createdAt),
    }));
  }

  /** Retorna la fecha de inicio del período académico activo, o null si no hay ninguno. */
  async getActivePeriodStart(): Promise<Date | null> {
    const rows = await this.database.execute(sql`
      select start_date::text as start_date from academic_period where is_active = true limit 1
    `) as unknown as Array<{ start_date: string }>;
    return rows[0]?.start_date ? new Date(rows[0].start_date) : null;
  }

  async findAlertByTitle(studentId: number, title: string): Promise<boolean> {
    const rows = await this.database.execute(sql`
      select id
      from alert
      where student_id = ${studentId}
        and title = ${title}
      limit 1
    `) as unknown as any[];
    return rows.length > 0;
  }

  async createAlert(studentId: number, type: "academic_risk" | "high_load", title: string, message: string): Promise<void> {
    await this.database.execute(sql`
      insert into alert (student_id, type, title, message, is_read, created_at)
      values (${studentId}, ${type}, ${title}, ${message}, false, now())
    `);
  }

  async markAlertAsRead(studentId: number, alertId: number): Promise<boolean> {
    const result = await this.database.execute(sql`
      update alert
      set is_read = true
      where id = ${alertId}
        and student_id = ${studentId}
      returning id
    `) as unknown as any[];
    return result.length > 0;
  }
}

