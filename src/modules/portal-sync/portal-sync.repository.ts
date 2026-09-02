import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import type { RecordRow } from "./portal-sync.types.js";

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

export type ProgressStatus = "in_progress" | "approved" | "failed";

/** Nota >= 11 aprueba. Sin nota: en curso si es el ciclo vigente, si no se omite. */
export const progressStatusFor = (grade: number | null, isCurrentPeriod: boolean): ProgressStatus | null => {
  if (grade === null) return isCurrentPeriod ? "in_progress" : null;
  return grade >= 11 ? "approved" : "failed";
};

/** Con varias filas del mismo curso gana la VEZ más alta; a igual VEZ, el ciclo más reciente. */
export const pickBestRecordRow = (rows: RecordRow[]): RecordRow | null => {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.attempt - a.attempt || b.periodCode.localeCompare(a.periodCode))[0];
};

/**
 * ¿Retirar `toWithdraw` matrículas dejaría al alumno sin ninguna activa?
 *
 * Ambos caminos de login exigen una matrícula activa, así que dejarlo en cero
 * lo deja fuera de la app SIN forma de volver a entrar — y por tanto sin forma
 * de volver a importar, que es lo único que lo arreglaría. Ante la duda no se
 * retira nada.
 */
export const withdrawalWouldLockOut = (activeCount: number, toWithdraw: number): boolean =>
  activeCount - toWithdraw <= 0;

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

  async fillFullNameIfEmpty(tx: Tx, userId: number, fullName: string): Promise<void> {
    if (!fullName) return;
    // institutional_email NUNCA se toca: es NOT NULL UNIQUE y es la clave del login con Google.
    await tx.execute(sql`
      update app_user set full_name = ${fullName}
      where id = ${userId} and (full_name is null or btrim(full_name) = '')
    `);
  }

  async updateStudentLevel(tx: Tx, studentId: number, level: number): Promise<void> {
    if (!Number.isInteger(level) || level < 1 || level > 10) return;  // chk_student_current_level
    await tx.execute(sql`update student set current_level = ${level} where id = ${studentId}`);
  }

  async upsertEnrollment(tx: Tx, studentId: number, sectionId: number, finalGrade: number | null) {
    const rows = (await tx.execute(sql`
      insert into enrollment (student_id, section_id, status, final_grade)
      values (${studentId}, ${sectionId}, 'active', ${finalGrade})
      on conflict (student_id, section_id) do update
        set status = 'active',
            final_grade = coalesce(excluded.final_grade, enrollment.final_grade)
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  async countActiveEnrollments(tx: Tx, studentId: number): Promise<number> {
    const rows = (await tx.execute(sql`
      select count(*)::int as n from enrollment where student_id = ${studentId} and status = 'active'
    `)) as unknown as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Retira solo matrículas DEL PERÍODO IMPORTADO (enrollment no tiene columna de
   * período: se resuelve por join). Nunca deja al alumno con cero matrículas
   * activas: ambos logins exigen hasActiveEnrollment y lo dejarían fuera de la app.
   */
  async withdrawMissingEnrollments(
    tx: Tx, studentId: number, periodId: number, keepSectionIds: number[],
  ): Promise<number> {
    const keep = keepSectionIds.length ? keepSectionIds : [-1];
    const candidates = (await tx.execute(sql`
      select e.id
      from enrollment e
      join section s on s.id = e.section_id
      join course_offering co on co.id = s.course_offering_id
      where e.student_id = ${studentId}
        and co.academic_period_id = ${periodId}
        and e.status = 'active'
        and e.section_id <> all(${keep})
    `)) as unknown as Array<{ id: number }>;
    if (!candidates.length) return 0;

    const active = await this.countActiveEnrollments(tx, studentId);
    if (withdrawalWouldLockOut(active, candidates.length)) return -1;   // -1 = se omitió para no bloquear el login

    const ids = candidates.map((r) => Number(r.id));
    await tx.execute(sql`update enrollment set status = 'withdrawn' where id = any(${ids})`);
    return ids.length;
  }

  async findCurriculumCourseId(tx: Tx, curriculumId: number, courseCode: string): Promise<number | null> {
    const rows = (await tx.execute(sql`
      select cc.id from curriculum_course cc
      join course c on c.id = cc.course_id
      where cc.curriculum_id = ${curriculumId} and c.code = ${courseCode}
      limit 1
    `)) as unknown as Array<{ id: number }>;
    return rows[0] ? Number(rows[0].id) : null;
  }

  async upsertProgress(
    tx: Tx, studentId: number, curriculumId: number, curriculumCourseId: number, status: ProgressStatus,
  ): Promise<void> {
    await tx.execute(sql`
      insert into student_course_progress (student_id, curriculum_id, curriculum_course_id, status)
      values (${studentId}, ${curriculumId}, ${curriculumCourseId}, ${status}::student_course_status)
      on conflict (student_id, curriculum_course_id) do update set status = excluded.status
    `);
  }

  /** Idempotente: no crea otra alerta aunque la anterior ya esté leída. */
  async upsertImpedimentAlert(tx: Tx, studentId: number, message: string): Promise<boolean> {
    const rows = (await tx.execute(sql`
      insert into alert (student_id, type, title, message)
      select ${studentId}, 'academic_risk', 'Impedimento de matrícula', ${message}
      where not exists (
        select 1 from alert
        where student_id = ${studentId} and title = 'Impedimento de matrícula'
      )
      returning id
    `)) as unknown as Array<{ id: number }>;
    if (rows.length) return true;
    await tx.execute(sql`
      update alert set message = ${message}
      where student_id = ${studentId} and title = 'Impedimento de matrícula' and message <> ${message}
    `);
    return false;
  }

  async findStudent(studentId: number) {
    const rows = (await this.database.execute(sql`
      select s.id, s.user_id as "userId", s.career_id as "careerId", s.curriculum_id as "curriculumId",
             c.name as "careerName"
      from student s join career c on c.id = s.career_id
      where s.id = ${studentId} limit 1
    `)) as unknown as Array<{ id: number; userId: number; careerId: number; curriculumId: number; careerName: string }>;
    return rows[0] ?? null;
  }
}
