import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { AppSettingRepository } from "../../src/modules/app-setting/app-setting.repository.js";
import { crearLectorDelModo } from "../../src/modules/app-setting/modo-estatico.lector.js";

/**
 * RF-IRM-1 y RF-IRM-2 contra un PostgreSQL de verdad.
 *
 * Solo corre con `TEST_DATABASE_URL`. Sin esa variable se salta entera, así que `bun test`
 * sigue sin tocar ninguna base. Con ella exige que el host sea local (localhost, 127.0.0.1 o
 * ::1) y que la base no tenga `public.app_setting`. Todo corre en UNA transacción que se
 * deshace al final, y cada prueba en un savepoint propio. Aplica la `0016` dos veces (la
 * segunda prueba que es idempotente) y lee la fila con el repositorio y con el lector real.
 *
 * Cómo correrla con un Postgres desechable, igual que las otras suites `*.postgres.test.ts`
 * (la CI y producción usan PostgreSQL 17, y el 16 de Homebrew también sirve).
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -k $PGTMP" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres interruptor
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/interruptor \
 *     bun test test/interruptor-remoto/app-setting.postgres.test.ts
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

let cliente: postgres.Sql | null = null;
let repositorio: AppSettingRepository;
let migracion = "";

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

/** Un lector nuevo por lectura, para que la caché de 10 s no esconda el cambio de la fila. */
const lectorReal = (respaldo: boolean) =>
  crearLectorDelModo({ consultar: () => repositorio.leerModoEstatico(), respaldo });

// Los ganchos van fuera del `describe`, como en las otras suites contra PostgreSQL, porque
// dentro de un `describe` saltado bun cuenta cada gancho como una prueba saltada más.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error(
      "TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1): esta prueba escribe tablas y filas.",
    );
  }
  migracion = await Bun.file("drizzle/0016_app_setting.sql").text();

  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  const database: typeof db = drizzle(cliente, { schema: { ...schema, ...relations } });
  repositorio = new AppSettingRepository(database);

  await cliente.unsafe("begin");
  const [previa] = await cliente`select to_regclass('public.app_setting') is not null as hay`;
  if (previa?.hay) {
    throw new Error("La base de TEST_DATABASE_URL ya tiene public.app_setting: usa una base vacía y desechable (createdb).");
  }
  await cliente.unsafe(migracion);
  await cliente.unsafe(migracion);
});

afterAll(async () => {
  if (!cliente) return;
  await cliente.unsafe("rollback").catch(() => {});
  await cliente.end();
});

describe.skipIf(!URL_DE_PRUEBA)("app_setting contra PostgreSQL real (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    if (cliente) await cliente.unsafe("savepoint caso");
  });

  afterEach(async () => {
    if (cliente) await cliente.unsafe("rollback to savepoint caso");
  });

  test("la 0016 aplicada dos veces deja una sola fila (1, true), su clave y su CHECK", async () => {
    const filas = await base()`select id, static_mode from app_setting order by id`;
    expect(filas.map((f) => [f.id, f.static_mode])).toEqual([[1, true]]);
    const restricciones = await base()`
      select conname, contype::text as tipo
        from pg_constraint
       where conrelid = 'public.app_setting'::regclass`;
    expect(restricciones.map((r) => `${r.conname}|${r.tipo}`).sort()).toEqual([
      "app_setting_pkey|p",
      "chk_app_setting_single_row|c",
    ]);
  });

  test("volver a aplicarla no pisa un valor ya editado", async () => {
    await base().unsafe("update app_setting set static_mode = false");
    await base().unsafe(migracion);
    const [fila] = await base()`select static_mode from app_setting where id = 1`;
    expect(fila?.static_mode).toBe(false);
  });

  test("la tabla no admite una segunda fila", async () => {
    expect(await rechazo("insert into app_setting (id, static_mode) values (2, false)")).toBe(
      "23514|chk_app_setting_single_row",
    );
    expect(await rechazo("insert into app_setting (static_mode) values (false)")).toBe("23505|app_setting_pkey");
  });

  test("el lector real lee la fila en true y en false, por encima del respaldo", async () => {
    expect(await lectorReal(false)()).toBe(true);
    await base().unsafe("update app_setting set static_mode = false");
    expect(await lectorReal(true)()).toBe(false);
  });

  test("sin la fila el repositorio devuelve null y el lector real usa el respaldo", async () => {
    await base().unsafe("delete from app_setting");
    expect(await repositorio.leerModoEstatico()).toBeNull();
    expect(await lectorReal(true)()).toBe(true);
    expect(await lectorReal(false)()).toBe(false);
  });
});
