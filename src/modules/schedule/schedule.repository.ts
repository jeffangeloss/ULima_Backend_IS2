import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";

export type RawSessionRow = {
  section_id: number;
  section_code: string;
  teacher_code: string | null;
  course_id: number;
  course_name: string;
  attended_hours: string;
  absent_hours: string;
  total_hours: string;
  session_id: number | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  classroom: string | null;
  color_hex: string | null;
};

export type RawAssessmentRow = {
  course_id: number;
  course_name: string;
  section_id: number;
  section_code: string;
  assessment_id: number;
  assessment_name: string;
  assessment_code: string;
  assessment_week_number: number;
  assessment_weight: string;
  assessment_type: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  classroom: string | null;
  color_hex: string | null;
};

export type RawWeekRow = {
  week_number: number;
  start_date: string;
  end_date: string;
};

export type RawPeriodDatesRow = {
  start_date: string;
  end_date: string;
};

const toUTCDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map((part) => parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
};

const formatUTCDate = (date: Date): string =>
  `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;

/**
 * Deriva semanas académicas de 7 días a partir de las fechas propias del
 * período (`academic_period.start_date`/`end_date`) para cuando `academic_week`
 * todavía no tiene filas para él — p. ej. un período que portal-sync creó con
 * fechas por defecto antes de que se le carguen sus semanas reales, o uno
 * cargado a mano sin ese paso.
 *
 * Mismo criterio que `academicWeekCount`/`ensureAcademicWeeks` en
 * `portal-sync.repository.ts` (reimplementado aquí para no acoplar los dos
 * módulos): la cantidad de semanas es `ceil((endDate - startDate) / 7)`,
 * mínimo 1, así que la última semana generada no empieza después de
 * `endDate`. Con el calendario publicado de 2026-2 (24-ago a 14-dic, span
 * exacto de 112 días = 16 × 7) da exactamente 16 semanas, igual que
 * `academicWeekCount("2026-08-24", "2026-12-14")`.
 */
export const deriveWeeksFromPeriodDates = (startDate: string, endDate: string): RawWeekRow[] => {
  const start = toUTCDate(startDate);
  const end = toUTCDate(endDate);
  const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
  const weekCount = Math.max(1, Math.ceil(spanDays / 7));

  const weeks: RawWeekRow[] = [];
  for (let i = 0; i < weekCount; i++) {
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weeks.push({
      week_number: i + 1,
      start_date: formatUTCDate(weekStart),
      end_date: formatUTCDate(weekEnd),
    });
  }

  return weeks;
};

// Sin catch de rescate: un fallo de BD se propaga (500 real) en vez de simular
// horarios/notas/conteos vacíos con 200. Ver docs/AUDITORIA_TECNICA.md §6.1.
export class ScheduleRepository {
  constructor(readonly database: typeof db) {}

  async findActiveEnrollmentsWithSessions(studentId: number): Promise<RawSessionRow[]> {
    return (await this.database.execute(sql`
      select
        sec.id as section_id,
        sec.code as section_code,
        t.teacher_code,
        c.id as course_id,
        c.name as course_name,
        e.attended_hours,
        e.absent_hours,
        e.total_hours,
        ss.id as session_id,
        ss.day_of_week,
        ss.start_time,
        ss.end_time,
        ss.classroom,
        ss.color_hex
      from enrollment e
      join section sec on sec.id = e.section_id
      join teacher t on t.id = sec.teacher_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true
      join course c on c.id = co.course_id
      left join schedule_session ss on ss.section_id = sec.id
      where e.student_id = ${studentId}
        and e.status = 'active'
      order by ss.day_of_week, ss.start_time, c.name
    `)) as unknown as RawSessionRow[];
  }

  async findActiveSyllabiAndAssessments(studentId: number): Promise<RawAssessmentRow[]> {
    return (await this.database.execute(sql`
      select
        c.id as course_id,
        c.name as course_name,
        sec.id as section_id,
        sec.code as section_code,
        a.id as assessment_id,
        a.name as assessment_name,
        a.code as assessment_code,
        a.week_number as assessment_week_number,
        a.weight as assessment_weight,
        at.name as assessment_type,
        ss.day_of_week,
        ss.start_time,
        ss.end_time,
        ss.classroom,
        ss.color_hex
      from enrollment e
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      join course c on c.id = co.course_id
      join syllabus sy on sy.course_offering_id = co.id
      join assessment a on a.syllabus_id = sy.id
      left join assessment_type at on at.id = a.assessment_type_id
      left join schedule_session ss on ss.section_id = sec.id
      where e.student_id = ${studentId}
        and e.status = 'active'
      order by a.week_number, c.name, a.code, ss.day_of_week
    `)) as unknown as RawAssessmentRow[];
  }

  async findAcademicWeeksForActivePeriod(): Promise<RawWeekRow[]> {
    return (await this.database.execute(sql`
      select
        aw.week_number,
        aw.start_date,
        aw.end_date
      from academic_week aw
      join academic_period ap on ap.id = aw.academic_period_id
      where ap.is_active = true
      order by aw.week_number
    `)) as unknown as RawWeekRow[];
  }

  /** Fechas propias del período activo, para derivar semanas cuando `academic_week` no tiene filas (ver `deriveWeeksFromPeriodDates`). */
  async findActivePeriodDates(): Promise<RawPeriodDatesRow | null> {
    const rows = (await this.database.execute(sql`
      select start_date::text as start_date, end_date::text as end_date
      from academic_period
      where is_active = true
      limit 1
    `)) as unknown as RawPeriodDatesRow[];
    return rows[0] ?? null;
  }

  async findTeacherSessionsWithClasses(teacherId: number): Promise<RawSessionRow[]> {
    return (await this.database.execute(sql`
      select
        sec.id as section_id,
        sec.code as section_code,
        t.teacher_code,
        c.id as course_id,
        c.name as course_name,
        '0' as attended_hours,
        '0' as absent_hours,
        '0' as total_hours,
        ss.id as session_id,
        ss.day_of_week,
        ss.start_time,
        ss.end_time,
        ss.classroom,
        ss.color_hex
      from section sec
      join teacher t on t.id = sec.teacher_id
      join course_offering co on co.id = sec.course_offering_id
      join course c on c.id = co.course_id
      left join schedule_session ss on ss.section_id = sec.id
      where sec.teacher_id = ${teacherId} or sec.jp_id = ${teacherId}
      order by ss.day_of_week, ss.start_time, c.name
    `)) as unknown as RawSessionRow[];
  }

  async findTeacherAdvisingSessions(teacherId: number) {
    return (await this.database.execute(sql`
      select
        cas.id,
        cas.course_offering_id,
        cas.section_id,
        c.name as course_name,
        sec.code as section_code,
        cas.kind,
        cas.day_of_week,
        cas.session_date::text as session_date,
        cas.start_time::text as start_time,
        cas.end_time::text as end_time,
        cas.modality,
        cas.classroom,
        cas.meeting_url
      from course_advising_session cas
      join course_offering co on co.id = cas.course_offering_id
      join course c on c.id = co.course_id
      left join section sec on sec.id = cas.section_id
      where cas.teacher_id = ${teacherId}
      order by cas.day_of_week, cas.start_time
    `)) as unknown as Array<{
      id: number;
      course_offering_id: number;
      section_id: number | null;
      course_name: string;
      section_code: string | null;
      kind: "recurring" | "extra";
      day_of_week: number;
      session_date: string | null;
      start_time: string;
      end_time: string;
      modality: string;
      classroom: string | null;
      meeting_url: string | null;
    }>;
  }

  async findTeacherSectionsAssessments(teacherId: number): Promise<RawAssessmentRow[]> {
    return (await this.database.execute(sql`
      select
        c.id as course_id,
        c.name as course_name,
        sec.id as section_id,
        sec.code as section_code,
        a.id as assessment_id,
        a.name as assessment_name,
        a.code as assessment_code,
        a.week_number as assessment_week_number,
        a.weight as assessment_weight,
        at.name as assessment_type,
        ss.day_of_week,
        ss.start_time,
        ss.end_time,
        ss.classroom,
        ss.color_hex
      from section sec
      join course_offering co on co.id = sec.course_offering_id
      join course c on c.id = co.course_id
      join syllabus sy on sy.course_offering_id = co.id
      join assessment a on a.syllabus_id = sy.id
      left join assessment_type at on at.id = a.assessment_type_id
      left join schedule_session ss on ss.section_id = sec.id
      where sec.teacher_id = ${teacherId} or sec.jp_id = ${teacherId}
      order by a.week_number, c.name, a.code, ss.day_of_week
    `)) as unknown as RawAssessmentRow[];
  }

  async checkSectionOwnership(sectionId: number, teacherId: number): Promise<boolean> {
    const rows = (await this.database.execute(sql`
      select 1 from section
      where id = ${sectionId} and (teacher_id = ${teacherId} or jp_id = ${teacherId})
      limit 1
    `)) as unknown as Array<{ '1': number }>;
    return rows.length > 0;
  }

  async countActiveEnrollments(sectionId: number): Promise<number> {
    const rows = (await this.database.execute(sql`
      select count(*)::int as total
      from enrollment
      where section_id = ${sectionId} and status = 'active'
    `)) as unknown as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  async findTeacherSectionAssessmentsStatus(sectionId: number) {
    return (await this.database.execute(sql`
      select
        a.id as assessment_id,
        a.code as assessment_code,
        a.name as assessment_name,
        count(ss.id)::int as loaded_count
      from assessment a
      join syllabus sy on sy.id = a.syllabus_id
      join course_offering co on co.id = sy.course_offering_id
      join section sec on sec.course_offering_id = co.id
      left join enrollment e on e.section_id = sec.id and e.status = 'active'
      left join student_score ss on ss.assessment_id = a.id and ss.enrollment_id = e.id and ss.value is not null
      where sec.id = ${sectionId}
      group by a.id, a.code, a.name
      order by a.id
    `)) as unknown as Array<{
      assessment_id: number;
      assessment_code: string;
      assessment_name: string;
      loaded_count: number;
    }>;
  }

  async findSectionDetails(sectionId: number) {
    const rows = await this.database.execute(sql`
      select sec.code as section_code, c.name as course_name
      from section sec
      join course_offering co on co.id = sec.course_offering_id
      join course c on c.id = co.course_id
      where sec.id = ${sectionId}
      limit 1
    `) as unknown as Array<{ section_code: string; course_name: string }>;
    return rows[0] ? { sectionCode: rows[0].section_code, courseName: rows[0].course_name } : null;
  }

  async findAssessmentDetails(assessmentId: number) {
    const rows = await this.database.execute(sql`
      select code, name from assessment where id = ${assessmentId} limit 1
    `) as unknown as Array<{ code: string; name: string }>;
    return rows[0] ? { code: rows[0].code, name: rows[0].name } : null;
  }

  async findActiveStudentsBySectionId(sectionId: number) {
    return await this.database.execute(sql`
      select student_id as "studentId" from enrollment where section_id = ${sectionId} and status = 'active'
    `) as unknown as Array<{ studentId: number }>;
  }

  async countGradedForAssessment(assessmentId: number, sectionId: number): Promise<number> {
    const rows = await this.database.execute(sql`
      select count(ss.id)::int as graded
      from enrollment e
      left join student_score ss on ss.assessment_id = ${assessmentId}
        and ss.enrollment_id = e.id
        and ss.value is not null
      where e.section_id = ${sectionId} and e.status = 'active'
    `) as unknown as Array<{ graded: number }>;
    return rows[0]?.graded ?? 0;
  }

  async findAlertByTitle(studentId: number, title: string): Promise<boolean> {
    const rows = await this.database.execute(sql`
      select id from alert where student_id = ${studentId} and title = ${title} limit 1
    `) as unknown as any[];
    return rows.length > 0;
  }

  /**
   * Verifica si algún alumno de la sección recibió una alerta de notas
   * para la evaluación dada (patrón de título único por assessmentId+sectionId).
   * Usado para inicializar el estado del switch en el frontend.
   */
  async findWasAssessmentNotified(sectionId: number, assessmentId: number): Promise<boolean> {
    const rows = await this.database.execute(sql`
      select al.id from alert al
      join enrollment e on e.student_id = al.student_id and e.section_id = ${sectionId} and e.status = 'active'
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      join course c on c.id = co.course_id
      join assessment ass on ass.id = ${assessmentId}
      where al.title = 'Notas disponibles: ' || ass.code || ' - ' || c.name
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
}
