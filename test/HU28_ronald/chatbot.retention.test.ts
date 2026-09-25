import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * BR-CB-22: retención por ciclo, sin base de datos.
 *
 * Aquí se fija que la sentencia de la purga es la de la spec y que el servicio
 * la corre al empezar `listSessions`, `getSession`, `createSession` y `ask`, antes
 * de buscar la sesión, y no en `deleteSession`. Un fallo de la purga se registra
 * con `console.error` y la petición sigue (BR-CB-12). Qué borra de verdad esa
 * sentencia (la frontera de la medianoche de Lima, el período que no empieza,
 * el alcance global) se prueba contra PostgreSQL en
 * `chatbot.retention.postgres.test.ts`. Datos inventados (repo público).
 */

afterAll(() => {
  mock.restore();
});

let llamadasACohere = 0;

mock.module("../../src/services/cohere.client.js", () => ({
  cohereClient: {
    chatWithHistory: async () => {
      llamadasACohere++;
      return "respuesta inventada del bot";
    },
    generateTitle: async () => "titulo inventado",
  },
}));

const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");
const { ChatbotRepository } = await import("../../src/modules/chatbot/chatbot.repository.js");

// ============================================================================
// La sentencia de la purga es, palabra por palabra, la de la spec.
// ============================================================================

const dialecto = new PgDialect();
const normalizar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

describe("BR-CB-22: ChatbotRepository.purgeSessionsBeforeActivePeriod", () => {
  test("ejecuta la sentencia de la spec, sin parámetros, en una sola llamada", async () => {
    const spec = await Bun.file("specs/features/chatbot/chatbot.spec.md").text();
    const bloques = [...spec.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
    const dePurga = bloques.filter((b) => b.trimStart().startsWith("DELETE FROM chatbot_session cs"));
    expect(dePurga.length).toBe(1);

    const consultas: Array<{ sql: string; params: unknown[] }> = [];
    const database = {
      execute: async (q: SQL) => {
        const { sql, params } = dialecto.sqlToQuery(q);
        consultas.push({ sql: normalizar(sql), params });
        return [];
      },
    };
    await new ChatbotRepository(database as any).purgeSessionsBeforeActivePeriod();

    expect(consultas.length).toBe(1);
    expect(consultas[0].sql).toBe(normalizar(dePurga[0]));
    expect(consultas[0].params).toEqual([]);
  });
});

// ============================================================================
// El servicio corre la purga al empezar cuatro métodos, y no en deleteSession.
// ============================================================================

const SESION = "33333333-3333-4333-8333-333333333333";
const ALUMNA = 42;

const llamadas: string[] = [];
let purgaFalla = false;
/** La sesión existe hasta que la purga la borra (sesión del ciclo anterior). */
let sesionVencida = false;
let sesionExiste = true;

const repositorioFalso = {
  purgeSessionsBeforeActivePeriod: async () => {
    llamadas.push("purge");
    if (purgaFalla) throw new Error("falla inventada de la purga");
    if (sesionVencida) sesionExiste = false;
  },
  findSessionById: async (sessionId: string) => {
    llamadas.push("findSessionById");
    return sesionExiste
      ? { id: sessionId, studentId: ALUMNA, title: "t", createdAt: new Date(), updatedAt: new Date() }
      : null;
  },
  createSession: async (studentId: number) => {
    llamadas.push("createSession");
    return { id: SESION, studentId, title: "Nueva conversacion", createdAt: new Date(), updatedAt: new Date() };
  },
  listSessions: async (studentId: number) => {
    llamadas.push("listSessions");
    return sesionExiste
      ? [{ id: SESION, studentId, title: "t", createdAt: new Date(), updatedAt: new Date() }]
      : [];
  },
  deleteSession: async () => {
    llamadas.push("deleteSession");
    return true;
  },
  getMessages: async () => {
    llamadas.push("getMessages");
    return [];
  },
  getRecentMessages: async () => {
    llamadas.push("getRecentMessages");
    return [];
  },
  saveExchange: async () => {
    llamadas.push("saveExchange");
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
const servicio = () => new ChatbotService(repositorioFalso, servicioDeHorario, sinBloquesPropios, sinChat);

const PREGUNTA = "¿Qué nota saqué en el parcial inventado?";

/** Cada método público que corre la purga, con la llamada del repositorio que la sigue. */
const METODOS: Array<{ nombre: string; correr: () => Promise<unknown>; siguiente: string }> = [
  { nombre: "createSession", correr: () => servicio().createSession(ALUMNA), siguiente: "createSession" },
  { nombre: "listSessions", correr: () => servicio().listSessions(ALUMNA), siguiente: "listSessions" },
  { nombre: "getSession", correr: () => servicio().getSession(SESION, ALUMNA), siguiente: "findSessionById" },
  { nombre: "ask", correr: () => servicio().ask(SESION, ALUMNA, { question: PREGUNTA }), siguiente: "findSessionById" },
];

// console.error se reemplaza en cada prueba para contar los registros sin ensuciar la salida.
let registrosDeError: unknown[][] = [];
const consoleErrorOriginal = console.error;

describe("BR-CB-22: la purga perezosa en ChatbotService", () => {
  beforeEach(() => {
    llamadas.length = 0;
    llamadasACohere = 0;
    purgaFalla = false;
    sesionVencida = false;
    sesionExiste = true;
    registrosDeError = [];
    console.error = (...args: unknown[]) => {
      registrosDeError.push(args);
    };
  });

  afterEach(() => {
    console.error = consoleErrorOriginal;
  });

  for (const metodo of METODOS) {
    test(`${metodo.nombre} corre la purga una vez y antes de tocar la sesión`, async () => {
      await metodo.correr();
      expect(llamadas.filter((l) => l === "purge").length).toBe(1);
      expect(llamadas[0]).toBe("purge");
      expect(llamadas[1]).toBe(metodo.siguiente);
    });

    test(`${metodo.nombre} sigue si la purga falla y lo registra con console.error`, async () => {
      purgaFalla = true;
      const resultado = await metodo.correr();
      expect(resultado).toBeTruthy();
      expect(llamadas).toContain(metodo.siguiente);
      expect(registrosDeError.length).toBe(1);
      expect(registrosDeError[0].map(String).join(" ")).toContain("falla inventada de la purga");
    });
  }

  test("deleteSession no corre la purga", async () => {
    await servicio().deleteSession(SESION, ALUMNA);
    expect(llamadas).toEqual(["deleteSession"]);
  });

  test("ask sobre una sesión del ciclo anterior: la purga la borra primero y la respuesta es 404, sin llamar a Cohere", async () => {
    sesionVencida = true;
    const error = await servicio()
      .ask(SESION, ALUMNA, { question: PREGUNTA })
      .catch((e: unknown) => e as Error & { statusCode?: number });
    expect((error as Error).message).toBe("SESSION_NOT_FOUND");
    expect((error as Error & { statusCode?: number }).statusCode).toBe(404);
    expect(llamadasACohere).toBe(0);
    expect(llamadas).not.toContain("saveExchange");
  });

  test("getSession sobre una sesión del ciclo anterior devuelve null (404 en la ruta)", async () => {
    sesionVencida = true;
    expect(await servicio().getSession(SESION, ALUMNA)).toBeNull();
    expect(llamadas).not.toContain("getMessages");
  });

  test("listSessions ya no lista la sesión del ciclo anterior", async () => {
    sesionVencida = true;
    expect(await servicio().listSessions(ALUMNA)).toEqual([]);
  });

  test("una purga fallida no se disfraza: ask sigue hasta Cohere y guarda el par", async () => {
    purgaFalla = true;
    const resultado = await servicio().ask(SESION, ALUMNA, { question: PREGUNTA });
    expect(resultado.answer).toBe("respuesta inventada del bot");
    expect(llamadasACohere).toBe(1);
    expect(llamadas).toContain("saveExchange");
  });
});
