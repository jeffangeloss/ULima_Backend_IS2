import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { GradesRepository } from "../../src/modules/grades/grades.repository.js";
import { construirVistaUlima } from "../../src/modules/grades/grades-ulima.logic.js";
import type { EvaluacionEmparejada } from "../../src/modules/portal-sync/portal-sync.types.js";
import { PortalRefreshRepository } from "../../src/modules/portal-sync/refresh/refresh.repository.js";

/**
 * RS-BE-55 y RS-BE-57 contra un PostgreSQL de verdad.
 *
 * Solo corre con TEST_DATABASE_URL, y sin ella se salta entera. Con ella exige
 * que el host sea local (localhost, 127.0.0.1 o ::1), para que nunca llegue a
 * Neon ni a otra base remota, y que la base esté vacía. Todo corre en UNA
 * transacción que se deshace al final, con un savepoint por prueba. Adentro
 * crea las tablas mínimas que tocan las consultas, aplica la 0015 dos veces (la
 * segunda prueba que es idempotente) y siembra datos inventados.
 *
 * Cómo correrla con un Postgres desechable (producción es PostgreSQL 17; el 16
 * de Homebrew también sirve):
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust --locale=C -E UTF8 > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -k $PGTMP" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres recarga
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/recarga \
 *     bun test test/HU37_jeff/refresh.postgres.test.ts
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -w stop && rm -rf "$PGTMP"
 */

const URL_DE_PRUEBA = process.env.TEST_DATABASE_URL ?? "";
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const esBaseLocal = (url: string): boolean => {
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

const ESQUEMA_MINIMO = `
  create table public.academic_period (id integer primary key, code varchar(10) not null,
    is_active boolean not null default false);
  create table public.course (id integer primary key, code varchar(20) not null, name varchar(150) not null);
  create table public.course_offering (id integer primary key,
    academic_period_id integer not null references academic_period(id),
    course_id integer not null references course(id));
  create table public.section (id integer primary key,
    course_offering_id integer not null references course_offering(id), code varchar(30) not null);
  create table public.app_user (id integer primary key, code varchar(20));
  create table public.enrollment (id integer primary key, student_id integer not null,
    section_id integer not null references section(id), status text not null default 'active',
    attended_hours numeric(5,2) not null default 0, absent_hours numeric(5,2) not null default 0,
    total_hours numeric(5,2) not null default 0,
    constraint chk_enrollment_attendance_hours check (attended_hours + absent_hours <= total_hours));
  create table public.syllabus (id integer primary key,
    course_offering_id integer not null unique references course_offering(id));
  create table public.assessment_type (id integer primary key, name varchar(120) not null);
  create table public.assessment (id integer primary key, syllabus_id integer not null references syllabus(id),
    assessment_type_id integer not null references assessment_type(id), code varchar(30) not null,
    name varchar(150) not null, week_number integer not null, weight numeric(5,2) not null);
`;

const SIEMBRA = `
  insert into academic_period values (1, '2026-1', false), (2, '2026-2', true);
  insert into course values (1, '690417', 'TALLER DE PROTOTIPADO'), (2, '690418', 'ANALITICA DE DATOS');
  insert into course_offering values (11, 2, 1), (12, 2, 2), (13, 1, 1);
  insert into section values (81, 11, '812'), (82, 12, '812'), (83, 13, '812');
  insert into app_user values (7, '20230001');
  insert into enrollment (id, student_id, section_id, status) values
    (501, 42, 81, 'active'), (502, 42, 82, 'active'), (503, 42, 83, 'active'),
    (504, 42, 82, 'withdrawn'), (601, 43, 81, 'active');
  insert into syllabus values (21, 11), (22, 12);
  insert into assessment_type values (1, 'Examen'), (2, 'Proyecto');
  insert into assessment values
    (5011, 21, 1, 'EV01', 'Examen escrito', 3, 15), (5012, 21, 2, 'EV02', 'Proyecto final', 15, 85),
    (5021, 22, 1, 'EV01', 'Examen escrito', 3, 15);
`;

let cliente: postgres.Sql | null = null;
let database: typeof db;
let repo: PortalRefreshRepository;

const base = (): postgres.Sql => {
  if (!cliente) throw new Error("La conexión de prueba no se abrió (ver beforeAll).");
  return cliente;
};
const tx = () => database as never;

/** Corre una sentencia en su propio savepoint y devuelve `SQLSTATE|restricción` si la base la rechaza. */
const rechazo = async (sentencia: string): Promise<string | null> => {
  await base().unsafe("savepoint sentencia");
  try {
    await base().unsafe(sentencia);
    return null;
  } catch (error) {
    const { code, constraint_name } = error as { code?: string; constraint_name?: string };
    return `${code ?? "?"}|${constraint_name ?? ""}`;
  } finally {
    await base().unsafe("rollback to savepoint sentencia");
  }
};

const FILA = (over: Partial<EvaluacionEmparejada> = {}): EvaluacionEmparejada => ({
  key: "07.13", group: "EVC", name: "Examen escrito 1", week: 3, weight: 15, value: 14.5,
  mark: "graded", assessmentId: 5011, match: "exact", ...over,
});
const SIN_PAREJA: Partial<EvaluacionEmparejada> = {
  key: "07.20", name: "Participación", week: null, weight: 85, value: null, mark: "pending", assessmentId: null, match: "none",
};

// Los ganchos de la conexión van fuera del describe: dentro de un describe
// saltado, bun cuenta cada beforeAll y afterAll como una prueba saltada más.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error("TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1).");
  }
  const migracion = await Bun.file("drizzle/0015_portal_scores.sql").text();
  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  database = drizzle(cliente, { schema: { ...schema, ...relations } }) as unknown as typeof db;
  repo = new PortalRefreshRepository(database);
  await cliente.unsafe("begin");
  const [previa] = await cliente`select to_regclass('public.enrollment') is not null as hay`;
  if (previa?.hay) throw new Error("La base de TEST_DATABASE_URL ya tiene public.enrollment: usa una base vacía y desechable.");
  await cliente.unsafe(ESQUEMA_MINIMO);
  await cliente.unsafe(migracion);
  await cliente.unsafe(migracion);
  await cliente.unsafe(SIEMBRA);
});

afterAll(async () => {
  if (!cliente) return;
  await cliente.unsafe("rollback").catch(() => {});
  await cliente.end();
});

describe.skipIf(!URL_DE_PRUEBA)("la 0015 y los repositorios de la recarga contra PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    if (cliente) await cliente.unsafe("savepoint caso");
  });

  afterEach(async () => {
    if (cliente) await cliente.unsafe("rollback to savepoint caso");
  });

  test("la 0015 aplicada dos veces deja la tabla, sus restricciones, la cascada y las dos columnas", async () => {
    const restricciones = await base()`
      select conname, contype::text as tipo, confdeltype::text as al_borrar
        from pg_constraint where conrelid = 'public.student_portal_score'::regclass`;
    const nombres = restricciones.map((r) => `${r.conname}|${r.tipo}`);
    for (const esperado of [
      "chk_student_portal_score_mark|c", "chk_student_portal_score_mark_value|c", "chk_student_portal_score_match|c",
      "chk_student_portal_score_match_assessment|c", "chk_student_portal_score_value|c",
      "chk_student_portal_score_week|c", "chk_student_portal_score_weight|c",
      "uq_student_portal_score_key|u", "student_portal_score_pkey|p",
    ]) expect(nombres).toContain(esperado);
    expect(restricciones.filter((r) => r.tipo === "f").map((r) => r.al_borrar).sort()).toEqual(["a", "c"]);
    const indices = await base()`select indexname from pg_indexes where tablename = 'student_portal_score' order by indexname`;
    expect(indices.map((i) => i.indexname)).toEqual([
      "idx_student_portal_score_enrollment", "student_portal_score_pkey",
      "uq_student_portal_score_assessment", "uq_student_portal_score_key",
    ]);
    const columnas = await base()`
      select column_name, data_type, is_nullable from information_schema.columns
       where table_name = 'enrollment' and column_name like 'portal%' order by column_name`;
    expect(columnas.map((c) => ({ ...c }))).toEqual([
      { column_name: "portal_attendance_read_at", data_type: "timestamp with time zone", is_nullable: "YES" },
      { column_name: "portal_grades_read_at", data_type: "timestamp with time zone", is_nullable: "YES" },
    ]);
  });

  test("findRefreshContext trae el período activo y solo las matrículas activas del alumno en él", async () => {
    expect(await repo.findRefreshContext(42)).toEqual({
      period: { id: 2, code: "2026-2" },
      matriculas: [
        { enrollmentId: 502, sectionId: 82, courseCode: "690418", sectionCode: "812", courseName: "ANALITICA DE DATOS" },
        { enrollmentId: 501, sectionId: 81, courseCode: "690417", sectionCode: "812", courseName: "TALLER DE PROTOTIPADO" },
      ],
    });
    expect(await repo.findUserCode(7)).toBe("20230001");
  });

  test("findSyllabusCandidates trae solo el sílabo de la oferta de la matrícula", async () => {
    expect(await repo.findSyllabusCandidates(501)).toEqual([
      { assessmentId: 5011, name: "Examen escrito", typeName: "Examen", week: 3, weight: 15 },
      { assessmentId: 5012, name: "Proyecto final", typeName: "Proyecto", week: 15, weight: 85 },
    ]);
  });

  test("la hora de la asistencia solo avanza y una lectura más vieja no toca las horas", async () => {
    expect(await repo.updateAttendanceHours(tx(), 501, { total: "48.00", attended: "4.00", absent: "2.00" }, "2026-09-25T15:00:00.000Z")).toBe(true);
    expect(await repo.updateAttendanceHours(tx(), 501, { total: "48.00", attended: "2.00", absent: "0.00" }, "2026-09-25T14:00:00.000Z")).toBe(false);
    const [fila] = await base()`
      select attended_hours::text as asistidas, to_char(portal_attendance_read_at at time zone 'UTC', 'HH24:MI') as hora
        from enrollment where id = 501`;
    expect({ ...fila }).toEqual({ asistidas: "4.00", hora: "15:00" });
    expect(await repo.updateAttendanceHours(tx(), 501, { total: "48.00", attended: "6.00", absent: "2.00" }, "2026-09-25T16:00:00.000Z")).toBe(true);
  });

  test("la hora de las notas solo avanza", async () => {
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T15:00:00.000Z")).toBe(true);
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T14:00:00.000Z")).toBe(false);
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T15:00:00.000Z")).toBe(false);
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T16:00:00.000Z")).toBe(true);
  });

  test("reemplazar deja solo las filas nuevas, y la pareja de otra oferta revierte", async () => {
    await repo.replacePortalScores(tx(), 501, [FILA(), FILA(SIN_PAREJA)]);
    await repo.replacePortalScores(tx(), 501, [FILA({ value: 16 })]);
    const filas = await base()`
      select portal_key, value::text as value, assessment_id from student_portal_score where enrollment_id = 501`;
    expect(filas.map((f) => ({ ...f }))).toEqual([{ portal_key: "07.13", value: "16.00", assessment_id: 5011 }]);
    await expect(repo.replacePortalScores(tx(), 501, [FILA({ assessmentId: 5021 })])).rejects.toThrow("no pertenece a la oferta");
  });

  test("los CHECK de la 0015 rechazan lo que el lector nunca produce", async () => {
    const insertar = (cambios: Record<string, string>) => {
      const v: Record<string, string> = {
        enrollment_id: "501", portal_key: "'07.13'", name: "'Examen escrito 1'", weight: "15", mark: "'graded'",
        value: "14.5", assessment_id: "5011", match_rule: "'exact'", ...cambios,
      };
      return `insert into student_portal_score (${Object.keys(v).join(", ")}) values (${Object.values(v).join(", ")})`;
    };
    expect(await rechazo(insertar({}))).toBeNull();
    expect(await rechazo(insertar({ value: "null" }))).toBe("23514|chk_student_portal_score_mark_value");
    expect(await rechazo(insertar({ weight: "0" }))).toBe("23514|chk_student_portal_score_weight");
    expect(await rechazo(insertar({ match_rule: "'none'" }))).toBe("23514|chk_student_portal_score_match_assessment");
    expect(await rechazo(insertar({ mark: "'x'", value: "null" }))).toBe("23514|chk_student_portal_score_mark");
    expect(await rechazo(insertar({ week_number: "21" }))).toBe("23514|chk_student_portal_score_week");
  });

  test("borrar la matrícula borra sus notas de la ULima en cascada", async () => {
    await repo.replacePortalScores(tx(), 502, [FILA({ assessmentId: 5021 })]);
    await base().unsafe("delete from enrollment where id = 502");
    const [cuenta] = await base()`select count(*)::int as n from student_portal_score where enrollment_id = 502`;
    expect(cuenta?.n).toBe(0);
  });

  test("el candado de la recarga se toma dentro de la transacción", async () => {
    await repo.lockRefresh(tx(), 42);
    const [cuenta] = await base()`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`;
    expect(cuenta?.n).toBeGreaterThanOrEqual(1);
  });

  test("GET /grades/me/ulima lee lo guardado, con la hora en ISO 8601 UTC", async () => {
    await repo.markGradesRead(tx(), 501, "2026-09-25T15:42:10.000Z");
    await repo.replacePortalScores(tx(), 501, [FILA(), FILA(SIN_PAREJA)]);
    const vista = construirVistaUlima(await new GradesRepository(database).findUlimaGrades(42));
    expect(vista.lastReadAt).toBe("2026-09-25T15:42:10.000Z");
    expect(vista.courses.map((c) => [c.courseCode, c.lastReadAt, c.assessments.map((a) => [a.key, a.value])])).toEqual([
      ["690418", null, []],
      ["690417", "2026-09-25T15:42:10.000Z", [["07.13", 14.5], ["07.20", null]]],
    ]);
  });
});
