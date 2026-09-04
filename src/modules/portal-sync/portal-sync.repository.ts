import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import type { DelegadosNomina, RecordRow, SyllabusEntry } from "./portal-sync.types.js";

/** Transacción de Drizzle/postgres-js; se tipa laxo para no acoplar a la versión. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Arreglo de enteros para `= any(...)` / `<> all(...)`.
 *
 * NO se puede interpolar un arreglo de JS directamente: la plantilla `sql` de
 * Drizzle lo expande como LISTA DE VALORES entre paréntesis, o sea un
 * constructor de fila, no un arreglo. `all(${[1,2,3]})` renderiza
 * `all(($1, $2, $3))` y Postgres lo rechaza con 42809 ("op ANY/ALL (array)
 * requires array on right side"). Con un solo elemento tampoco funciona:
 * `all(($1))` sigue siendo un escalar entre paréntesis.
 *
 * Se detectó el 2026-09-02 en la primera importación real contra el portal;
 * ninguna prueba con dobles podía verlo, porque el fallo lo produce Postgres.
 *
 * Envolver en `array[...]` no arregla nada — daría `array[($1, $2, $3)]`, un
 * arreglo de UNA fila. La salida acá es mandar UN solo parámetro de texto y
 * dejar que Postgres lo convierta, con lo que la consulta sigue totalmente
 * parametrizada (nada se concatena en el SQL).
 *
 * Ojo: esto aplica a la plantilla `sql` de DRIZZLE. Los scripts de
 * `src/db/seed/` usan el cliente postgres-js, que sí liga un arreglo de JS
 * como arreglo de Postgres; ahí la interpolación directa es correcta.
 */
const intArray = (values: number[]) =>
  sql`string_to_array(${values.map((v) => Number(v)).join(",")}, ',')::int[]`;

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

/**
 * ¿Son la misma carrera, escritas distinto?
 *
 * El portal manda el nombre en MAYÚSCULAS ("INGENIERÍA DE SISTEMAS") y en
 * ULima++ está en capitalización normal ("Ingeniería de Sistemas"). Comparar
 * las cadenas crudas hacía que TODA importación emitiera un `CAREER_MISMATCH`
 * avisando de una diferencia que no existe, y esa advertencia es justamente la
 * que debe significar "ojo, el portal dice que estudias otra cosa".
 *
 * Se normaliza quitando acentos, pasando a mayúsculas y colapsando espacios.
 * Los acentos entran porque el portal es ISO-8859-1 y no siempre los conserva
 * igual; el espacio, porque el consolidado a veces trae dobles.
 */
export const normalizeCareerName = (name: string): string =>
  (name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();

/** Distinta carrera de verdad, no una diferencia de mayúsculas o acentos. */
export const careerNamesDiffer = (portal: string | null, local: string | null): boolean => {
  if (!portal || !local) return false;
  return normalizeCareerName(portal) !== normalizeCareerName(local);
};

/**
 * Paleta de colores de curso. DOCE porque el techo realista son 9 cursos por
 * ciclo (27 créditos) y con 8 el choque era matemáticamente inevitable.
 *
 * Los ocho primeros son los que ya usaba el frontend, en el mismo orden, para
 * que nada de lo ya pintado cambie de color. Los cuatro últimos rellenan los
 * tonos que faltaban (cian, lima, marrón, índigo) en vez de repetir vecinos.
 */
export const COURSE_COLOR_PALETTE = [
  "#2F80ED", // azul
  "#27AE60", // verde
  "#EB5757", // rojo
  "#9B51E0", // morado
  "#EC4899", // rosa
  "#F2994A", // naranja
  "#00B8A9", // teal
  "#F2C94C", // amarillo
  "#00A2C7", // cian
  "#7CB518", // lima
  "#8B6D5C", // marrón
  "#5B5BD6", // índigo
] as const;

/**
 * Color estable de un curso, derivado de su CÓDIGO.
 *
 * Por código y no por `section_id` a propósito: el mismo curso se pinta igual
 * para todos los alumnos y en todos los ciclos, así que dos compañeros pueden
 * hablar del "curso azul". El id de la sección cambia cada ciclo y haría que el
 * color bailara.
 *
 * Es un hash y no `código % 12`: los códigos de un ciclo son casi consecutivos
 * (650033, 650035, 650067…) y el módulo los agruparía en franjas contiguas de la
 * paleta, dando colores vecinos difíciles de distinguir entre sí.
 *
 * NO garantiza que dos cursos de un mismo alumno tengan colores distintos: eso
 * no se puede resolver acá, porque esta fila la comparten todos los alumnos de
 * la sección. El desempate lo hace el cliente sobre SU propio horario.
 */
export const courseColorHex = (courseCode: string): string => {
  let h = 2166136261;                      // FNV-1a de 32 bits
  for (const ch of String(courseCode ?? "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return COURSE_COLOR_PALETTE[Math.abs(h) % COURSE_COLOR_PALETTE.length]!;
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

/** Obligatorios de un ciclo de la malla y cuántos tiene aprobados el alumno. */
export interface CycleCoverage { cycle: number; total: number; approved: number }

/**
 * Nivel del alumno: el ciclo del curso obligatorio más bajo que todavía le
 * falta, esté pendiente o cursándolo (regla del owner), pero **ignorando todo
 * lo que esté por debajo del ciclo más alto que ya tiene completo**.
 *
 * Ese recorte no es una licencia: es lo que hace la regla utilizable con datos
 * reales. En la primera importación real (2026-09-02) el alumno cayó de nivel
 * 8 a 1, porque de sus 52 obligatorios solo 26 tenían fila de progreso: los
 * otros 26 están en su récord con códigos que no calzan con la malla
 * (convalidaciones, códigos antiguos), así que se contaban como pendientes.
 * Le pasa a cualquier alumno con convalidaciones, no es un caso raro.
 *
 * El recorte se apoya en los prerrequisitos de la malla: si el ciclo 8 está
 * aprobado entero, un obligatorio de ciclo 3 que figura pendiente no puede ser
 * trabajo real —no se llega al 8 sin pasar el 3—, es un fallo de
 * emparejamiento. Los ciclos por encima del último completo sí se miran todos:
 * ahí un pendiente es información legítima.
 *
 * Devuelve null cuando no hay obligatorios (malla vacía o sin datos), y cuando
 * están TODOS aprobados: el alumno terminó la carrera y no hay ciclo que
 * asignar, así que no se toca lo guardado.
 */
export const levelFromCoverage = (rows: CycleCoverage[]): number | null => {
  const ciclos = rows.filter((r) => r.total > 0).sort((a, b) => a.cycle - b.cycle);
  if (!ciclos.length) return null;

  // Ciclo más alto con TODOS sus obligatorios aprobados. 0 si ninguno lo está
  // (alumno que recién empieza): entonces no se recorta nada.
  const completos = ciclos.filter((r) => r.approved >= r.total).map((r) => r.cycle);
  const ultimoCompleto = completos.length ? Math.max(...completos) : 0;

  const pendiente = ciclos.find((r) => r.cycle > ultimoCompleto && r.approved < r.total);
  return pendiente ? pendiente.cycle : null;
};

/**
 * El nivel NUNCA baja. Red de seguridad sobre `levelFromCoverage`: si el
 * cálculo da menos que lo que ya estaba guardado, gana lo guardado.
 *
 * Un alumno no retrocede de ciclo, así que un cálculo más bajo es casi siempre
 * un artefacto de datos incompletos, y el daño de creerle es visible (la app le
 * mostraría contenido de un ciclo que ya pasó). Se separa de `levelFromCoverage`
 * a propósito: son dos defensas distintas y conviene poder ver cuál actuó.
 */
export const levelNeverGoesDown = (calculado: number | null, guardado: number | null) => {
  if (calculado === null) return { level: null, regresion: false };
  if (guardado !== null && calculado < guardado) return { level: guardado, regresion: true };
  return { level: calculado, regresion: false };
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

  /**
   * Cargo vigente del alumno en CUALQUIER sección, para re-firmar el token.
   *
   * Se consulta después de que la transacción confirma y NO se deriva del claim
   * recién promovido: alguien que ya era `delegate` en otra sección y acaba de
   * ser promovido a `subdelegate` en esta no puede terminar con un token
   * degradado. Por eso `delegate` gana el desempate.
   */
  async findActiveRepresentativePosition(
    studentId: number,
  ): Promise<"delegate" | "subdelegate" | null> {
    const rows = (await this.database.execute(sql`
      select sr.position
      from section_representative sr
      join enrollment e on e.id = sr.enrollment_id
      join section sec on sec.id = sr.section_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id
      where e.student_id = ${studentId} and e.status = 'active' and sr.is_active = true
      -- El cargo vale SOLO en el ciclo vigente. La tabla de representantes no
      -- tiene columna de período: el ciclo sale de la sección, y sin este join
      -- un delegado de 2026-1 conserva el cargo para siempre.
        and ap.is_active = true
      order by case when sr.position = 'delegate' then 0 else 1 end
      limit 1
    `)) as unknown as Array<{ position: "delegate" | "subdelegate" }>;
    return rows[0]?.position ?? null;
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
    colorHex: string,
  ): Promise<void> {
    await tx.execute(sql`
      insert into schedule_session (section_id, day_of_week, start_time, end_time, classroom, color_hex)
      values (${sectionId}, ${s.dayOfWeek}, ${s.startTime}::time, ${s.endTime}::time, ${s.classroom}, ${colorHex})
      on conflict (section_id, day_of_week, start_time) do update
        set end_time = excluded.end_time, classroom = excluded.classroom,
            color_hex = excluded.color_hex
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
  /**
   * Cobertura por ciclo: cuántos obligatorios tiene la malla y cuántos aprobó
   * el alumno. Antes se traían solo las filas NO aprobadas y se tomaba el
   * mínimo, pero así no hay forma de distinguir "ciclo que de verdad le falta"
   * de "ciclo cuyos cursos no se pudieron emparejar": ambos se ven igual. Con
   * el total al lado, `levelFromCoverage` sí puede.
   */
  async findCycleCoverage(tx: Tx, studentId: number, curriculumId: number): Promise<CycleCoverage[]> {
    const rows = (await tx.execute(sql`
      select cc.cycle as "cycle",
             count(*)::int as "total",
             count(*) filter (where scp.status = 'approved')::int as "approved"
      from curriculum_course cc
      left join student_course_progress scp
        on scp.curriculum_course_id = cc.id and scp.student_id = ${studentId}
      where cc.curriculum_id = ${curriculumId}
        and cc.category <> 'elective'
      group by cc.cycle
    `)) as unknown as Array<{ cycle: number; total: number; approved: number }>;
    return rows.map((r) => ({
      cycle: Number(r.cycle), total: Number(r.total), approved: Number(r.approved),
    }));
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

  // ── Delegados del portal ──────────────────────────────────────────────────

  /**
   * Deja en `section_representative_claim` exactamente lo que el portal publica
   * para esta sección.
   *
   * Un cargo PRESENTE se upsertea; un cargo AUSENTE se borra: si el salón
   * revocó a su delegado, el portal es la fuente de verdad y dejar el claim
   * viejo haría que la app mintiera el resto del ciclo. El borrado es seguro
   * porque nadie referencia a esta tabla — la prohibición de `delete` vale
   * para `section_representative`, cuya fila es padre de `announcement`.
   *
   * El upsert es CONDICIONADO por `observed_at`. Dos alumnos de la misma
   * sección pueden sincronizar con segundos de diferencia y confirmar en orden
   * inverso al de observación; sin el `where`, quedaría persistida la
   * observación más vieja. `observedAt` es el instante de la respuesta HTTP,
   * no el del INSERT: la descarga ocurre fuera de la transacción.
   *
   * Ausencia de claim NO desactiva a un `section_representative` real: un
   * claim nunca revoca permisos por sí solo.
   */
  async upsertRepresentativeClaims(
    tx: Tx, sectionId: number, delegados: DelegadosNomina, observedAt: Date,
  ): Promise<{ upserted: number; deleted: number }> {
    let upserted = 0;
    let deleted = 0;

    // Un cargo que el portal SÍ marcó pero que se descartó por dato inservible
    // no se toca: no se escribe (no hay dato válido) pero TAMPOCO se borra.
    // Borrarlo sería leer un problema de formato como una revocación del salón
    // y tirar un claim bueno de una importación anterior.
    const descartadas = new Set((delegados.warnings ?? []).map((w) => w.position));

    for (const position of ["delegate", "subdelegate"] as const) {
      if (descartadas.has(position)) continue;
      const persona = position === "delegate" ? delegados.delegate : delegados.subdelegate;

      if (!persona) {
        const gone = (await tx.execute(sql`
          delete from section_representative_claim
          where section_id = ${sectionId} and position = ${position}::representative_position
          returning id
        `)) as unknown as Array<{ id: number }>;
        deleted += gone.length;
        continue;
      }

      const rows = (await tx.execute(sql`
        insert into section_representative_claim
          (section_id, position, student_code, full_name, observed_at)
        values (${sectionId}, ${position}::representative_position,
                ${persona.code}, ${persona.fullName}, ${observedAt.toISOString()}::timestamptz)
        on conflict on constraint uq_section_representative_claim_position do update
          set student_code = excluded.student_code,
              full_name    = excluded.full_name,
              observed_at  = excluded.observed_at
          where excluded.observed_at > section_representative_claim.observed_at
        returning id
      `)) as unknown as Array<{ id: number }>;
      upserted += rows.length;
    }

    return { upserted, deleted };
  }

  /**
   * Si el portal señala a ESTE alumno como representante de ESTA sección, le da
   * el cargo de verdad. Devuelve el cargo otorgado, o `null` si no había claim
   * suyo acá.
   *
   * Dos trampas del esquema, las dos capaces de tumbar la importación entera:
   *
   * 1. `uq_active_section_representative_position` es un índice único PARCIAL y
   *    no diferible, así que primero hay que DESACTIVAR al ocupante anterior.
   *    Misma lección que `upsertPeriod`.
   * 2. `enrollment_id` tiene un UNIQUE PLANO: una fila desactivada sigue
   *    ocupando el valor. Por eso el `on conflict` va sobre `enrollment_id` y
   *    no sobre `(section_id, position)`. Con el target equivocado, la SEGUNDA
   *    importación del mismo delegado lanza 23505 y, como toda la escritura
   *    vive en una sola transacción, hace rollback de notas, horario y
   *    matrícula. De paso, pasar de delegado a subdelegado en la misma sección
   *    es un UPDATE y no una segunda fila que el UNIQUE hace imposible.
   */
  async promoteClaimIfAny(
    tx: Tx, sectionId: number, enrollmentId: number, studentCode: string,
  ): Promise<"delegate" | "subdelegate" | null> {
    const claim = (await tx.execute(sql`
      select position from section_representative_claim
      where section_id = ${sectionId} and student_code = ${studentCode}
      order by position
      limit 1
    `)) as unknown as Array<{ position: "delegate" | "subdelegate" }>;

    const position = claim[0]?.position ?? null;
    if (!position) return null;

    await tx.execute(sql`
      update section_representative set is_active = false
      where section_id = ${sectionId}
        and position = ${position}::representative_position
        and is_active = true
        and enrollment_id <> ${enrollmentId}
    `);

    await tx.execute(sql`
      insert into section_representative (section_id, enrollment_id, position, is_active)
      values (${sectionId}, ${enrollmentId}, ${position}::representative_position, true)
      on conflict (enrollment_id) do update
        set section_id = excluded.section_id,
            position   = excluded.position,
            is_active  = true
    `);

    return position;
  }

  /**
   * Borra los claims de todo período que ya no esté activo.
   *
   * Es lo que hace defendible guardar el nombre y el código de alguien que no
   * es usuario de la app y no dio su consentimiento: el dato muere con su
   * ciclo. Corre dentro de la transacción de la importación, después de
   * `upsertPeriod`, que es el único evento de cierre de ciclo que existe hoy
   * en el repo (no hay cron ni scheduler).
   *
   * Se barre por "período inactivo" y no por "el período que este UPDATE acaba
   * de desactivar": así también se limpian los ciclos que quedaron cerrados
   * antes de que esta función existiera, y la operación es idempotente.
   *
   * PERO el período que se está importando queda EXCLUIDO siempre, aunque esté
   * inactivo. `shouldActivatePeriod` devuelve false para un ciclo creado antes
   * de su fecha de inicio —el caso que el service reporta como
   * PERIOD_NOT_ACTIVATED_YET—, y `upsertPeriod` lo escribe con
   * `is_active = false`. Sus claims son del ciclo VIGENTE para el alumno, no
   * de uno cerrado: sin esta exclusión, una segunda importación hecha todavía
   * antes de la fecha de inicio los borra al abrir la transacción, y solo se
   * reescriben las secciones cuya nómina se pudo descargar y parsear (RS-17
   * degrada por aula). Las demás quedan sin delegado hasta que otro import
   * tenga suerte.
   *
   * LÍMITE CONOCIDO: el disparador es la primera importación del ciclo nuevo,
   * no un reloj. Si nadie importa durante meses, los claims del ciclo viejo
   * sobreviven ese tiempo.
   */
  async deleteClaimsOfInactivePeriods(tx: Tx, currentPeriodId: number): Promise<number> {
    const rows = (await tx.execute(sql`
      delete from section_representative_claim c
      using section s, course_offering co, academic_period ap
      where c.section_id = s.id
        and s.course_offering_id = co.id
        and co.academic_period_id = ap.id
        and ap.is_active = false
        and ap.id <> ${currentPeriodId}
      returning c.id
    `)) as unknown as Array<{ id: number }>;
    return rows.length;
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
        and e.section_id <> all(${intArray(keep)})
    `)) as unknown as Array<{ id: number }>;
    if (!candidates.length) return 0;

    const active = await this.countActiveEnrollments(tx, studentId);
    if (withdrawalWouldLockOut(active, candidates.length)) return -1;   // -1 = se omitió para no bloquear el login

    const ids = candidates.map((r) => Number(r.id));
    await tx.execute(sql`update enrollment set status = 'withdrawn' where id = any(${intArray(ids)})`);
    return ids.length;
  }

  /**
   * Resuelve TODOS los códigos de curso de una vez, en UNA consulta.
   *
   * Antes se resolvía de a uno dentro del bucle de progreso, junto con un
   * upsert también de a uno: dos viajes por curso. Con el récord académico
   * completo eso eran ~90 de los ~115 viajes secuenciales de la importación,
   * todos dentro de la misma transacción. No es tanto un problema de velocidad
   * (la función corre en `iad1`, pegada a Neon, donde cada viaje cuesta
   * décimas de milisegundo) como de cuánto tiempo se mantiene abierta esa
   * transacción: al inicio de un ciclo muchos alumnos importan a la vez.
   *
   * Los códigos van como JSON y no como lista separada por comas: un código de
   * curso hoy es numérico, pero `string_to_array` se rompería en silencio si
   * alguna vez trajera una coma, y acá el dato viene del portal.
   *
   * Devuelve un Map código -> id. Los códigos que no están en la malla
   * simplemente no aparecen, que es lo mismo que devolvía `null` antes.
   */
  async findCurriculumCourseIds(
    tx: Tx, curriculumId: number, courseCodes: string[],
  ): Promise<Map<string, number>> {
    const codigos = [...new Set(courseCodes)];
    if (!codigos.length) return new Map();
    const rows = (await tx.execute(sql`
      select c.code as "code", min(cc.id)::int as "id"
      from curriculum_course cc
      join course c on c.id = cc.course_id
      where cc.curriculum_id = ${curriculumId}
        and c.code = any(select json_array_elements_text(${JSON.stringify(codigos)}::json))
      group by c.code
    `)) as unknown as Array<{ code: string; id: number }>;
    // `min(cc.id)` replica el `limit 1` de la versión de a uno: si una malla
    // llegara a tener el mismo curso dos veces, antes se quedaba con una fila
    // arbitraria y ahora con la de menor id, que al menos es determinista.
    return new Map(rows.map((r) => [String(r.code), Number(r.id)]));
  }

  /**
   * Escribe TODO el progreso en UNA sentencia (ver `findCurriculumCourseIds`).
   *
   * Mantiene exactamente la semántica de la versión de a uno: mismo conflict
   * target `uq_student_course_progress (student_id, curriculum_course_id)` y
   * mismo `do update set status`.
   *
   * Las filas viajan como JSON y se expanden con `json_array_elements`, en vez
   * de armar un `values` con N tuplas: así el número de parámetros no crece con
   * el récord del alumno y la consulta que llega a Postgres es siempre la
   * misma, con un solo parámetro variable.
   *
   * `distinct on (curriculum_course_id)` no es decorativo: `ON CONFLICT` falla
   * con 21000 ("ON CONFLICT DO UPDATE command cannot affect row a second time")
   * si la MISMA sentencia trae dos filas con la misma clave. De a uno eso no
   * podía pasar; en lote sí, y bastaría un curso repetido para tumbar la
   * importación entera. El llamador ya agrupa por curso, así que es una
   * defensa, no la regla.
   */
  async upsertProgressBatch(
    tx: Tx, studentId: number, curriculumId: number,
    items: Array<{ curriculumCourseId: number; status: ProgressStatus }>,
  ): Promise<number> {
    if (!items.length) return 0;
    const payload = JSON.stringify(
      items.map((i) => ({ ccId: Number(i.curriculumCourseId), status: i.status })),
    );
    const rows = (await tx.execute(sql`
      insert into student_course_progress (student_id, curriculum_id, curriculum_course_id, status)
      select distinct on ((x->>'ccId')::int)
             ${studentId}, ${curriculumId}, (x->>'ccId')::int,
             (x->>'status')::student_course_status
        from json_array_elements(${payload}::json) as x
      on conflict (student_id, curriculum_course_id) do update set status = excluded.status
      returning id
    `)) as unknown as Array<{ id: number }>;
    return rows.length;
  }

  /**
   * Retira la alerta de "Impedimento de matrícula" del alumno que importa.
   *
   * Reemplaza a `upsertImpedimentAlert`: la alerta se descartó por no ser útil.
   * Se borra —y no se marca como leída— porque no hay a qué volver: ya no se
   * genera. Es idempotente y solo toca filas del propio alumno.
   */
  async deleteImpedimentAlert(tx: Tx, studentId: number): Promise<number> {
    const rows = (await tx.execute(sql`
      delete from alert
      where student_id = ${studentId} and title = 'Impedimento de matrícula'
      returning id
    `)) as unknown as Array<{ id: number }>;
    return rows.length;
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
             s.current_level as "currentLevel",
             c.name as "careerName"
      from student s join career c on c.id = s.career_id
      where s.id = ${studentId} limit 1
    `)) as unknown as Array<{
      id: number; userId: number; careerId: number; curriculumId: number;
      // Nivel YA guardado: `levelNeverGoesDown` lo necesita para no dejar que
      // un cálculo con datos incompletos haga retroceder al alumno.
      currentLevel: number | null; careerName: string;
    }>;
    return rows[0] ?? null;
  }
}
