import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { SpecialtyTestRepository } from "../../src/modules/specialty-test/specialty-test.repository.js";
import type { StoredRankingEntry } from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-44 y RS-BE-45 contra un PostgreSQL de verdad.
 *
 * Las demás pruebas del módulo no tocan una base. Esta es la única que le
 * manda la `0014` y los cuatro métodos del repository a Postgres, que es donde
 * aparece la clase de fallo que ya pasó en este backend (el 42809 de un
 * arreglo interpolado, un `to_char` mal escrito, un `do update` que no
 * refresca la fecha).
 *
 * Solo corre con `TEST_DATABASE_URL`. Sin esa variable se salta entera, así que
 * `bun test` sigue sin tocar ninguna base. Con ella exige que el host sea local
 * (localhost, 127.0.0.1 o ::1) y que la base esté vacía (sin `public.student`).
 * Todo corre en UNA transacción que se deshace al final, y cada prueba en un
 * savepoint propio. Dentro crea un `student` y un `specialty` mínimos (solo las
 * columnas que leen la FK y el repository), aplica la `0014` dos veces (la
 * segunda prueba que es idempotente) y siembra dos alumnos.
 *
 * Cómo correrla con un Postgres desechable, igual que
 * `test/HU35_jeff/time-blocks.postgres.test.ts` (producción es PostgreSQL 17):
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -k $PGTMP" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres especialidad
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/especialidad \
 *     bun test test/HU36_jeff/specialty-test.postgres.test.ts
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -w stop && rm -rf "$PGTMP"
 *
 * Datos INVENTADOS: el alumno sintético 20230001 tiene `student.id` 42 y el 43
 * es "otro alumno".
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

const ALUMNO = 42;
const OTRO_ALUMNO = 43;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const RANKING: StoredRankingEntry[] = [
  { key: "vj", specialtyId: 7, affinity: 75 },
  { key: "si", specialtyId: 6, affinity: 65 },
  { key: "ti", specialtyId: 5, affinity: 28 },
  { key: "sw", specialtyId: 1, affinity: 24 },
];

let cliente: postgres.Sql | null = null;
let repositorio: SpecialtyTestRepository;

const base = (): postgres.Sql => {
  if (!cliente) throw new Error("La conexión de prueba no se abrió (ver beforeAll).");
  return cliente;
};

/** Corre una sentencia en su propio savepoint y devuelve `SQLSTATE|restricción`, o null si pasa. */
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

// Los ganchos van fuera del `describe` a propósito, como en la prueba de
// bloques: dentro de un `describe` saltado bun cuenta cada gancho como una
// prueba saltada más. Sin TEST_DATABASE_URL vuelven sin hacer nada.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error(
      "TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1): esta prueba escribe tablas y filas.",
    );
  }
  const migracion = await Bun.file("drizzle/0014_specialty_test_result.sql").text();

  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  const database: typeof db = drizzle(cliente, { schema: { ...schema, ...relations } });
  repositorio = new SpecialtyTestRepository(database);

  await cliente.unsafe("begin");
  const [previa] = await cliente`select to_regclass('public.student') is not null as hay_student`;
  if (previa?.hay_student) {
    throw new Error("La base de TEST_DATABASE_URL ya tiene public.student: usa una base vacía y desechable (createdb).");
  }
  await cliente.unsafe("create table public.student (id integer primary key, career_id integer not null)");
  await cliente.unsafe(`create table public.specialty (
    id integer primary key, career_id integer not null, name varchar(120) not null,
    is_active boolean not null default true)`);
  await cliente.unsafe(migracion);
  await cliente.unsafe(migracion);
  await cliente.unsafe(`insert into public.student (id, career_id) values (${ALUMNO}, 1), (${OTRO_ALUMNO}, 1)`);
  await cliente.unsafe(`insert into public.specialty (id, career_id, name, is_active) values
    (1, 1, 'Ingeniería de Software', true), (2, 1, 'Ciencia de Datos', false),
    (5, 1, 'Tecnologías de la Información', true), (9, 2, 'Otra carrera', true)`);
});

afterAll(async () => {
  if (!cliente) return;
  await cliente.unsafe("rollback").catch(() => {});
  await cliente.end();
});

describe.skipIf(!URL_DE_PRUEBA)("specialty-test contra PostgreSQL real (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    if (cliente) await cliente.unsafe("savepoint caso");
  });

  afterEach(async () => {
    if (cliente) await cliente.unsafe("rollback to savepoint caso");
  });

  test("la 0014 aplicada dos veces deja la tabla con su clave, su FK en cascada y los dos CHECK", async () => {
    const restricciones = await base()`
      select conname, contype::text as tipo
        from pg_constraint
       where conrelid = 'public.student_specialty_test_result'::regclass`;
    expect(restricciones.map((r) => `${r.conname}|${r.tipo}`).sort()).toEqual([
      "chk_specialty_test_ranking|c",
      "chk_specialty_test_version|c",
      "student_specialty_test_result_pkey|p",
      "student_specialty_test_result_student_id_student_id_fk|f",
    ]);

    const cascada = await base()`
      select confdeltype::text as al_borrar
        from pg_constraint
       where conrelid = 'public.student_specialty_test_result'::regclass and contype = 'f'`;
    expect(cascada.map((r) => r.al_borrar)).toEqual(["c"]);
  });

  test("findStudentCareer y findActiveSpecialties leen solo lo activo de la carrera", async () => {
    expect(await repositorio.findStudentCareer(ALUMNO)).toEqual({ careerId: 1 });
    expect(await repositorio.findStudentCareer(999)).toBeNull();
    expect(await repositorio.findActiveSpecialties(1)).toEqual([
      { id: 1, name: "Ingeniería de Software" },
      { id: 5, name: "Tecnologías de la Información" },
    ]);
  });

  test("saveResult guarda, findResult lee lo mismo y la fecha sale en ISO UTC", async () => {
    const { completedAt } = await repositorio.saveResult(ALUMNO, "2026-09-25.4", RANKING, false);
    expect(completedAt).toMatch(ISO_UTC);
    expect(await repositorio.findResult(ALUMNO)).toEqual({
      contentVersion: "2026-09-25.4",
      ranking: RANKING,
      isTie: false,
      completedAt,
    });
    expect(await repositorio.findResult(OTRO_ALUMNO)).toBeNull();
  });

  test("rehacer el test deja una sola fila con los valores nuevos y una fecha nueva", async () => {
    // now() es la hora de inicio de la transacción, así que se retrasa la
    // primera fecha a mano para ver que el `do update` la vuelve a fijar.
    await repositorio.saveResult(ALUMNO, "2026-09-25.4", RANKING, false);
    await base().unsafe(
      `update student_specialty_test_result set completed_at = completed_at - interval '1 day' where student_id = ${ALUMNO}`,
    );
    const antes = (await repositorio.findResult(ALUMNO))!.completedAt;
    const empate = RANKING.map((e, i) => (i < 2 ? { ...e, affinity: 60 } : e));
    const { completedAt } = await repositorio.saveResult(ALUMNO, "2026-09-25.4", empate, true);
    expect(completedAt > antes).toBe(true);
    const [{ filas }] = await base()`select count(*)::int as filas from student_specialty_test_result where student_id = ${ALUMNO}`;
    expect(filas).toBe(1);
    expect((await repositorio.findResult(ALUMNO))?.isTie).toBe(true);
  });

  test("la fila cae con el alumno", async () => {
    await repositorio.saveResult(OTRO_ALUMNO, "2026-09-25.4", RANKING, false);
    await base().unsafe(`delete from student where id = ${OTRO_ALUMNO}`);
    expect(await repositorio.findResult(OTRO_ALUMNO)).toBeNull();
  });

  test("los CHECK rechazan una version mal formada y un ranking que no es un arreglo de cuatro", async () => {
    const insertar = (version: string, ranking: string) =>
      `insert into student_specialty_test_result (student_id, content_version, ranking, is_tie)
       values (${ALUMNO}, '${version}', '${ranking}'::jsonb, false)`;
    const cuatro = JSON.stringify(RANKING);
    expect(await rechazo(insertar("2026-09-25", cuatro))).toBe("23514|chk_specialty_test_version");
    expect(await rechazo(insertar("2026-09-25.4", "[]"))).toBe("23514|chk_specialty_test_ranking");
    expect(await rechazo(insertar("2026-09-25.4", '{"a":1}'))).toBe("23514|chk_specialty_test_ranking");
    expect(await rechazo(insertar("2026-09-25.4", cuatro))).toBeNull();
  });
});
