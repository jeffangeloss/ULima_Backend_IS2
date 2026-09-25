import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { ChatbotRepository } from "../../src/modules/chatbot/chatbot.repository.js";

/**
 * BR-CB-22 (retención por ciclo), BR-CB-20 (historial) y BR-CB-21 (guardado
 * atómico) contra un PostgreSQL de verdad.
 *
 * La purga compara `updated_at`, un `timestamp` sin zona, con la medianoche de
 * Lima del `start_date` del período activo llevada a la zona de la sesión de la
 * base. Esa conversión, la condición «solo si el período ya empezó» y la
 * cascada de los mensajes viven en el SQL, así que solo una base real las
 * prueba. Lo mismo pasa con `clock_timestamp()` dentro de la transacción de
 * `saveExchange` y con el error 23503 que envuelve Drizzle.
 *
 * Solo corre con `TEST_DATABASE_URL`. Sin esa variable se salta entera y no
 * toca ninguna base. Con ella exige, como `chatbot.delegates.postgres.test.ts`,
 * que el host sea local y que la base esté vacía (sin `public.student`). Todo
 * corre dentro de UNA transacción de Drizzle que se deshace al final, y cada
 * prueba en su propio savepoint. `saveExchange` abre su transacción como
 * savepoint anidado, así que el todo o nada se prueba igual. Aplica el esquema
 * real de las tablas: `drizzle/0000_baseline.sql`, `drizzle/0003_spicy_ironclad.sql`
 * (las del chatbot) y `drizzle/0013_chatbot_message_history.sql`, dos veces para
 * probar que es idempotente.
 *
 * Dentro de una transacción `now()` no avanza, así que «hoy» es el día de Lima
 * del inicio de la transacción y las fechas de los períodos se calculan desde
 * ahí.
 *
 * Cómo correrla con un Postgres desechable (producción es PostgreSQL 17; el 16
 * de Homebrew también sirve):
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres retencion
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/retencion \
 *     bun test test/HU28_ronald/chatbot.retention.postgres.test.ts
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -w stop && rm -rf "$PGTMP"
 *
 * Datos INVENTADOS (el repo es público): la alumna sintética 20230001, nombres
 * de fantasía y correos en el dominio reservado `.invalid`.
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

// Cohere falso, solo cuando la prueba corre: ninguna pregunta de este archivo
// sale a la red. `alResponder` deja simular que la sesión se borra mientras el
// alumno espera la respuesta.
let llamadasACohere = 0;
let alResponder: (() => Promise<void>) | null = null;
if (URL_DE_PRUEBA) {
  mock.module("../../src/services/cohere.client.js", () => ({
    cohereClient: {
      chatWithHistory: async () => {
        llamadasACohere++;
        if (alResponder) await alResponder();
        return "respuesta inventada del bot";
      },
      generateTitle: async () => "titulo inventado",
    },
  }));
}

afterAll(() => {
  mock.restore();
});

type Transaccion = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

let cliente: postgres.Sql | null = null;
let abierta: Transaccion | null = null;
let soltar: (() => void) | null = null;
let terminada: Promise<unknown> | null = null;
let repositorio: ChatbotRepository;
let alumna = 0;
let contador = 0;

const tx = (): Transaccion => {
  if (!abierta) throw new Error("La transacción de prueba no se abrió (ver beforeAll).");
  return abierta;
};

const filas = async <T = Record<string, unknown>>(consulta: SQL): Promise<T[]> =>
  (await tx().execute(consulta)) as unknown as T[];

const unaFila = async <T = Record<string, unknown>>(consulta: SQL): Promise<T> => (await filas<T>(consulta))[0];

/** app_user + student; devuelve `student.id`. */
const persona = async (nombre: string, codigo?: string): Promise<number> => {
  contador++;
  const usuario = await unaFila<{ id: number }>(sql`
    insert into app_user (code, full_name, institutional_email, password_hash)
    values (${codigo ?? `INV-${contador}`}, ${nombre}, ${`persona${contador}@ejemplo.invalid`}, 'sin-uso')
    returning id`);
  const estudiante = await unaFila<{ id: number }>(sql`
    insert into student (user_id, career_id, curriculum_id) values (${usuario.id}, 1, 1) returning id`);
  return estudiante.id;
};

/** «Hoy» en Lima según la base (el día de `now()` en esta transacción), más `dias`. */
const diaDeLima = async (dias = 0): Promise<string> => {
  const r = await unaFila<{ dia: string }>(sql`
    select ((now() at time zone 'America/Lima')::date + ${dias}::int)::text as dia`);
  return r.dia;
};

/** Suma días a una fecha YYYY-MM-DD, en la base para no depender del huso del proceso. */
const sumarDias = async (dia: string, dias: number): Promise<string> => {
  const r = await unaFila<{ dia: string }>(sql`select (${dia}::date + ${dias}::int)::text as dia`);
  return r.dia;
};

const periodo = async (codigo: string, inicio: string, activo: boolean): Promise<void> => {
  const fin = await sumarDias(inicio, 120);
  await tx().execute(sql`
    insert into academic_period (code, start_date, end_date, is_active)
    values (${codigo}, ${inicio}::date, ${fin}::date, ${activo})`);
};

/** Sesión con `updated_at` fijo (texto `YYYY-MM-DD HH:MI:SS[.ffffff]`, hora de pared de la base). */
const sesion = async (estudiante: number, ultimaActividad: string, mensajes = 0): Promise<string> => {
  const s = await unaFila<{ id: string }>(sql`
    insert into chatbot_session (student_id, created_at, updated_at)
    values (${estudiante}, ${ultimaActividad}::timestamp, ${ultimaActividad}::timestamp)
    returning id`);
  for (let i = 0; i < mensajes; i++) {
    await tx().execute(sql`
      insert into chatbot_message (session_id, role, content, created_at)
      values (${s.id}, ${i % 2 === 0 ? "user" : "assistant"}, ${`mensaje inventado ${i + 1}`},
              ${ultimaActividad}::timestamp - make_interval(mins => ${mensajes - i}::int))`);
  }
  return s.id;
};

const existe = async (id: string): Promise<boolean> =>
  (await unaFila<{ n: number }>(sql`select count(*)::int as n from chatbot_session where id = ${id}::uuid`)).n === 1;

const mensajesDe = async (id: string): Promise<number> =>
  (await unaFila<{ n: number }>(sql`select count(*)::int as n from chatbot_message where session_id = ${id}::uuid`)).n;

const totales = async (): Promise<{ sesiones: number; mensajes: number }> =>
  unaFila(sql`
    select (select count(*)::int from chatbot_session) as sesiones,
           (select count(*)::int from chatbot_message) as mensajes`);

const purgar = () => repositorio.purgeSessionsBeforeActivePeriod();

/** Busca el código de error de PostgreSQL en el error o en su cadena de `cause`. */
const codigoDeError = (error: unknown): string | undefined => {
  let actual: unknown = error;
  for (let i = 0; i < 5 && actual; i++) {
    const codigo = (actual as { code?: unknown }).code;
    if (typeof codigo === "string") return codigo;
    actual = (actual as { cause?: unknown }).cause;
  }
  return undefined;
};

// Los ganchos de la conexión van fuera del `describe`, como en las otras
// pruebas de Postgres: sin TEST_DATABASE_URL vuelven sin hacer nada.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error(
      "TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1): esta prueba escribe tablas y filas.",
    );
  }
  const baseline = await Bun.file("drizzle/0000_baseline.sql").text();
  const tablasDelChatbot = await Bun.file("drizzle/0003_spicy_ironclad.sql").text();
  const indiceDelHistorial = await Bun.file("drizzle/0013_chatbot_message_history.sql").text();

  // max: 1 hace que todo, también el savepoint de `saveExchange`, vaya por la
  // misma conexión y dentro de la misma transacción.
  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  const database: typeof db = drizzle(cliente, { schema: { ...schema, ...relations } });

  // La transacción queda abierta hasta afterAll, que la suelta y la deshace.
  let entregar!: (t: Transaccion) => void;
  const lista = new Promise<Transaccion>((resolver) => {
    entregar = resolver;
  });
  const fin = new Promise<void>((resolver) => {
    soltar = resolver;
  });
  const transaccion = database.transaction(async (t) => {
    entregar(t);
    await fin;
    t.rollback();
  });
  terminada = transaccion.catch(() => {});
  // Si la transacción no llega a abrirse (sin conexión, por ejemplo), la carrera
  // termina con ese error en vez de quedarse esperando.
  const terminoAntes = transaccion.then(() => {
    throw new Error("La transacción de prueba terminó antes de empezar las pruebas.");
  });
  terminoAntes.catch(() => {});
  abierta = await Promise.race([lista, terminoAntes]);

  const previa = await unaFila<{ hay_student: boolean }>(
    sql`select to_regclass('public.student') is not null as hay_student`,
  );
  if (previa.hay_student) {
    throw new Error("La base de TEST_DATABASE_URL ya tiene public.student: usa una base vacía y desechable (createdb).");
  }
  // Sin parámetros, postgres.js usa el protocolo simple y acepta varias sentencias.
  await tx().execute(sql.raw(baseline));
  await tx().execute(sql.raw(tablasDelChatbot));
  await tx().execute(sql.raw(indiceDelHistorial));
  await tx().execute(sql.raw(indiceDelHistorial));

  repositorio = new ChatbotRepository(tx() as unknown as typeof db);
  alumna = await persona("LUCIA INVENTADA PAREDES", "20230001");
});

afterAll(async () => {
  if (soltar) soltar();
  if (terminada) await terminada;
  if (cliente) await cliente.end();
});

const conSavepoint = () => {
  beforeEach(async () => {
    if (abierta) await tx().execute(sql.raw("savepoint caso"));
    llamadasACohere = 0;
    alResponder = null;
  });

  afterEach(async () => {
    if (abierta) await tx().execute(sql.raw("rollback to savepoint caso"));
  });
};

describe.skipIf(!URL_DE_PRUEBA)("BR-CB-20: la migración 0013 contra PostgreSQL real", () => {
  test("el índice queda creado sobre (session_id, created_at), también tras aplicarla dos veces", async () => {
    const indice = await unaFila<{ definicion: string }>(sql`
      select indexdef as definicion from pg_indexes
      where tablename = 'chatbot_message' and indexname = 'idx_chatbot_message_session_created'`);
    expect(indice.definicion).toContain("(session_id, created_at)");
  });
});

describe.skipIf(!URL_DE_PRUEBA)("BR-CB-22: purga por ciclo contra PostgreSQL real (TEST_DATABASE_URL)", () => {
  conSavepoint();

  test("borra la sesión con actividad antes del inicio del período activo, con sus mensajes", async () => {
    const inicio = await diaDeLima(-30);
    await periodo("2026-2", inicio, true);
    const vieja = await sesion(alumna, `${await sumarDias(inicio, -3)} 10:00:00`, 4);

    await purgar();

    expect(await existe(vieja)).toBe(false);
    expect(await mensajesDe(vieja)).toBe(0);
  });

  test("deja la sesión con actividad después del inicio, también sus mensajes anteriores al inicio", async () => {
    const inicio = await diaDeLima(-30);
    await periodo("2026-2", inicio, true);
    const viva = await sesion(alumna, `${await sumarDias(inicio, 3)} 10:00:00`, 2);
    // Un mensaje del ciclo anterior dentro de una sesión que sigue viva.
    await tx().execute(sql`
      insert into chatbot_message (session_id, role, content, created_at)
      values (${viva}::uuid, 'user', 'mensaje inventado del ciclo anterior', ${`${await sumarDias(inicio, -10)} 09:00:00`}::timestamp)`);

    await purgar();

    expect(await existe(viva)).toBe(true);
    expect(await mensajesDe(viva)).toBe(3);
  });

  test("un período activo que todavía no empieza no borra nada", async () => {
    const inicio = await diaDeLima(1);
    await periodo("2026-2", inicio, true);
    const vieja = await sesion(alumna, `${await sumarDias(inicio, -60)} 10:00:00`, 2);

    await purgar();

    expect(await existe(vieja)).toBe(true);
    expect(await mensajesDe(vieja)).toBe(2);
  });

  test("un período activo que empieza hoy en Lima sí purga", async () => {
    const inicio = await diaDeLima(0);
    await periodo("2026-2", inicio, true);
    const vieja = await sesion(alumna, `${await sumarDias(inicio, -1)} 10:00:00`);

    await purgar();

    expect(await existe(vieja)).toBe(false);
  });

  test("sin período activo no borra nada, aunque haya períodos inactivos ya empezados", async () => {
    await periodo("2026-1", await diaDeLima(-200), false);
    await periodo("2026-2", await diaDeLima(-30), false);
    const vieja = await sesion(alumna, `${await diaDeLima(-100)} 10:00:00`, 2);

    await purgar();

    expect(await existe(vieja)).toBe(true);
    expect(await mensajesDe(vieja)).toBe(2);
  });

  test("el corte es el inicio del período ACTIVO y no el de un inactivo más reciente", async () => {
    const inicio = await diaDeLima(-30);
    await periodo("2026-2", inicio, true);
    await periodo("2027-0", await diaDeLima(-5), false);
    const entreLosDos = await sesion(alumna, `${await diaDeLima(-10)} 10:00:00`);

    await purgar();

    expect(await existe(entreLosDos)).toBe(true);
  });

  test("el alcance es global: borra las sesiones vencidas de todos los alumnos", async () => {
    const inicio = await diaDeLima(-30);
    await periodo("2026-2", inicio, true);
    const otro = await persona("MATEO INVENTADO RIOS");
    const antes = `${await sumarDias(inicio, -2)} 10:00:00`;
    const deLaAlumna = await sesion(alumna, antes);
    const delOtro = await sesion(otro, antes);

    await purgar();

    expect(await existe(deLaAlumna)).toBe(false);
    expect(await existe(delOtro)).toBe(false);
  });

  test("es idempotente: la segunda purga no borra nada más", async () => {
    const inicio = await diaDeLima(-30);
    await periodo("2026-2", inicio, true);
    await sesion(alumna, `${await sumarDias(inicio, -2)} 10:00:00`, 2);
    const viva = await sesion(alumna, `${await sumarDias(inicio, 2)} 10:00:00`, 2);

    await purgar();
    const trasLaPrimera = await totales();
    await purgar();

    expect(await totales()).toEqual(trasLaPrimera);
    expect(trasLaPrimera).toEqual({ sesiones: 1, mensajes: 2 });
    expect(await existe(viva)).toBe(true);
  });

  // La frontera: la medianoche de Lima del inicio, escrita a mano en la hora de
  // pared de tres zonas de la sesión de la base. Lima es UTC-5 todo el año.
  const FRONTERAS: Array<{ zona: string; ultimoInstanteAntes: (d: string, anterior: string) => string; medianoche: (d: string) => string }> = [
    { zona: "UTC", ultimoInstanteAntes: (d) => `${d} 04:59:59.999999`, medianoche: (d) => `${d} 05:00:00` },
    { zona: "America/Lima", ultimoInstanteAntes: (_d, anterior) => `${anterior} 23:59:59.999999`, medianoche: (d) => `${d} 00:00:00` },
    { zona: "Asia/Tokyo", ultimoInstanteAntes: (d) => `${d} 13:59:59.999999`, medianoche: (d) => `${d} 14:00:00` },
  ];

  for (const frontera of FRONTERAS) {
    test(`frontera de la medianoche de Lima con la sesión de la base en ${frontera.zona}`, async () => {
      await tx().execute(sql.raw(`set local timezone = '${frontera.zona}'`));
      const inicio = await diaDeLima(-30);
      const anterior = await sumarDias(inicio, -1);
      await periodo("2026-2", inicio, true);
      const justoAntes = await sesion(alumna, frontera.ultimoInstanteAntes(inicio, anterior));
      const enLaMedianoche = await sesion(alumna, frontera.medianoche(inicio));

      await purgar();

      expect(await existe(justoAntes)).toBe(false);
      expect(await existe(enLaMedianoche)).toBe(true);
    });
  }

  test("la consulta de conteo de «Primera purga en producción» cuenta lo mismo que borra la purga", async () => {
    const inicio = await diaDeLima(-30);
    await periodo("2026-2", inicio, true);
    const otro = await persona("MATEO INVENTADO RIOS");
    // Lejos de la frontera, para que el resultado no dependa de la zona de la
    // sesión de la base; la frontera tiene sus propias pruebas.
    await sesion(alumna, `${await sumarDias(inicio, -2)} 10:00:00`, 3);
    await sesion(alumna, `${await sumarDias(inicio, -40)} 10:00:00`, 0);
    await sesion(otro, `${await sumarDias(inicio, -3)} 23:00:00`, 5);
    await sesion(otro, `${await sumarDias(inicio, 2)} 10:00:00`, 2);

    // La consulta sale de la spec, sin el BEGIN READ ONLY ni el ROLLBACK: esta
    // prueba ya corre dentro de una transacción que se deshace.
    const spec = await Bun.file("specs/features/chatbot/chatbot.spec.md").text();
    const bloque = /BEGIN READ ONLY;\n([\s\S]*?)ROLLBACK;/.exec(spec);
    expect(bloque).not.toBeNull();
    const conteo = await unaFila<{ code: string; start_date: string; sesiones: string; mensajes: string; alumnos: string }>(
      sql.raw((bloque as RegExpExecArray)[1]),
    );

    const antes = await totales();
    await purgar();
    const despues = await totales();

    expect(conteo.code).toBe("2026-2");
    expect(Number(conteo.sesiones)).toBe(antes.sesiones - despues.sesiones);
    expect(Number(conteo.mensajes)).toBe(antes.mensajes - despues.mensajes);
    expect(Number(conteo.sesiones)).toBe(3);
    expect(Number(conteo.mensajes)).toBe(8);
    expect(Number(conteo.alumnos)).toBe(2);
  });
});

describe.skipIf(!URL_DE_PRUEBA)("BR-CB-22 y BR-CB-02: el servicio purga antes de buscar la sesión", () => {
  conSavepoint();

  const servicio = async () => {
    const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");
    const horario = { getAssessments: async () => ({ assessments: [] }) } as any;
    const sinBloques = async () => ({ window: { from: "", to: "" }, blocks: [], weeks: [] });
    return new ChatbotService(repositorio, horario, sinBloques, async () => []);
  };

  test("ask sobre una sesión vencida responde 404 SESSION_NOT_FOUND, la borra y no llama a Cohere", async () => {
    await periodo("2026-2", await diaDeLima(-30), true);
    const vieja = await sesion(alumna, `${await diaDeLima(-45)} 10:00:00`, 2);

    const error = await (await servicio())
      .ask(vieja, alumna, { question: "¿Estoy en riesgo?" })
      .catch((e: unknown) => e as Error & { statusCode?: number });

    expect((error as Error).message).toBe("SESSION_NOT_FOUND");
    expect((error as Error & { statusCode?: number }).statusCode).toBe(404);
    expect(llamadasACohere).toBe(0);
    expect(await existe(vieja)).toBe(false);
  });

  test("getSession de una sesión vencida da null y listSessions ya no la lista", async () => {
    await periodo("2026-2", await diaDeLima(-30), true);
    const vieja = await sesion(alumna, `${await diaDeLima(-45)} 10:00:00`);
    const viva = await sesion(alumna, `${await diaDeLima(-2)} 10:00:00`);

    const s = await servicio();
    expect(await s.getSession(vieja, alumna)).toBeNull();
    expect((await s.listSessions(alumna)).map((x) => x.id)).toEqual([viva]);
  });

  test("createSession también purga, y la sesión nueva queda", async () => {
    await periodo("2026-2", await diaDeLima(-30), true);
    const otro = await persona("MATEO INVENTADO RIOS");
    const vencidaDeOtro = await sesion(otro, `${await diaDeLima(-45)} 10:00:00`);

    const nueva = await (await servicio()).createSession(alumna);

    expect(await existe(vencidaDeOtro)).toBe(false);
    expect(await existe(nueva.id)).toBe(true);
  });
});

describe.skipIf(!URL_DE_PRUEBA)("BR-CB-20 y BR-CB-21: historial y guardado atómico contra PostgreSQL real", () => {
  conSavepoint();

  test("getRecentMessages con 30 mensajes devuelve los 10 últimos en orden cronológico", async () => {
    const s = await sesion(alumna, `${await diaDeLima(0)} 10:00:00`);
    // Se insertan desordenados: el orden sale de created_at, no del orden de inserción.
    const orden = Array.from({ length: 30 }, (_, i) => i).sort((a, b) => ((a * 7) % 30) - ((b * 7) % 30));
    for (const i of orden) {
      await tx().execute(sql`
        insert into chatbot_message (session_id, role, content, created_at)
        values (${s}::uuid, ${i % 2 === 0 ? "user" : "assistant"}, ${`turno ${i + 1}`},
                '2026-09-25 08:00:00'::timestamp + make_interval(mins => ${i}::int))`);
    }

    const recientes = await repositorio.getRecentMessages(s, 10);

    expect(recientes.map((m) => m.content)).toEqual(Array.from({ length: 10 }, (_, i) => `turno ${i + 21}`));
    expect(recientes.every((m) => m.sessionId === s)).toBe(true);
  });

  test("saveExchange guarda la pregunta antes que la respuesta y adelanta updated_at", async () => {
    const s = await sesion(alumna, `${await diaDeLima(-2)} 10:00:00`);

    await repositorio.saveExchange(s, "pregunta inventada", "respuesta inventada");

    const guardados = await filas<{ role: string; content: string; created_at: string }>(sql`
      select role, content, created_at::text from chatbot_message
      where session_id = ${s}::uuid order by created_at`);
    expect(guardados.map((m) => [m.role, m.content])).toEqual([
      ["user", "pregunta inventada"],
      ["assistant", "respuesta inventada"],
    ]);
    // clock_timestamp() avanza dentro de la transacción: no empatan.
    expect(guardados[0].created_at < guardados[1].created_at).toBe(true);
    const actividad = await unaFila<{ adelanto: boolean }>(sql`
      select updated_at > ${`${await diaDeLima(-1)} 00:00:00`}::timestamp as adelanto
      from chatbot_session where id = ${s}::uuid`);
    expect(actividad.adelanto).toBe(true);
    expect((await repositorio.getRecentMessages(s, 10)).map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("si falla la respuesta no queda ninguna de las dos filas ni cambia updated_at", async () => {
    const ultimaActividad = `${await diaDeLima(-2)} 10:00:00`;
    const s = await sesion(alumna, ultimaActividad);

    // PostgreSQL no acepta el carácter NUL en `text`: la segunda inserción falla.
    await expect(repositorio.saveExchange(s, "pregunta inventada", "respuesta\u0000rota")).rejects.toThrow();

    expect(await mensajesDe(s)).toBe(0);
    const actividad = await unaFila<{ igual: boolean }>(sql`
      select updated_at = ${ultimaActividad}::timestamp as igual from chatbot_session where id = ${s}::uuid`);
    expect(actividad.igual).toBe(true);
  });

  test("sobre una sesión que ya no existe, el error trae el 23503 en su cadena de cause y no guarda nada", async () => {
    const inexistente = "44444444-4444-4444-8444-444444444444";

    const error = await repositorio.saveExchange(inexistente, "pregunta inventada", "respuesta inventada").catch((e: unknown) => e);

    expect(codigoDeError(error)).toBe("23503");
    expect(await mensajesDe(inexistente)).toBe(0);
  });

  test("ask con la sesión borrada mientras Cohere respondía da 404 SESSION_NOT_FOUND y no guarda nada", async () => {
    await periodo("2026-2", await diaDeLima(-30), true);
    const s = await sesion(alumna, `${await diaDeLima(-1)} 10:00:00`);
    alResponder = async () => {
      await tx().execute(sql`delete from chatbot_session where id = ${s}::uuid`);
    };
    const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");
    const servicio = new ChatbotService(
      repositorio,
      { getAssessments: async () => ({ assessments: [] }) } as any,
      async () => ({ window: { from: "", to: "" }, blocks: [], weeks: [] }),
      async () => [],
    );

    const error = await servicio
      .ask(s, alumna, { question: "¿Estoy en riesgo?" })
      .catch((e: unknown) => e as Error & { statusCode?: number });

    expect(llamadasACohere).toBe(1);
    expect((error as Error).message).toBe("SESSION_NOT_FOUND");
    expect((error as Error & { statusCode?: number }).statusCode).toBe(404);
    expect(await mensajesDe(s)).toBe(0);
  });
});
