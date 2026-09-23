import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { EventBus } from "../../src/events/index.js";
import { TimeBlocksRepository } from "../../src/modules/time-blocks/time-blocks.repository.js";
import { TimeBlocksService } from "../../src/modules/time-blocks/time-blocks.service.js";
import type { TimeBlockInput } from "../../src/modules/time-blocks/time-blocks.types.js";

/**
 * RS-BE-30, RS-BE-31 y RS-BE-32 contra un PostgreSQL de verdad.
 *
 * Las demás pruebas del módulo no tocan una base: `time-blocks.repository.test.ts`
 * compara el SQL renderizado y `time-blocks.routes.test.ts` usa una base falsa
 * que reinterpreta el texto de cada sentencia. Esta es la única que le manda
 * los nueve métodos del repository a Postgres, que es donde aparece la clase
 * de fallo que ya pasó dos veces en este backend (el 42809 de un arreglo
 * interpolado y el `Date` como parámetro).
 *
 * Solo corre con `TEST_DATABASE_URL`. Sin esa variable se salta entera, así que
 * `bun test` sigue sin tocar ninguna base. Con ella exige dos cosas antes de
 * escribir nada:
 *   - que el host sea local (localhost, 127.0.0.1 o ::1), para que nunca llegue
 *     a Neon ni a otra base remota;
 *   - que la base esté vacía: si ya existe `public.student`, se niega.
 * Todo corre en UNA transacción que se deshace al final (`rollback`), y cada
 * prueba en un savepoint propio, así que la base queda vacía como estaba y se
 * puede reusar. Dentro de la transacción crea un `student` mínimo (solo `id`,
 * lo único que mira la FK), aplica `drizzle/0012_time_blocks.sql` dos veces
 * (la segunda prueba que es idempotente) y siembra dos alumnos.
 *
 * Cómo correrla con un Postgres desechable (producción es PostgreSQL 17; el
 * 16 de Homebrew también sirve):
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -k $PGTMP" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres bloques
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/bloques \
 *     bun test test/HU35_jeff/time-blocks.postgres.test.ts
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -w stop && rm -rf "$PGTMP"
 *
 * El prefijo `DATABASE_URL=…` sigue siendo obligatorio, como en toda la suite:
 * el `.env` del worktree apunta a producción y bun lo carga solo.
 *
 * Datos INVENTADOS (el repo es público). Como en `time-blocks.routes.test.ts`,
 * el alumno sintético 20230001 tiene `student.id` 42 y el 43 es "otro alumno".
 * Calendario 2026: 05-10 y 12-10 son lunes; 07-10 y 14-10, miércoles.
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

/** El bloque del ejemplo del contrato de la spec (`time-blocks.spec.md`, "Contrato"). */
const PRACTICAS: TimeBlockInput = {
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-01",
  endDate: "2026-12-15",
};

let cliente: postgres.Sql | null = null;
let repositorio: TimeBlocksRepository;
let servicio: TimeBlocksService;

const base = (): postgres.Sql => {
  if (!cliente) throw new Error("La conexión de prueba no se abrió (ver beforeAll).");
  return cliente;
};

/** Corre una sentencia en su propio savepoint y devuelve `SQLSTATE|restricción`
 *  si la base la rechaza, o null si la acepta. Siempre deshace lo que haya hecho. */
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

/** Un `insert` de una fila válida de `student_time_block`, con las columnas que
 *  se quieran cambiar escritas como literales SQL. */
const insertarBloque = (cambios: Record<string, string> = {}): string => {
  const valores: Record<string, string> = {
    student_id: String(ALUMNO),
    title: "'Prueba'",
    color_hex: "'#F94B3F'",
    days_of_week: "'{1,3}'",
    start_time: "'14:00'",
    end_time: "'18:00'",
    start_date: "'2026-09-01'",
    end_date: "'2026-12-15'",
    ...cambios,
  };
  return `insert into student_time_block (${Object.keys(valores).join(", ")})
          values (${Object.values(valores).join(", ")})`;
};

// Los ganchos de la conexión van fuera del `describe` a propósito: dentro de un
// `describe` saltado, bun 1.4 cuenta cada beforeAll y afterAll como una prueba
// saltada más. Sin TEST_DATABASE_URL los dos vuelven sin hacer nada.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error(
      "TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1): esta prueba escribe tablas y filas.",
    );
  }
  const migracion = await Bun.file("drizzle/0012_time_blocks.sql").text();

  // max: 1 deja abrir la transacción a mano y garantiza que todas las
  // sentencias, las del repository incluidas, vayan por la misma conexión.
  // onnotice calla los "already exists, skipping" de la segunda aplicación.
  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  const database: typeof db = drizzle(cliente, { schema: { ...schema, ...relations } });
  repositorio = new TimeBlocksRepository(database);
  servicio = new TimeBlocksService(repositorio, new EventBus());

  await cliente.unsafe("begin");
  const [previa] = await cliente`select to_regclass('public.student') is not null as hay_student`;
  if (previa?.hay_student) {
    throw new Error(
      "La base de TEST_DATABASE_URL ya tiene public.student: usa una base vacía y desechable (createdb).",
    );
  }
  await cliente.unsafe("create table public.student (id integer primary key)");
  await cliente.unsafe(migracion);
  await cliente.unsafe(migracion);
  await cliente.unsafe(`insert into public.student (id) values (${ALUMNO}), (${OTRO_ALUMNO})`);
});

afterAll(async () => {
  if (!cliente) return;
  await cliente.unsafe("rollback").catch(() => {});
  await cliente.end();
});

describe.skipIf(!URL_DE_PRUEBA)("time-blocks contra PostgreSQL real (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    if (cliente) await cliente.unsafe("savepoint caso");
  });

  afterEach(async () => {
    if (cliente) await cliente.unsafe("rollback to savepoint caso");
  });

  test("la 0012 aplicada dos veces deja el catalogo del paso D: 13 restricciones, indice, enum y FK en cascada", async () => {
    const restricciones = await base()`
      select conrelid::regclass::text as tabla, conname, contype::text as tipo
        from pg_constraint
       where conrelid in ('public.student_time_block'::regclass,
                          'public.student_time_block_exception'::regclass)
         and contype in ('c', 'f', 'p', 'u')`;
    expect(restricciones.map((r) => `${r.tabla}|${r.conname}|${r.tipo}`).sort()).toEqual([
      "student_time_block_exception|chk_time_block_exc_grilla|c",
      "student_time_block_exception|chk_time_block_exc_movido|c",
      "student_time_block_exception|student_time_block_exception_block_id_student_time_block_id_fk|f",
      "student_time_block_exception|student_time_block_exception_pkey|p",
      "student_time_block_exception|uq_time_block_exception|u",
      "student_time_block|chk_time_block_color|c",
      "student_time_block|chk_time_block_dias|c",
      "student_time_block|chk_time_block_fechas|c",
      "student_time_block|chk_time_block_grilla|c",
      "student_time_block|chk_time_block_horas|c",
      "student_time_block|chk_time_block_titulo|c",
      "student_time_block|student_time_block_pkey|p",
      "student_time_block|student_time_block_student_id_student_id_fk|f",
    ]);

    const cascadas = await base()`
      select conname, confdeltype::text as al_borrar
        from pg_constraint
       where contype = 'f'
         and conrelid in ('public.student_time_block'::regclass,
                          'public.student_time_block_exception'::regclass)`;
    expect(cascadas.map((r) => `${r.conname}|${r.al_borrar}`).sort()).toEqual([
      "student_time_block_exception_block_id_student_time_block_id_fk|c",
      "student_time_block_student_id_student_id_fk|c",
    ]);

    const [otros] = await base()`
      select to_regclass('public.idx_time_block_student')::text as indice,
             enum_range(null::public.time_block_exception_status)::text as estados,
             (select count(*) from information_schema.columns
               where table_schema = 'public' and table_name = 'student_time_block')::int as columnas_bloque,
             (select count(*) from information_schema.columns
               where table_schema = 'public' and table_name = 'student_time_block_exception')::int as columnas_excepcion`;
    expect([otros?.indice, otros?.estados, otros?.columnas_bloque, otros?.columnas_excepcion])
      .toEqual(["idx_time_block_student", "{cancelled,moved}", 11, 6]);
  });

  test("recorrido de las siete rutas por el service: codigos, formas y nada guardado al final", async () => {
    // GET /time-blocks/me, sin bloques todavía.
    expect(await servicio.listBlocks(ALUMNO)).toEqual({ blocks: [] });

    // POST: días en otro orden y otra hora de fin, para ver que el orden de los
    // días vuelve como se mandó y que el PATCH reemplaza la regla entera.
    const { block: creado } = await servicio.createBlock(ALUMNO, {
      ...PRACTICAS,
      daysOfWeek: [3, 1],
      endTime: "17:00",
    });
    const id = creado.id;
    expect(Number.isInteger(id) && id > 0).toBe(true);
    expect(creado).toEqual({ ...PRACTICAS, id, daysOfWeek: [3, 1], endTime: "17:00", exceptions: [] });

    // PATCH: queda el bloque del ejemplo del contrato.
    expect(await servicio.updateBlock(ALUMNO, id, PRACTICAS)).toEqual({
      block: { ...PRACTICAS, id, exceptions: [] },
    });

    // PUT cancelado, dos veces: la segunda deja el mismo estado.
    const cancelado = { date: "2026-10-07", status: "cancelled" as const, startTime: null, endTime: null };
    expect(await servicio.setException(ALUMNO, id, "2026-10-07", { status: "cancelled" }))
      .toEqual({ exception: cancelado });
    expect(await servicio.setException(ALUMNO, id, "2026-10-07", { status: "cancelled" }))
      .toEqual({ exception: cancelado });

    // PUT movido, dos veces con horas distintas: el on conflict reemplaza.
    const movido = { date: "2026-10-12", status: "moved" as const, startTime: "15:00", endTime: "19:30" };
    await servicio.setException(ALUMNO, id, "2026-10-12", {
      status: "moved", startTime: "16:00", endTime: "20:00",
    });
    expect(await servicio.setException(ALUMNO, id, "2026-10-12", {
      status: "moved", startTime: "15:00", endTime: "19:30",
    })).toEqual({ exception: movido });

    // PATCH con las excepciones ya guardadas: las conserva (RS-BE-31).
    expect(await servicio.updateBlock(ALUMNO, id, PRACTICAS)).toEqual({
      block: { ...PRACTICAS, id, exceptions: [cancelado, movido] },
    });

    // GET /time-blocks/me
    expect(await servicio.listBlocks(ALUMNO)).toEqual({
      blocks: [{ ...PRACTICAS, id, exceptions: [cancelado, movido] }],
    });

    // GET /time-blocks/me/occurrences: el ejemplo del contrato, 4 y 8.5 horas.
    const ocurrencia = { blockId: id, title: PRACTICAS.title, colorHex: PRACTICAS.colorHex };
    expect(await servicio.occurrences(ALUMNO, "2026-10-05", "2026-10-18")).toEqual({
      occurrences: [
        { ...ocurrencia, date: "2026-10-05", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", moved: false },
        { ...ocurrencia, date: "2026-10-12", dayOfWeek: 1, startTime: "15:00", endTime: "19:30", moved: true },
        { ...ocurrencia, date: "2026-10-14", dayOfWeek: 3, startTime: "14:00", endTime: "18:00", moved: false },
      ],
      weeks: [
        { weekStart: "2026-10-05", hours: 4 },
        { weekStart: "2026-10-12", hours: 8.5 },
      ],
    });

    // DELETE de la excepción movida: ese día vuelve al patrón.
    expect(await servicio.clearException(ALUMNO, id, "2026-10-12")).toEqual({ ok: true });
    expect(await servicio.listBlocks(ALUMNO)).toEqual({
      blocks: [{ ...PRACTICAS, id, exceptions: [cancelado] }],
    });

    // DELETE del bloque, y el mismo DELETE otra vez: 404.
    expect(await servicio.deleteBlock(ALUMNO, id)).toEqual({ ok: true });
    await expect(servicio.deleteBlock(ALUMNO, id)).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });

    // No queda nada: la excepción cancelada se fue en cascada con su bloque.
    expect(await servicio.listBlocks(ALUMNO)).toEqual({ blocks: [] });
    const [quedan] = await base()`
      select (select count(*) from student_time_block)::int as bloques,
             (select count(*) from student_time_block_exception)::int as excepciones`;
    expect([quedan?.bloques, quedan?.excepciones]).toEqual([0, 0]);
  });

  test("cada sentencia queda acotada por alumno: el bloque de otro responde como uno que no existe", async () => {
    const propio = await repositorio.insertBlock(ALUMNO, { ...PRACTICAS, title: "Trabajo" });
    const ajeno = await repositorio.insertBlock(OTRO_ALUMNO, PRACTICAS);
    const excepcionAjena = await repositorio.upsertException(
      OTRO_ALUMNO, ajeno.id, "2026-10-07", "cancelled", null, null,
    );
    const guardada = {
      blockId: ajeno.id, date: "2026-10-07", status: "cancelled" as const, startTime: null, endTime: null,
    };
    expect(excepcionAjena).toEqual(guardada);

    expect(await repositorio.countBlocks(ALUMNO)).toBe(1);
    expect(await repositorio.countBlocks(OTRO_ALUMNO)).toBe(1);
    expect(await repositorio.findBlocks(ALUMNO)).toEqual([propio]);
    expect(await repositorio.findBlockOwnedBy(ALUMNO, propio.id)).toEqual(propio);

    // Las seis sentencias que reciben un id de bloque, con el ajeno: ninguna lo ve ni lo toca.
    expect(await repositorio.findBlockOwnedBy(ALUMNO, ajeno.id)).toBeNull();
    expect(await repositorio.updateBlock(ALUMNO, ajeno.id, { ...PRACTICAS, title: "Ajeno" })).toBeNull();
    expect(await repositorio.upsertException(ALUMNO, ajeno.id, "2026-10-12", "cancelled", null, null))
      .toBeNull();
    expect(await repositorio.findExceptions(ALUMNO, [ajeno.id, propio.id])).toEqual([]);
    expect(await repositorio.deleteException(ALUMNO, ajeno.id, "2026-10-07")).toBe(false);
    expect(await repositorio.deleteBlock(ALUMNO, ajeno.id)).toBe(false);

    // Un id que no existe responde igual.
    expect(await repositorio.findBlockOwnedBy(ALUMNO, 2147483647)).toBeNull();
    expect(await repositorio.upsertException(ALUMNO, 2147483647, "2026-10-12", "cancelled", null, null))
      .toBeNull();

    // Lo del otro alumno sigue intacto.
    expect(await repositorio.findBlockOwnedBy(OTRO_ALUMNO, ajeno.id)).toEqual(ajeno);
    expect(await repositorio.findExceptions(OTRO_ALUMNO, [ajeno.id])).toEqual([guardada]);

    // El borrado de una excepción propia: true la primera vez y false al repetirlo.
    await repositorio.upsertException(ALUMNO, propio.id, "2026-10-14", "moved", "15:00", "19:30");
    expect(await repositorio.deleteException(ALUMNO, propio.id, "2026-10-14")).toBe(true);
    expect(await repositorio.deleteException(ALUMNO, propio.id, "2026-10-14")).toBe(false);
  });

  test("findBlocks ordena por fecha e id, respeta el orden de los dias y findExceptions ordena por fecha", async () => {
    const octubre = await repositorio.insertBlock(ALUMNO, {
      ...PRACTICAS, startDate: "2026-10-01", startTime: "09:00", endTime: "11:00",
    });
    const tarde = await repositorio.insertBlock(ALUMNO, {
      ...PRACTICAS, daysOfWeek: [5, 2, 7], startTime: "16:00", endTime: "18:00",
    });
    const temprano = await repositorio.insertBlock(ALUMNO, {
      ...PRACTICAS, startTime: "08:00", endTime: "10:00",
    });
    const empate = await repositorio.insertBlock(ALUMNO, {
      ...PRACTICAS, startTime: "08:00", endTime: "10:00",
    });

    expect(tarde.daysOfWeek).toEqual([5, 2, 7]);
    const bloques = await repositorio.findBlocks(ALUMNO);
    expect(bloques.map((b) => b.id)).toEqual([temprano.id, empate.id, tarde.id, octubre.id]);
    expect(bloques.find((b) => b.id === tarde.id)?.daysOfWeek).toEqual([5, 2, 7]);

    await repositorio.upsertException(ALUMNO, octubre.id, "2026-10-20", "cancelled", null, null);
    await repositorio.upsertException(ALUMNO, temprano.id, "2026-10-06", "cancelled", null, null);
    await repositorio.upsertException(ALUMNO, tarde.id, "2026-10-06", "moved", "17:00", "19:00");
    const excepciones = await repositorio.findExceptions(ALUMNO, bloques.map((b) => b.id));
    expect(excepciones.map((e) => `${e.date}|${e.blockId}`)).toEqual([
      `2026-10-06|${tarde.id}`,
      `2026-10-06|${temprano.id}`,
      `2026-10-20|${octubre.id}`,
    ]);
  });

  test("la base rechaza lo que Zod y el service nunca le deberian mandar", async () => {
    // Control: la fila base es válida, así que cada rechazo es por el cambio.
    expect(await rechazo(insertarBloque())).toBeNull();

    expect(await rechazo(insertarBloque({ days_of_week: "'{}'" }))).toBe("23514|chk_time_block_dias");
    expect(await rechazo(insertarBloque({ days_of_week: "'{0,1}'" }))).toBe("23514|chk_time_block_dias");
    expect(await rechazo(insertarBloque({ end_time: "'22:01'" }))).toBe("23514|chk_time_block_grilla");
    expect(await rechazo(insertarBloque({ start_time: "'18:00'" }))).toBe("23514|chk_time_block_horas");
    expect(await rechazo(insertarBloque({ end_date: "'2026-08-31'" }))).toBe("23514|chk_time_block_fechas");
    expect(await rechazo(insertarBloque({ color_hex: "'#GGGGGG'" }))).toBe("23514|chk_time_block_color");
    expect(await rechazo(insertarBloque({ title: "'   '" }))).toBe("23514|chk_time_block_titulo");
    expect(await rechazo(insertarBloque({ student_id: "999" })))
      .toBe("23503|student_time_block_student_id_student_id_fk");

    const bloque = await repositorio.insertBlock(ALUMNO, PRACTICAS);
    const excepcion = (cambios: string) =>
      `insert into student_time_block_exception (block_id, occurrence_date, status, start_time, end_time)
       values (${bloque.id}, '2026-10-07', ${cambios})`;
    expect(await rechazo(excepcion("'cancelled', null, null"))).toBeNull();
    expect(await rechazo(excepcion("'cancelled', '14:00', '15:00'"))).toBe("23514|chk_time_block_exc_movido");
    expect(await rechazo(excepcion("'moved', '16:00', '15:00'"))).toBe("23514|chk_time_block_exc_movido");
    expect(await rechazo(excepcion("'moved', '06:00', '09:00'"))).toBe("23514|chk_time_block_exc_grilla");
    expect(await rechazo(excepcion("'otro', null, null"))).toBe("22P02|");

    await repositorio.upsertException(ALUMNO, bloque.id, "2026-10-07", "cancelled", null, null);
    expect(await rechazo(excepcion("'cancelled', null, null"))).toBe("23505|uq_time_block_exception");
  });
});
