import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { ChatbotMessageRow } from "../../src/modules/chatbot/chatbot.types.js";

/**
 * BR-CB-20 y BR-CB-07: el historial viaja una sola vez, como turnos.
 *
 * El servicio lee los 10 últimos mensajes ANTES de guardar nada de la pregunta
 * actual, así que la pregunta no vuelve dentro del historial. Esos mensajes van
 * como turnos `user` y `assistant` de `chatWithHistory`, seguidos del mensaje de
 * datos, y no se repiten dentro de ese mensaje. Antes del ajuste la pregunta
 * llegaba tres veces a Cohere y una respuesta equivocada anterior volvía con la
 * autoridad de un dato.
 *
 * Datos inventados (repo público).
 */

afterAll(() => {
  mock.restore();
});

type Turno = { role: string; content: string };

/** Todo lo que el servicio le manda a Cohere en cada pregunta. */
const enviosACohere: Array<{ preamble: string; messages: Turno[] }> = [];

mock.module("../../src/services/cohere.client.js", () => ({
  cohereClient: {
    chatWithHistory: async (messages: Turno[], options: { preamble?: string }) => {
      enviosACohere.push({ preamble: options?.preamble ?? "", messages: messages.map((m) => ({ ...m })) });
      return "respuesta inventada del bot";
    },
    generateTitle: async () => "titulo inventado",
  },
}));

const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");
const { ChatbotRepository } = await import("../../src/modules/chatbot/chatbot.repository.js");

const SESION = "11111111-1111-4111-8111-111111111111";
const ALUMNA = 42;

/** `n` mensajes alternados, del más viejo al más nuevo, un minuto aparte. */
const conversacion = (n: number): ChatbotMessageRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`,
    sessionId: SESION,
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `TURNO-PREVIO-${i + 1}: texto inventado del mensaje ${i + 1}`,
    createdAt: new Date(Date.UTC(2026, 8, 25, 12, i)),
  }));

/**
 * Repositorio en memoria. Guarda los mensajes como la tabla y `getRecentMessages`
 * se comporta como su consulta (`ORDER BY created_at DESC LIMIT n` y vuelta al
 * orden cronológico). Conserva también la API de antes del ajuste
 * (`saveMessage`, `touchSession` y `getMessages`) y anota cada llamada, así que
 * una vuelta atrás se ve en `llamadas` en vez de romper con un TypeError.
 */
const crearRepositorio = (historial: ChatbotMessageRow[]) => {
  const mensajes = historial.map((m) => ({ ...m }));
  const llamadas: string[] = [];
  const cronologico = () => [...mensajes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let reloj = Date.UTC(2026, 8, 25, 18, 0);
  const guardar = (role: "user" | "assistant", content: string) => {
    reloj += 1000;
    mensajes.push({ id: `n${mensajes.length}`, sessionId: SESION, role, content, createdAt: new Date(reloj) });
  };

  const repositorio = {
    purgeSessionsBeforeActivePeriod: async () => {
      llamadas.push("purgeSessionsBeforeActivePeriod");
    },
    findSessionById: async (sessionId: string) => {
      llamadas.push("findSessionById");
      return { id: sessionId, studentId: ALUMNA, title: "t", createdAt: new Date(), updatedAt: new Date() };
    },
    getRecentMessages: async (sessionId: string, limit: number) => {
      llamadas.push(`getRecentMessages(${sessionId}, ${limit})`);
      return cronologico().slice(-limit).map((m) => ({ ...m }));
    },
    saveExchange: async (_sessionId: string, question: string, answer: string) => {
      llamadas.push("saveExchange");
      guardar("user", question);
      guardar("assistant", answer);
    },
    // API de antes del ajuste: el servicio ya no la usa en `ask`.
    getMessages: async () => {
      llamadas.push("getMessages");
      return cronologico().map((m) => ({ ...m }));
    },
    saveMessage: async (_sessionId: string, role: "user" | "assistant", content: string) => {
      llamadas.push("saveMessage");
      guardar(role, content);
      return mensajes[mensajes.length - 1];
    },
    touchSession: async () => {
      llamadas.push("touchSession");
    },
    updateSessionTitle: async () => {
      llamadas.push("updateSessionTitle");
    },
    getStudentInfo: async () => ({
      fullName: "LUCIA INVENTADA PAREDES",
      careerName: "Ingenieria de Sistemas",
      currentLevel: 8,
    }),
    getActiveAcademicPeriod: async () => ({ id: 1, code: "2026-2" }),
    getAcademicWeeksForActivePeriod: async () => [],
    getSchedule: async () => [],
    getCurriculum: async () => [],
    getAlerts: async () => [],
    getAnnouncements: async () => [],
    getSectionRepresentatives: async () => [],
    getOfficialGrades: async () => [],
    getActiveSectionDetails: async () => [],
  };

  return { repositorio, llamadas, mensajes };
};

const servicioDeHorario = { getAssessments: async () => ({ assessments: [] }) } as any;
const sinBloquesPropios = async () => ({
  window: { from: "2026-09-21", to: "2026-10-04" },
  blocks: [],
  weeks: [
    { weekStart: "2026-09-21", hours: 0 },
    { weekStart: "2026-09-28", hours: 0 },
  ],
});
const sinChat = async () => [];

const PREGUNTA = "¿Cuánto saqué en el examen parcial inventado número 7?";

const preguntar = async (historial: ChatbotMessageRow[], question = PREGUNTA) => {
  const { repositorio, llamadas, mensajes } = crearRepositorio(historial);
  const servicio = new ChatbotService(repositorio as any, servicioDeHorario, sinBloquesPropios, sinChat);
  const resultado = await servicio.ask(SESION, ALUMNA, { question });
  return { resultado, llamadas, mensajes, envio: enviosACohere[enviosACohere.length - 1] };
};

const veces = (texto: string, aguja: string): number => texto.split(aguja).length - 1;

describe("BR-CB-20: el historial viaja una sola vez, como turnos", () => {
  beforeEach(() => {
    enviosACohere.length = 0;
  });

  test("la pregunta aparece una sola vez en todo lo que recibe Cohere, y es en el último turno", async () => {
    const { envio } = await preguntar(conversacion(4));
    expect(enviosACohere.length).toBe(1);
    const todo = [envio.preamble, ...envio.messages.map((m) => m.content)].join("\n");
    expect(veces(todo, PREGUNTA)).toBe(1);
    expect(envio.messages[envio.messages.length - 1].content).toContain(PREGUNTA);
  });

  test("ningún turno previo aparece dentro del mensaje de datos, que ya no trae el bloque de historial", async () => {
    const historial = conversacion(6);
    const { envio } = await preguntar(historial);
    const mensajeDeDatos = envio.messages[envio.messages.length - 1];
    expect(mensajeDeDatos.role).toBe("user");
    for (const previo of historial) {
      expect(mensajeDeDatos.content).not.toContain(previo.content);
    }
    expect(mensajeDeDatos.content).not.toContain("TURNO-PREVIO");
    expect(mensajeDeDatos.content).not.toContain("HISTORIAL DE LA CONVERSACION");
  });

  test("los turnos previos van antes del mensaje de datos, con su rol y su texto tal cual", async () => {
    const historial = conversacion(4);
    const { envio } = await preguntar(historial);
    expect(envio.messages.length).toBe(5);
    expect(envio.messages.slice(0, 4)).toEqual(historial.map((m) => ({ role: m.role, content: m.content })));
  });

  test("con 30 mensajes guardados solo viajan los 10 últimos, en orden cronológico", async () => {
    const historial = conversacion(30);
    const { envio } = await preguntar(historial);
    expect(envio.messages.length).toBe(11);
    expect(envio.messages.slice(0, 10).map((m) => m.content)).toEqual(historial.slice(20).map((m) => m.content));
    expect(envio.messages[0].content.startsWith("TURNO-PREVIO-21:")).toBe(true);
    expect(envio.messages[9].content.startsWith("TURNO-PREVIO-30:")).toBe(true);
  });

  test("una sesión sin mensajes manda solo el mensaje de datos", async () => {
    const { envio } = await preguntar([]);
    expect(envio.messages.length).toBe(1);
    expect(envio.messages[0].role).toBe("user");
  });

  test("lee el historial una sola vez, con getRecentMessages(sessionId, 10), antes de guardar nada", async () => {
    const { llamadas } = await preguntar(conversacion(12));
    const lecturas = llamadas.filter((l) => l.startsWith("getRecentMessages"));
    expect(lecturas).toEqual([`getRecentMessages(${SESION}, 10)`]);
    expect(llamadas.indexOf(lecturas[0])).toBeLessThan(llamadas.indexOf("saveExchange"));
    // `ask` ya no relee la sesión entera ni guarda la pregunta por separado.
    expect(llamadas).not.toContain("getMessages");
    expect(llamadas).not.toContain("saveMessage");
    expect(llamadas).not.toContain("touchSession");
  });

  test("la pregunta y la respuesta quedan guardadas después, y la siguiente pregunta las recibe como turnos", async () => {
    const { repositorio, mensajes } = crearRepositorio(conversacion(2));
    const servicio = new ChatbotService(repositorio as any, servicioDeHorario, sinBloquesPropios, sinChat);
    await servicio.ask(SESION, ALUMNA, { question: PREGUNTA });
    expect(mensajes.slice(-2).map((m) => [m.role, m.content])).toEqual([
      ["user", PREGUNTA],
      ["assistant", "respuesta inventada del bot"],
    ]);

    await servicio.ask(SESION, ALUMNA, { question: "¿Y en el otro examen inventado?" });
    const segunda = enviosACohere[enviosACohere.length - 1];
    expect(segunda.messages.slice(-3, -1)).toEqual([
      { role: "user", content: PREGUNTA },
      { role: "assistant", content: "respuesta inventada del bot" },
    ]);
  });
});

describe("BR-CB-20: GET /chatbot/sessions/:id sigue trayendo la sesión entera", () => {
  test("getSession devuelve los 30 mensajes, sin el límite de 10 de los turnos", async () => {
    const { repositorio } = crearRepositorio(conversacion(30));
    const servicio = new ChatbotService(repositorio as any, servicioDeHorario, sinBloquesPropios, sinChat);
    const resultado = await servicio.getSession(SESION, ALUMNA);
    expect(resultado?.messages.length).toBe(30);
  });
});

// ============================================================================
// La consulta de `getRecentMessages`, con una base falsa que captura el SQL. La
// prueba contra PostgreSQL real está en `chatbot.retention.postgres.test.ts`.
// ============================================================================

const dialecto = new PgDialect();
const normalizar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

const baseQueDevuelve = (filas: Record<string, unknown>[]) => {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const database = {
    execute: async (q: SQL) => {
      const { sql, params } = dialecto.sqlToQuery(q);
      consultas.push({ sql: normalizar(sql), params });
      return filas;
    },
  };
  return { database, consultas };
};

describe("BR-CB-20: ChatbotRepository.getRecentMessages", () => {
  // La base devuelve las filas como las ordena la consulta: la más nueva primero.
  const FILAS_DESC = [3, 2, 1].map((i) => ({
    id: `m${i}`,
    session_id: SESION,
    role: i % 2 === 1 ? "user" : "assistant",
    content: `mensaje ${i}`,
    created_at: `2026-09-25 12:0${i}:00`,
  }));

  test("pide los últimos n de la sesión con ORDER BY created_at DESC y LIMIT", async () => {
    const { database, consultas } = baseQueDevuelve(FILAS_DESC);
    await new ChatbotRepository(database as any).getRecentMessages(SESION, 10);
    expect(consultas.length).toBe(1);
    expect(consultas[0].sql).toContain("FROM chatbot_message");
    expect(consultas[0].sql).toMatch(/WHERE session_id = \$1 ORDER BY created_at DESC LIMIT \$2$/);
    expect(consultas[0].params).toEqual([SESION, 10]);
  });

  test("devuelve las filas en orden cronológico, con la forma de ChatbotMessageRow", async () => {
    const { database } = baseQueDevuelve(FILAS_DESC);
    const filas = await new ChatbotRepository(database as any).getRecentMessages(SESION, 10);
    expect(filas.map((f) => f.content)).toEqual(["mensaje 1", "mensaje 2", "mensaje 3"]);
    expect(filas[0]).toEqual({
      id: "m1",
      sessionId: SESION,
      role: "user",
      content: "mensaje 1",
      createdAt: new Date("2026-09-25 12:01:00"),
    });
  });

  test("getMessages, la de GET /chatbot/sessions/:id, sigue sin límite", async () => {
    const { database, consultas } = baseQueDevuelve([]);
    await new ChatbotRepository(database as any).getMessages(SESION);
    expect(consultas[0].sql).toContain("ORDER BY created_at ASC");
    expect(consultas[0].sql).not.toContain("LIMIT");
  });
});
