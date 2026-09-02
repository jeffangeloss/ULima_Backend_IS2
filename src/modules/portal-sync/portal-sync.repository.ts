import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import type { RecordRow, SyllabusEntry } from "./portal-sync.types.js";

/** Transacción de Drizzle/postgres-js; se tipa laxo para no acoplar a la versión. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Adelanta una fecha `AAAA-MM-DD` al lunes siguiente; si ya es lunes, la deja
 * igual. `ensureAcademicWeeks` genera cada semana como `start_date + (n-1)*7`,
 * así que si `start_date` no cae en lunes TODAS las semanas del período quedan
 * corridas (p. ej. sábado a viernes en vez de lunes a domingo), y de ese mismo
 * `start_date` leen su aritmética de semana el chatbot y el módulo de alertas.
 */
export const snapToNextMonday = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();              // 0 = domingo … 6 = sábado
  const daysUntilMonday = (8 - dayOfWeek) % 7;      // lunes (1) => 0
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  return date.toISOString().slice(0, 10);
};

/**
 * Calendarios académicos publicados por la Universidad. Cuando el ciclo está
 * aquí se usan sus fechas reales; solo se cae al cálculo aproximado cuando no.
 *
 * Importa que sean exactas: de `start_date` salen las semanas académicas, y de
 * ellas la "semana N" que responde el chatbot y la aritmética de alertas. Con
 * el cálculo aproximado, 2026-2 arrancaba tres semanas antes de lo real.
 *
 * La Universidad publica estos calendarios como "sujetos a modificaciones":
 * si cambian, se corrige aquí.
 */
export const KNOWN_PERIOD_CALENDARS: Record<string, { start: string; end: string }> = {
  "2026-2": { start: "2026-08-24", end: "2026-12-14" },
};

/** ¿El ciclo tiene un calendario publicado por la Universidad (vs. fechas por defecto)? */
export const hasPublishedCalendar = (code: string): boolean =>
  Object.prototype.hasOwnProperty.call(KNOWN_PERIOD_CALENDARS, code);

/**
 * Fechas de un período. Si la Universidad publicó su calendario se usan tal
 * cual (sin el snap a lunes: una fecha publicada es autoritativa aunque no
 * cayera en lunes); si no, se cae al cálculo aproximado de siempre.
 */
export const defaultPeriodDates = (code: string): { start: string; end: string } => {
  const published = KNOWN_PERIOD_CALENDARS[code];
  if (published) return published;
  const [year, n] = code.split("-");
  if (n === "1") return { start: snapToNextMonday(`${year}-03-15`), end: `${year}-07-31` };
  if (n === "2") return { start: snapToNextMonday(`${year}-08-01`), end: `${year}-12-20` };
  return { start: snapToNextMonday(`${year}-01-05`), end: `${year}-02-28` };
};

/**
 * Cantidad de semanas de 7 días necesarias para cubrir [startDate, endDate],
 * mínimo 1. `ensureAcademicWeeks` genera exactamente esta cantidad: un número
 * fijo (17) generaba semanas más allá del fin real cuando el ciclo dura menos
 * (2026-2, con calendario publicado, dura 16).
 */
export const academicWeekCount = (startDate: string, endDate: string): number => {
  const toUTCDays = (dateStr: string): number => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  const spanDays = toUTCDays(endDate) - toUTCDays(startDate);
  return Math.max(1, Math.ceil(spanDays / 7));
};

/** El ciclo global solo AVANZA: nunca se retrocede por la importación de un alumno. */
export const periodCodeIsNewer = (incoming: string, current: string | null): boolean =>
  current === null || incoming >= current;

/**
 * ¿Ya llegó la fecha de inicio de un período? Compara en UTC solo por fecha
 * de calendario (año/mes/día), no por hora, igual que el resto de este
 * módulo (ver `academicWeekCount`). `now` se pasa explícito (normalmente
 * `new Date()`) en vez de leerse del reloj adentro, para poder testear sin
 * mockear el reloj real.
 */
export const periodHasStarted = (startDate: string, now: Date): boolean => {
  const [year, month, day] = startDate.split("-").map(Number);
  const startUTC = Date.UTC(year, month - 1, day);
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return startUTC <= nowUTC;
};

/**
 * Decide si una importación debe activar el período que trae del portal.
 *
 * La Universidad publica el calendario de un ciclo (y por tanto lo deja
 * disponible para importar) días ANTES de que empiecen las clases. Sin esta
 * guarda, el primer alumno en importar movería el ciclo activo de los 201
 * alumnos antes de que el ciclo nuevo en verdad empezara: activar exige
 * además de no retroceder (`periodCodeIsNewer`) que la fecha de inicio ya
 * haya llegado.
 */
export const shouldActivatePeriod = (
  incomingCode: string,
  currentCode: string | null,
  startDate: string,
  now: Date,
): boolean => periodCodeIsNewer(incomingCode, currentCode) && periodHasStarted(startDate, now);

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
 * De una lista de cursos obligatorios pendientes, el nivel del alumno es el
 * ciclo MÍNIMO entre ellos (el owner: "el nivel del curso obligatorio más
 * bajo que todavía le falta"). Lista vacía => ya aprobó todo lo obligatorio.
 */
export const minOutstandingCycle = (rows: Array<{ cycle: number }>): number | null =>
  rows.length ? Math.min(...rows.map((r) => r.cycle)) : null;

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
      returning id, code, (xmax = 0) as "created", start_date as "startDate", end_date as "endDate"
    `)) as unknown as Array<{ id: number; code: string; created: boolean; startDate: string; endDate: string }>;

    const row = rows[0];
    return {
      id: Number(row.id),
      code: row.code,
      created: Boolean(row.created),
      datesDefaulted: Boolean(row.created) && !hasPublishedCalendar(row.code),
      startDate: String(row.startDate),
      endDate: String(row.endDate),
    };
  }

  /** Semanas del período, en cantidad derivada del span real. Ver `academicWeekCount`. */
  async ensureAcademicWeeks(tx: Tx, periodId: number, startDate: string, endDate: string): Promise<void> {
    const weeks = academicWeekCount(startDate, endDate);
    await tx.execute(sql`
      insert into academic_week (academic_period_id, week_number, start_date, end_date)
      select ${periodId}, gs,
             (${startDate}::date + ((gs - 1) * 7))::date,
             (${startDate}::date + ((gs - 1) * 7) + 6)::date
      from generate_series(1, ${weeks}) as gs
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

  /**
   * Ciclo del alumno: el nivel del curso OBLIGATORIO más bajo que todavía le
   * falta, esté pendiente o cursándolo. Definición dada por el owner.
   *
   * No se deriva del consolidado de matrícula: ese solo lista lo que el alumno
   * lleva ESTE ciclo, no dice si un curso es obligatorio, y no incluye los
   * cursos que aún no ha llevado — que son justamente los que definen el ciclo.
   *
   * Obligatorio = category <> 'elective'. Pendiente = sin fila de progreso o
   * con estado distinto de 'approved' (in_progress, failed y withdrawn siguen
   * faltando). Devuelve null si ya aprobó todos los obligatorios.
   */
  async findStudentLevel(tx: Tx, studentId: number, curriculumId: number): Promise<number | null> {
    const rows = (await tx.execute(sql`
      select cc.cycle as "cycle"
      from curriculum_course cc
      left join student_course_progress scp
        on scp.curriculum_course_id = cc.id and scp.student_id = ${studentId}
      where cc.curriculum_id = ${curriculumId}
        and cc.category <> 'elective'
        and (scp.status is null or scp.status <> 'approved')
    `)) as unknown as Array<{ cycle: number }>;
    return minOutstandingCycle(rows.map((r) => ({ cycle: Number(r.cycle) })));
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

  /**
   * Sílabo de una oferta. `on conflict do nothing`, **SIN conflict target**.
   *
   * Sin target, el `do nothing` cubre TODAS las restricciones únicas de la
   * tabla, no solo `uq_syllabus_course_offering (course_offering_id)` sino
   * también `syllabus_drive_file_id_unique (drive_file_id)`. Eso es lo que
   * hace cierta la garantía de la spec (§Sincronización paso 12) de que un
   * fallo de sílabo —incluido uno AL GUARDAR— nunca aborta el resto de la
   * importación: un UNID repetido entre dos ofertas (un sílabo compartido por
   * dos códigos de curso, que en una vista categorizada de Domino aparece bajo
   * ambas categorías) ya no lanza `23505`, no envenena la transacción y no
   * tumba la importación entera. Que la clave de consulta (`<COCICLO>_<curso>`)
   * sea única no implica que el documento devuelto lo sea.
   *
   * Tampoco se pisa nunca una fila existente. `syllabus` no es una tabla vacía
   * que estrene esta feature: `src/db/seed/index.ts` la llena con enlaces de
   * Google Drive que el visor de la app SÍ abre y que `grades.repository.ts`
   * sirve como `silaboUrl` a TODOS los alumnos de la oferta. Reemplazarlos por
   * una URL de Domino protegida por sesión (Decisión pendiente #10) rompía el
   * sílabo para toda la sección por una importación de un solo alumno, y sin
   * vuelta atrás desde la app. Es también la fila padre de `assessment`.
   *
   * **Consecuencia aceptada** (decisión del owner, 2026-09-02): re-importar el
   * mismo ciclo NO actualiza un sílabo republicado. Es el precio correcto
   * mientras la URL de Domino no sea abrible por el visor.
   *
   * `drive_file_id`/`drive_file_url`: nombres HISTÓRICOS de cuando el sílabo
   * solo podía vivir en Google Drive; ahora también guardan la referencia al
   * documento Domino (UNID y URL de `vSyllabusXCicloAV`). Se mantienen tal
   * cual — sin migración ni rename — por decisión del owner (2026-09-02, ver
   * `portal-sync.spec.md`).
   *
   * Devuelve `null` cuando el `do nothing` no escribió nada (`returning` sin
   * filas): quien llama NUNCA debe leer `rows[0]` a ciegas. Cuando sí devuelve
   * fila, esa fila es siempre un INSERT nuevo — con `do nothing` no hay otro
   * camino que devuelva algo —, de ahí `created: true`.
   */
  async upsertSyllabus(
    tx: Tx, courseOfferingId: number, entry: SyllabusEntry,
  ): Promise<{ id: number; created: boolean } | null> {
    const rows = (await tx.execute(sql`
      insert into syllabus (course_offering_id, title, drive_file_id, drive_file_url)
      values (${courseOfferingId}, ${entry.fileName}, ${entry.unid}, ${entry.url})
      on conflict do nothing
      returning id
    `)) as unknown as Array<{ id: number }>;
    const row = rows[0];
    return row ? { id: Number(row.id), created: true } : null;
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
