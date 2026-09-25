import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * BR-CB-17: sin el bloque plano de compañeros.
 *
 * De otras personas, el chatbot solo manda a Cohere al delegado y al
 * subdelegado de cada sección del alumno, con su cargo, su curso y su sección
 * (BR-CB-16). Esta prueba fija dos cosas.
 *
 *   1. Un guardia estático: ningún `.ts` de `src/modules/chatbot/` vuelve a
 *      nombrar `getClassmates`, `ClassmateData` ni `DATOS DE COMPANEROS`, y en
 *      el repositorio solo proyectan `full_name` la consulta de delegados y las
 *      dos del propio alumno. Recorre el módulo con `Bun.Glob`, así que un
 *      archivo nuevo entra solo.
 *   2. Un recorrido completo con un repositorio falso. Un compañero que no es
 *      representante está matriculado en la sección de la alumna, escribió un
 *      mensaje en el chat de la sección y figura en la «lista plana» que
 *      devolvería la consulta vieja. Con un historial de varios turnos y con
 *      anuncios y chat que no lo nombran en el texto, ninguna parte de lo que
 *      recibe Cohere (preamble, turnos previos, mensaje de datos ni la pregunta
 *      del título) trae su nombre, en ninguna pregunta.
 *
 * Todos los nombres, cursos y secciones son inventados.
 */

// --- 1. Guardia estático -----------------------------------------------------

const DIRECTORIO = "src/modules/chatbot";

const ARCHIVOS: string[] = [];
for await (const ruta of new Bun.Glob("**/*.ts").scan(DIRECTORIO)) {
  ARCHIVOS.push(`${DIRECTORIO}/${ruta}`);
}
ARCHIVOS.sort();

const PROHIBIDOS = ["getClassmates", "ClassmateData", "DATOS DE COMPANEROS"];

describe("BR-CB-17: el módulo del chatbot ya no tiene la lista plana de compañeros", () => {
  test(`${DIRECTORIO} tiene archivos .ts para revisar`, () => {
    expect(ARCHIVOS.length).toBeGreaterThan(0);
  });

  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra la lista plana de compañeros`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });
  }

  test("en el repositorio solo proyectan full_name los delegados y las consultas del propio alumno", async () => {
    const texto = await Bun.file(`${DIRECTORIO}/chatbot.repository.ts`).text();
    // Parte el archivo en métodos (`async nombre(`) y anota los que nombran full_name.
    const partes = texto.split(/\n\s+async\s+(\w+)\s*\(/);
    const conFullName: string[] = [];
    for (let i = 1; i < partes.length; i += 2) {
      if (partes[i + 1].includes("full_name")) conFullName.push(partes[i]);
    }
    expect(conFullName.sort()).toEqual(["getSectionRepresentatives", "getStudentInfo", "getStudentName"]);
  });
});

// --- 2. Recorrido con un repositorio falso -----------------------------------

const COMPANERO = "MATEO INVENTADO QUISPE";
const ALUMNA = "LUCIA INVENTADA PAREDES";
const DELEGADA = "ANA FICTICIA ROJAS";
const SUBDELEGADO = "BRUNO INVENTADO SOTO";

// Todo lo que el servicio le manda a Cohere, pregunta por pregunta.
const enviosACohere: string[] = [];
let llamadasListaPlana = 0;

mock.module("../../src/services/cohere.client.js", () => ({
  cohereClient: {
    chatWithHistory: async (
      messages: Array<{ role: string; content: string }>,
      options: { preamble?: string },
    ) => {
      enviosACohere.push(JSON.stringify({ preamble: options?.preamble ?? "", messages }));
      return "respuesta del bot";
    },
    generateTitle: async (question: string) => {
      enviosACohere.push(JSON.stringify({ titulo: question }));
      return "titulo";
    },
  },
}));

afterAll(() => {
  mock.restore();
});

const SECCION = { sectionId: 7, courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801" };

// Historial escrito después del ajuste: varios turnos que no lo nombran.
const HISTORIAL = [
  { role: "user", content: "Hola" },
  { role: "assistant", content: "Hola, soy ULimaBot. En que te ayudo?" },
  { role: "user", content: "¿Qué cursos llevo?" },
  { role: "assistant", content: "Llevas SEGURIDAD DE SISTEMAS (seccion 801)." },
].map((m, i) => ({ id: `h${i}`, sessionId: "s1", createdAt: new Date(2026, 8, 25, 10, i), ...m }));

const repositorioFalso = {
  findSessionById: async (sessionId: string) => ({
    id: sessionId,
    studentId: 42,
    title: "t",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  purgeSessionsBeforeActivePeriod: async () => {},
  saveExchange: async () => {},
  updateSessionTitle: async () => {},
  // BR-CB-20: los turnos previos se leen con getRecentMessages, antes de guardar.
  getRecentMessages: async () => HISTORIAL,
  getStudentInfo: async () => ({ fullName: ALUMNA, careerName: "Ingenieria de Sistemas", currentLevel: 8 }),
  getActiveAcademicPeriod: async () => ({ id: 1, code: "2026-2" }),
  getAcademicWeeksForActivePeriod: async () => [
    { weekNumber: 6, startDate: "2026-09-21", endDate: "2026-09-27" },
  ],
  getSchedule: async () => [
    // Con las claves de `getSchedule` (`ScheduleData`): snake_case y segundos.
    { day_name: "Lunes", start_time: "08:00:00", end_time: "10:00:00", course_name: "SEGURIDAD DE SISTEMAS", section_code: "801", classroom: "A-101" },
  ],
  getCurriculum: async () => [{ courseName: "SEGURIDAD DE SISTEMAS", cycle: 8, status: "in_progress", credit: 4 }],
  getAlerts: async () => [],
  getAnnouncements: async () => [
    {
      title: "Cambio de aula",
      message: "La clase del lunes es en el A-102.",
      courseName: "SEGURIDAD DE SISTEMAS",
      sectionCode: "801",
      publishedAt: new Date("2026-09-24T15:00:00Z"),
    },
  ],
  getOfficialGrades: async () => [],
  getActiveSectionDetails: async () => [SECCION],
  getSectionRepresentatives: async () => [
    {
      courseName: "SEGURIDAD DE SISTEMAS",
      sectionCode: "801",
      delegate: { fullName: DELEGADA, isSelf: false },
      subdelegate: { fullName: SUBDELEGADO, isSelf: false },
    },
  ],
  // La consulta vieja: el compañero sale en la lista plana. Si el servicio la
  // volviera a llamar, su nombre llegaría a Cohere y la cuenta lo delataría.
  getClassmates: async () => {
    llamadasListaPlana++;
    return [{ fullName: COMPANERO, role: "Alumno" }];
  },
} as any;

const servicioDeHorario = { getAssessments: async () => ({ assessments: [] }) } as any;

// El chat real de `chat-search.ts`, con la lectura de Firebase reemplazada: el
// compañero es el remitente de un mensaje cuyo texto no lo nombra.
const { searchChatMessages } = await import("../../src/modules/chatbot/chat-search.js");
const buscarEnElChat = (question: string, sections: Array<{ sectionId: number; courseName: string; sectionCode: string }>) =>
  searchChatMessages(question, sections, async () => [
    { id: "c1", senderName: COMPANERO, body: "El parcial es el lunes 28?", createdAt: Date.UTC(2026, 8, 25, 2, 15) },
  ]);

// Los bloques propios de la alumna (RS-BE-35): solo trae lo suyo, nunca el
// nombre de un compañero.
const leerBloquesPropios = async (_studentId: number, _today: string) => ({
  window: { from: "2026-09-21", to: "2026-10-04" },
  blocks: [
    {
      title: "Prácticas en empresa",
      daysOfWeek: [1, 3],
      startTime: "14:00",
      endTime: "18:00",
      startDate: "2026-09-01",
      endDate: "2026-12-15",
      exceptions: [],
    },
  ],
  weeks: [
    { weekStart: "2026-09-21", hours: 8 },
    { weekStart: "2026-09-28", hours: 8 },
  ],
});

const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");

const PREGUNTAS = [
  "¿Quiénes están en mi sección?",
  "¿Quiénes son mis compañeros?",
  "¿Quiénes son los delegados de Seguridad de Sistemas?",
  "¿y el subdelegado?",
  "¿Quién es el alumno que escribió en el chat?",
  "¿Dijeron algo del examen en el chat?",
  "¿Hay algún comunicado de mis cursos?",
  "¿Qué nota saqué en el parcial?",
  "¿Cuántos créditos llevo?",
  // own_blocks (BR-CB-18 y BR-CB-19): los bloques propios tampoco lo traen.
  "¿Cómo organizo mi semana con mis prácticas?",
  "hola, ¿cómo estás?",
];

describe("BR-CB-17: el nombre de un compañero que no es representante no llega a Cohere", () => {
  beforeEach(() => {
    enviosACohere.length = 0;
    llamadasListaPlana = 0;
  });

  const preguntar = async (question: string) => {
    const servicio = new ChatbotService(repositorioFalso, servicioDeHorario, leerBloquesPropios, buscarEnElChat);
    await servicio.ask("s1", 42, { question });
  };

  for (const pregunta of PREGUNTAS) {
    test(`«${pregunta}»: ni el preamble, ni los turnos, ni el mensaje de datos traen su nombre`, async () => {
      await preguntar(pregunta);
      expect(enviosACohere.length).toBeGreaterThan(0);
      for (const envio of enviosACohere) {
        expect(envio).not.toContain(COMPANERO);
        expect(envio).not.toContain("MATEO");
        expect(envio).not.toContain("DATOS DE COMPANEROS");
      }
      expect(llamadasListaPlana).toBe(0);
    });
  }

  // Controles positivos: la prueba no pasa porque no viaje nada.
  test("la pregunta de delegados sí manda a la delegada y al subdelegado, con su curso y su sección", async () => {
    await preguntar("¿Quiénes son los delegados de Seguridad de Sistemas?");
    const envio = enviosACohere[0];
    expect(envio).toContain(
      `- SEGURIDAD DE SISTEMAS (seccion 801): delegado ${DELEGADA}; subdelegado ${SUBDELEGADO}.`,
    );
  });

  test("la pregunta del chat sí manda el texto del mensaje, sin remitente", async () => {
    await preguntar("¿Dijeron algo del examen en el chat?");
    const envio = enviosACohere[0];
    expect(envio).toContain("El parcial es el lunes 28?");
    expect(envio).toContain("2026-09-24 21:15");
    expect(envio).not.toContain("senderName");
  });

  test("los turnos previos viajan (y tampoco lo nombran)", async () => {
    await preguntar("¿Qué nota saqué en el parcial?");
    const envio = JSON.parse(enviosACohere[0]) as { messages: Array<{ role: string; content: string }> };
    expect(envio.messages.some((m) => m.content === "Hola, soy ULimaBot. En que te ayudo?")).toBe(true);
  });
});
