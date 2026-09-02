import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";

/** Transacción de Drizzle/postgres-js; se tipa laxo para no acoplar a la versión. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Fechas por defecto de un período que el portal no tiene documentado. */
export const defaultPeriodDates = (code: string): { start: string; end: string } => {
  const [year, n] = code.split("-");
  if (n === "1") return { start: `${year}-03-15`, end: `${year}-07-31` };
  if (n === "2") return { start: `${year}-08-01`, end: `${year}-12-20` };
  return { start: `${year}-01-05`, end: `${year}-02-28` };
};

/** El ciclo global solo AVANZA: nunca se retrocede por la importación de un alumno. */
export const periodCodeIsNewer = (incoming: string, current: string | null): boolean =>
  current === null || incoming >= current;

/**
 * `teacher` NO tiene UNIQUE sobre full_name, así que no admite ON CONFLICT por
 * nombre. Se deriva una clave natural sintética sobre teacher_code (que sí es
 * unique) para poder hacer upsert atómico y no duplicar docentes cuando dos
 * alumnos de la misma sección importan a la vez.
 */
export const teacherCodeFor = (fullName: string): string => {
  const slug = (fullName ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return "PORTAL:SIN-DOCENTE";
  return `PORTAL:${slug}`.slice(0, 50).replace(/-+$/, "");
};

export const PLACEHOLDER_TEACHER = "DOCENTE POR ASIGNAR";

export class PortalSyncRepository {
  constructor(readonly database: typeof db) {}

  /** Única puerta de entrada a la transacción; el service nunca abre una. */
  async runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await this.database.transaction(fn);
  }

  async findActivePeriod(): Promise<{ id: number; code: string } | null> {
    const rows = (await this.database.execute(sql`
      select id, code from academic_period where is_active = true limit 1
    `)) as unknown as Array<{ id: number; code: string }>;
    return rows[0] ? { id: Number(rows[0].id), code: rows[0].code } : null;
  }

  async findUserCode(userId: number): Promise<string | null> {
    const rows = (await this.database.execute(sql`
      select code, full_name as "fullName" from app_user where id = ${userId} limit 1
    `)) as unknown as Array<{ code: string; fullName: string }>;
    return rows[0]?.code ?? null;
  }

  async countEnrollmentsInPeriod(studentId: number, periodId: number): Promise<number> {
    const rows = (await this.database.execute(sql`
      select count(*)::int as n
      from enrollment e
      join section s on s.id = e.section_id
      join course_offering co on co.id = s.course_offering_id
      where e.student_id = ${studentId} and co.academic_period_id = ${periodId} and e.status = 'active'
    `)) as unknown as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Período. `uq_academic_period_single_active` es un índice único PARCIAL y NO
   * diferible: PostgreSQL lo evalúa fila a fila, así que primero hay que
   * DESACTIVAR y recién después insertar/activar. Invertir el orden hace fallar
   * con 23505 la primera importación de cada ciclo nuevo.
   */
  async upsertPeriod(tx: Tx, code: string, activate: boolean) {
    const { start, end } = defaultPeriodDates(code);

    if (activate) {
      await tx.execute(sql`
        update academic_period set is_active = false where is_active = true and code <> ${code}
      `);
    }

    const rows = (await tx.execute(sql`
      insert into academic_period (code, start_date, end_date, is_active)
      values (${code}, ${start}::date, ${end}::date, ${activate})
      on conflict (code) do update set is_active = ${activate}
      returning id, code, (xmax = 0) as "created", start_date as "startDate"
    `)) as unknown as Array<{ id: number; code: string; created: boolean; startDate: string }>;

    const row = rows[0];
    return {
      id: Number(row.id),
      code: row.code,
      created: Boolean(row.created),
      datesDefaulted: Boolean(row.created),
      startDate: String(row.startDate),
    };
  }

  /** 17 semanas del período. Sin ellas, schedule y chatbot no resuelven "semana N". */
  async ensureAcademicWeeks(tx: Tx, periodId: number, startDate: string): Promise<void> {
    await tx.execute(sql`
      insert into academic_week (academic_period_id, week_number, start_date, end_date)
      select ${periodId}, gs,
             (${startDate}::date + ((gs - 1) * 7))::date,
             (${startDate}::date + ((gs - 1) * 7) + 6)::date
      from generate_series(1, 17) as gs
      on conflict (academic_period_id, week_number) do nothing
    `);
  }

  async upsertTeacher(tx: Tx, fullName: string) {
    const name = fullName || PLACEHOLDER_TEACHER;
    const rows = (await tx.execute(sql`
      insert into teacher (teacher_code, full_name)
      values (${teacherCodeFor(fullName)}, ${name})
      on conflict (teacher_code) do update set full_name = excluded.full_name
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** `name` es NOT NULL: se actualiza solo si el entrante es MÁS LARGO (menos truncado). */
  async upsertCourse(tx: Tx, code: string, name: string, credits: number) {
    const credit = Math.max(1, Math.ceil(credits || 0));   // chk_course_default_credit > 0
    const rows = (await tx.execute(sql`
      insert into course (code, name, default_credit)
      values (${code}, ${name}, ${credit})
      on conflict (code) do update
        set name = case when length(excluded.name) > length(course.name) then excluded.name else course.name end
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** total_hours = créditos x 16: attendance-risk descarta secciones con total_hours <= 0. */
  async upsertOffering(tx: Tx, periodId: number, courseId: number, credits: number) {
    const hours = Math.max(1, Math.ceil(credits || 0)) * 16;
    const rows = (await tx.execute(sql`
      insert into course_offering (academic_period_id, course_id, total_hours)
      values (${periodId}, ${courseId}, ${hours})
      on conflict (academic_period_id, course_id) do update
        set total_hours = greatest(course_offering.total_hours, excluded.total_hours)
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** El docente solo se pisa si el guardado es el placeholder. jp_id nunca se toca. */
  async upsertSection(tx: Tx, offeringId: number, code: string, teacherId: number) {
    const rows = (await tx.execute(sql`
      insert into section (course_offering_id, code, teacher_id)
      values (${offeringId}, ${code}, ${teacherId})
      on conflict (course_offering_id, code) do update
        set teacher_id = case
          when (select t.teacher_code from teacher t where t.id = section.teacher_id) = 'PORTAL:SIN-DOCENTE'
          then excluded.teacher_id else section.teacher_id end
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** uq_schedule_session es de TRES columnas: (section_id, day_of_week, start_time). */
  async upsertScheduleSession(
    tx: Tx,
    sectionId: number,
    s: { dayOfWeek: number; startTime: string; endTime: string; classroom: string | null },
  ): Promise<void> {
    await tx.execute(sql`
      insert into schedule_session (section_id, day_of_week, start_time, end_time, classroom)
      values (${sectionId}, ${s.dayOfWeek}, ${s.startTime}::time, ${s.endTime}::time, ${s.classroom})
      on conflict (section_id, day_of_week, start_time) do update
        set end_time = excluded.end_time, classroom = excluded.classroom
    `);
  }
}
