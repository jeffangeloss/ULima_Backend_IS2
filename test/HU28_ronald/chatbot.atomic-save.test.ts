import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Hono, type Context } from "hono";

/**
 * BR-CB-21: la pregunta y la respuesta se guardan juntas, en una transacción,
 * después de que Cohere responde.
 *
 * Antes del ajuste la pregunta se guardaba antes de llamar a Cohere, así que un
 * fallo de Cohere dejaba preguntas sin respuesta. Ahora, si Cohere falla, no se
 * escribe nada (503); si falla la transacción, no queda ninguna de las dos filas
 * (500); y si la sesión se borró mientras el alumno esperaba, la violación de
 * llave foránea 23503 se responde como 404 SESSION_NOT_FOUND.
 *
 * La transacción de verdad (el orden por `clock_timestamp()`, el 23503 que
 * envuelve Drizzle y el todo o nada) se prueba contra PostgreSQL en
 * `chatbot.retention.postgres.test.ts`. Datos inventados (repo público).
 */

afterAll(() => {
  mock.restore();
});

/** Lo que hará el Cohere falso en la próxima pregunta. */
let cohereFalla = false;
let llamadasACohere = 0;
/** Registro compartido de llamadas, para comprobar el orden de `ask`. */
const llamadas: string[] = [];

mock.module("../../src/services/cohere.client.js", () => ({
  cohereClient: {
    chatWithHistory: async () => {
      llamadasACohere++;
      llamadas.push("cohere");
      if (cohereFalla) throw new Error("Cohere API error: 500 inventado");
      return "respuesta inventada del bot";
    },
    generateTitle: async () => "titulo inventado",
  },
}));

const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");
const { ChatbotRepository } = await import("../../src/modules/chatbot/chatbot.repository.js");
const { ChatbotController } = await import("../../src/modules/chatbot/chatbot.controller.js");

const SESION = "22222222-2222-4222-8222-222222222222";
const ALUMNA = 42;
const PREGUNTA = "¿Qué nota saqué en el parcial inventado?";
const RESPUESTA = "respuesta inventada del bot";

// ============================================================================
// Parte 1. `saveExchange` en el repositorio, con una base falsa que anota la
// transacción y el SQL de cada sentencia.
// ============================================================================

const dialecto = new PgDialect();
const normalizar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

const baseFalsa = (opciones: { fallaEnLaSentencia?: number } = {}) => {
  const eventos: string[] = [];
  const sentencias: Array<{ sql: string; params: unknown[] }> = [];
  const database = {
    execute: async () => {
      eventos.push("execute fuera de la transacción");
      return [];
    },
    transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      eventos.push("begin");
      const tx = {
        execute: async (q: SQL) => {
          const { sql, params } = dialecto.sqlToQuery(q);
          sentencias.push({ sql: normalizar(sql), params });
          if (opciones.fallaEnLaSentencia === sentencias.length) {
            throw new Error("falla inventada de la sentencia");
          }
          return [];
        },
      };
      try {
        const resultado = await fn(tx);
        eventos.push("commit");
        return resultado;
      } catch (error) {
        eventos.push("rollback");
        throw error;
      }
    },
  };
  return { database, eventos, sentencias };
};

describe("BR-CB-21: ChatbotRepository.saveExchange", () => {
  test("una sola transacción con tres sentencias: pregunta, respuesta y updated_at de la sesión", async () => {
    const { database, eventos, sentencias } = baseFalsa();
    await new ChatbotRepository(database as any).saveExchange(SESION, PREGUNTA, RESPUESTA);

    expect(eventos).toEqual(["begin", "commit"]);
    expect(sentencias.length).toBe(3);
    expect(sentencias[0].sql.startsWith("INSERT INTO chatbot_message")).toBe(true);
    expect(sentencias[0].params).toEqual([SESION, "user", PREGUNTA]);
    expect(sentencias[1].sql.startsWith("INSERT INTO chatbot_message")).toBe(true);
    expect(sentencias[1].params).toEqual([SESION, "assistant", RESPUESTA]);
    expect(sentencias[2].sql).toMatch(/^UPDATE chatbot_session SET updated_at = now\(\) WHERE id = \$1$/);
    expect(sentencias[2].params).toEqual([SESION]);
  });

  test("las dos filas toman created_at = clock_timestamp(), no now(), para no empatar en el ORDER BY", async () => {
    const { database, sentencias } = baseFalsa();
    await new ChatbotRepository(database as any).saveExchange(SESION, PREGUNTA, RESPUESTA);
    for (const insercion of sentencias.slice(0, 2)) {
      expect(insercion.sql).toContain("(session_id, role, content, created_at)");
      expect(insercion.sql).toContain("clock_timestamp()");
      expect(insercion.sql).not.toContain("now()");
    }
  });

  test("nada se escribe fuera de la transacción", async () => {
    const { database, eventos } = baseFalsa();
    await new ChatbotRepository(database as any).saveExchange(SESION, PREGUNTA, RESPUESTA);
    expect(eventos).not.toContain("execute fuera de la transacción");
  });

  test("si falla la respuesta, el error sale de saveExchange y la transacción no confirma", async () => {
    const { database, eventos, sentencias } = baseFalsa({ fallaEnLaSentencia: 2 });
    await expect(new ChatbotRepository(database as any).saveExchange(SESION, PREGUNTA, RESPUESTA)).rejects.toThrow(
      "falla inventada de la sentencia",
    );
    expect(eventos).toEqual(["begin", "rollback"]);
    // No llega a tocar la sesión.
    expect(sentencias.length).toBe(2);
  });
});

// ============================================================================
// Parte 2. `ask` en el servicio, con un repositorio falso que conserva la API
// de antes del ajuste y anota cada escritura.
// ============================================================================

/** Error como el que lanza Drizzle 0.45: el de postgres.js viaja en `cause`. */
const errorDeLlaveForanea = () =>
  Object.assign(new Error("Failed query: insert into chatbot_message ..."), {
    cause: Object.assign(new Error('insert or update on table "chatbot_message" violates foreign key constraint'), {
      code: "23503",
    }),
  });

let falloDeSaveExchange: (() => Error) | null = null;

const repositorioFalso = {
  purgeSessionsBeforeActivePeriod: async () => {
    llamadas.push("purgeSessionsBeforeActivePeriod");
  },
  findSessionById: async (sessionId: string) => {
    llamadas.push("findSessionById");
    return { id: sessionId, studentId: ALUMNA, title: "t", createdAt: new Date(), updatedAt: new Date() };
  },
  getRecentMessages: async () => {
    llamadas.push("getRecentMessages");
    return [];
  },
  saveExchange: async (sessionId: string, question: string, answer: string) => {
    llamadas.push(`saveExchange(${sessionId}, ${question}, ${answer})`);
    if (falloDeSaveExchange) throw falloDeSaveExchange();
  },
  // API de antes del ajuste: cualquier llamada es una escritura fuera de la transacción.
  saveMessage: async () => {
    llamadas.push("saveMessage");
  },
  touchSession: async () => {
    llamadas.push("touchSession");
  },
  getMessages: async () => {
    llamadas.push("getMessages");
    return [];
  },
  updateSessionTitle: async () => {
    llamadas.push("updateSessionTitle");
  },
  getStudentInfo: async () => ({ fullName: "LUCIA INVENTADA PAREDES", careerName: "Ingenieria de Sistemas", currentLevel: 8 }),
  getActiveAcademicPeriod: async () => ({ id: 1, code: "2026-2" }),
  getAcademicWeeksForActivePeriod: async () => [],
  getSchedule: async () => [],
  getCurriculum: async () => [],
  getAlerts: async () => [],
  getAnnouncements: async () => [],
  getSectionRepresentatives: async () => [],
  getOfficialGrades: async () => [],
  getActiveSectionDetails: async () => [],
} as any;

const servicioDeHorario = { getAssessments: async () => ({ assessments: [] }) } as any;
const sinBloquesPropios = async () => ({
  window: { from: "2026-09-21", to: "2026-10-04" },
  blocks: [],
  weeks: [
    { weekStart: "2026-09-21", hours: 0 },
    { weekStart: "2026-09-28", hours: 0 },
  ],
});
const sinChat = async () => ({ results: [], sectionsRead: [] });

const nuevoServicio = () => new ChatbotService(repositorioFalso, servicioDeHorario, sinBloquesPropios, sinChat);

const ESCRITURAS = ["saveMessage", "touchSession", "updateSessionTitle"];
const escrituras = () => llamadas.filter((l) => l.startsWith("saveExchange") || ESCRITURAS.includes(l));

/** `ask` a través del controlador, para ver el código HTTP y el cuerpo. */
const preguntarPorHttp = async () => {
  const controlador = new ChatbotController(nuevoServicio());
  const app = new Hono<{ Variables: { studentId: number } }>();
  app.post("/chatbot/sessions/:id/ask", (c) => {
    c.set("studentId", ALUMNA);
    return controlador.ask(c as unknown as Context);
  });
  const respuesta = await app.request(`/chatbot/sessions/${SESION}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: PREGUNTA }),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as { error?: { code: string; message: string } } };
};

describe("BR-CB-21: ChatbotService.ask guarda la pregunta y la respuesta juntas", () => {
  beforeEach(() => {
    llamadas.length = 0;
    llamadasACohere = 0;
    cohereFalla = false;
    falloDeSaveExchange = null;
  });

  test("con Cohere que falla no se escribe nada y la respuesta es 503, aunque la purga sí corrió", async () => {
    cohereFalla = true;
    const error = await nuevoServicio()
      .ask(SESION, ALUMNA, { question: PREGUNTA })
      .catch((e: unknown) => e as Error & { statusCode?: number });
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("CHATBOT_UNAVAILABLE");
    expect((error as Error & { statusCode?: number }).statusCode).toBe(503);
    expect(llamadasACohere).toBe(1);
    expect(escrituras()).toEqual([]);
    expect(llamadas.filter((l) => l === "purgeSessionsBeforeActivePeriod").length).toBe(1);
  });

  test("con Cohere que falla, el HTTP es 503 CHATBOT_UNAVAILABLE", async () => {
    cohereFalla = true;
    const { status, cuerpo } = await preguntarPorHttp();
    expect(status).toBe(503);
    expect(cuerpo.error?.code).toBe("CHATBOT_UNAVAILABLE");
    expect(escrituras()).toEqual([]);
  });

  test("con Cohere que responde hay un solo saveExchange con la pregunta y la respuesta, y ningún saveMessage", async () => {
    const resultado = await nuevoServicio().ask(SESION, ALUMNA, { question: PREGUNTA });
    expect(resultado).toEqual({ answer: RESPUESTA, sessionId: SESION });
    expect(llamadas.filter((l) => l.startsWith("saveExchange"))).toEqual([
      `saveExchange(${SESION}, ${PREGUNTA}, ${RESPUESTA})`,
    ]);
    expect(llamadas).not.toContain("saveMessage");
    expect(llamadas).not.toContain("touchSession");
  });

  test("el orden de ask: purga, sesión, historial, Cohere y después el guardado", async () => {
    await nuevoServicio().ask(SESION, ALUMNA, { question: PREGUNTA });
    const pasos = llamadas.filter((l) => l !== "updateSessionTitle").map((l) => l.replace(/\(.*$/, ""));
    expect(pasos).toEqual([
      "purgeSessionsBeforeActivePeriod",
      "findSessionById",
      "getRecentMessages",
      "cohere",
      "saveExchange",
    ]);
  });

  test("la sesión borrada mientras el alumno esperaba (23503 dentro de cause) da 404 SESSION_NOT_FOUND", async () => {
    falloDeSaveExchange = errorDeLlaveForanea;
    const error = await nuevoServicio()
      .ask(SESION, ALUMNA, { question: PREGUNTA })
      .catch((e: unknown) => e as Error & { statusCode?: number });
    expect((error as Error).message).toBe("SESSION_NOT_FOUND");
    expect((error as Error & { statusCode?: number }).statusCode).toBe(404);
  });

  test("el 23503 sin envoltorio también da 404", async () => {
    falloDeSaveExchange = () => Object.assign(new Error("violates foreign key constraint"), { code: "23503" });
    const error = await nuevoServicio()
      .ask(SESION, ALUMNA, { question: PREGUNTA })
      .catch((e: unknown) => e as Error);
    expect((error as Error).message).toBe("SESSION_NOT_FOUND");
  });

  test("por HTTP, la sesión borrada a mitad de camino responde 404 SESSION_NOT_FOUND", async () => {
    falloDeSaveExchange = errorDeLlaveForanea;
    const { status, cuerpo } = await preguntarPorHttp();
    expect(status).toBe(404);
    expect(cuerpo.error?.code).toBe("SESSION_NOT_FOUND");
  });

  test("otro fallo de la transacción responde 500 genérico, sin detalles de la base", async () => {
    falloDeSaveExchange = () =>
      Object.assign(new Error("Failed query: insert into chatbot_message ..."), {
        cause: Object.assign(new Error("deadlock detected"), { code: "40P01" }),
      });
    const errores: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errores.push(args);
    };
    try {
      const { status, cuerpo } = await preguntarPorHttp();
      expect(status).toBe(500);
      expect(cuerpo.error?.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(cuerpo)).not.toContain("deadlock");
      expect(JSON.stringify(cuerpo)).not.toContain("chatbot_message");
    } finally {
      console.error = original;
    }
    expect(errores.length).toBeGreaterThan(0);
  });

  test("un fallo de la transacción no se disfraza de 404 ni de 503", async () => {
    falloDeSaveExchange = () => new Error("connection terminated inventado");
    const error = await nuevoServicio()
      .ask(SESION, ALUMNA, { question: PREGUNTA })
      .catch((e: unknown) => e as Error & { statusCode?: number });
    expect((error as Error).message).toBe("connection terminated inventado");
    expect((error as Error & { statusCode?: number }).statusCode).toBeUndefined();
  });
});
