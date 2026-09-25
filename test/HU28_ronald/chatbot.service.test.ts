import { describe, expect, test, mock, beforeEach, afterAll } from "bun:test";

afterAll(() => {
  mock.restore();
});

const saveMessageCalls: Array<{ sessionId: string; role: string; content: string }> = [];
const searchChatCalls: Array<{ question: string }> = [];
// Fuentes de datos que el servicio consultó en cada pregunta (BR-CB-05).
const fuentesConsultadas: string[] = [];
// Trampa de BR-CB-04: si el servicio volviera a clasificar con Cohere, quedaría
// registrado aquí. El cliente real ya no tiene `classify`.
let llamadasClassify = 0;
// Todo lo que el servicio le manda a Cohere en cada pregunta: el preamble y los
// turnos, incluido el mensaje de datos (BR-CB-17).
const enviosACohere: string[] = [];
// Compañera inventada que no es delegada ni subdelegada. Su nombre no debe llegar
// a Cohere en ninguna pregunta (BR-CB-17).
const COMPANERA_NO_REPRESENTANTE = "Valeria Quispe Inventada";

mock.module("../../src/services/cohere.client.js", () => ({
  cohereClient: {
    classify: async () => {
      llamadasClassify++;
      return [
        {
          input: "x",
          prediction: "grades",
          confidence: 0.9,
          labels: { grades: { confidence: 0.9 } },
        },
      ];
    },
    chatWithHistory: async (
      messages: Array<{ role: string; content: string }>,
      options: { preamble?: string },
    ) => {
      enviosACohere.push(JSON.stringify({ preamble: options?.preamble ?? "", messages }));
      return "respuesta del bot";
    },
    generateTitle: async () => "titulo",
  },
}));

const fakeRepo = {
  findSessionById: async (sessionId: string) => ({
    id: sessionId,
    studentId: 2,
    title: "t",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  saveMessage: async (sessionId: string, role: "user" | "assistant", content: string) => {
    saveMessageCalls.push({ sessionId, role, content });
    return {
      id: "m1",
      sessionId,
      role,
      content,
      createdAt: new Date(),
    };
  },
  touchSession: async () => {},
  getMessages: async () => [],
  getStudentInfo: async () => ({
    fullName: "HURTADO LAGO RONALD ALFREDO",
    careerName: "Ing de Sistemas",
    currentLevel: 8,
  }),
  getActiveAcademicPeriod: async () => ({ id: 1, code: "2026-1" }),
  getAcademicWeeksForActivePeriod: async () => [
    { weekNumber: 14, startDate: "2026-07-06", endDate: "2026-07-12" },
    { weekNumber: 15, startDate: "2026-07-13", endDate: "2026-07-19" },
  ],
  getSchedule: async () => {
    fuentesConsultadas.push("schedule");
    return [];
  },
  getCurriculum: async () => {
    fuentesConsultadas.push("curriculum");
    return [];
  },
  getAlerts: async () => {
    fuentesConsultadas.push("alerts");
    return [];
  },
  getAnnouncements: async () => {
    fuentesConsultadas.push("announcements");
    return [];
  },
  // Lista plana de compañeros que BR-CB-17 retira. Si el servicio la consultara,
  // quedaría registrada aquí y su nombre viajaría a Cohere.
  getClassmates: async () => {
    fuentesConsultadas.push("classmates");
    return [{ fullName: COMPANERA_NO_REPRESENTANTE, role: "Alumno" }];
  },
  getOfficialGrades: async () => {
    fuentesConsultadas.push("grades");
    return [];
  },
  getActiveSectionDetails: async () => [
    { sectionId: 1, courseName: "INGENIERÍA DE SOFTWARE II", sectionCode: "856" },
  ],
} as any;

const fakeScheduleService = {
  getAssessments: async () => ({ assessments: [] }),
} as any;

const stubSearchChat = async (question: string, _sections: unknown) => {
  searchChatCalls.push({ question });
  return [
    {
      sectionName: "INGENIERÍA DE SOFTWARE II (856)",
      messages: [
        { senderName: "Profesor", body: "Si se puede usar apuntes", createdAt: 1 },
      ],
    },
  ];
};

const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");

describe("ChatbotService.ask - el chat se consulta SIEMPRE", () => {
  beforeEach(() => {
    saveMessageCalls.length = 0;
    searchChatCalls.length = 0;
  });

  test("pregunta que NO tiene keyword de chat (solo 'examen') -> igual consulta el chat", async () => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, stubSearchChat);
    await service.ask("s1", 2, {
      question: "se pueden usar apuntes? escritos a mano en el examen de SoftWare II?",
    });

    expect(searchChatCalls.length).toBe(1);
    expect(searchChatCalls[0].question).toContain("apuntes");
  });

  test("pregunta con keyword de chat explicito -> consulta el chat", async () => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, stubSearchChat);
    await service.ask("s1", 2, {
      question: "dijeron algo del examen en el grupo?",
    });

    expect(searchChatCalls.length).toBe(1);
  });

  test("pregunta sobre horario -> el chat tambien se consulta", async () => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, stubSearchChat);
    await service.ask("s1", 2, {
      question: "que clases tengo el lunes?",
    });

    expect(searchChatCalls.length).toBe(1);
  });
});

describe("ChatbotService.ask - clasificación solo por palabras clave (BR-CB-04 y BR-CB-05)", () => {
  beforeEach(() => {
    fuentesConsultadas.length = 0;
    llamadasClassify = 0;
    enviosACohere.length = 0;
  });

  const preguntar = async (question: string) => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, stubSearchChat);
    await service.ask("s1", 2, { question });
  };

  test("no clasifica con Cohere: ninguna pregunta llega a classify", async () => {
    await preguntar("¿Qué nota saqué en el parcial?");
    await preguntar("¿Quiénes son los delegados de Seguridad de Sistemas?");
    expect(llamadasClassify).toBe(0);
  });

  // `delegates` reemplaza a `classmates`, que ya no carga datos (BR-CB-04 y BR-CB-17).
  // Hasta que BR-CB-16 conecte los delegados por sección, `delegates` no carga nada.
  const preguntasDeDelegados = [
    "¿Quiénes son los delegados de Seguridad de Sistemas?",
    "¿Quién es el delegado de Cálculo I?",
    "¿En qué sección estoy?",
    "¿y el subdelegado?",
    "¿Quiénes son mis compañeros?",
  ];

  for (const pregunta of preguntasDeDelegados) {
    test(`«${pregunta}» no consulta la lista plana de compañeros (BR-CB-17)`, async () => {
      await preguntar(pregunta);
      expect(fuentesConsultadas).not.toContain("classmates");
    });

    test(`«${pregunta}» no manda a Cohere el bloque de compañeros ni el nombre de una compañera (BR-CB-17)`, async () => {
      await preguntar(pregunta);
      expect(enviosACohere.length).toBe(1);
      expect(enviosACohere[0]).not.toContain("DATOS DE COMPANEROS");
      expect(enviosACohere[0]).not.toContain(COMPANERA_NO_REPRESENTANTE);
    });
  }

  test("el servicio y el armado del contexto ya no nombran la lista plana de compañeros", async () => {
    const servicio = await Bun.file("src/modules/chatbot/chatbot.service.ts").text();
    const contexto = await Bun.file("src/modules/chatbot/context-builder.ts").text();
    expect(servicio).not.toContain("getClassmates");
    expect(servicio).not.toContain("classmatesData");
    expect(contexto).not.toContain("DATOS DE COMPANEROS");
    expect(contexto).not.toContain("classmatesData");
  });

  test("«¿A qué hora tengo prácticas?» carga el horario, que own_blocks arrastra", async () => {
    await preguntar("¿A qué hora tengo prácticas?");
    expect(fuentesConsultadas).toContain("schedule");
  });

  test("«¿Qué bloque libre me queda?» carga el horario solo por el arrastre de own_blocks", async () => {
    await preguntar("¿Qué bloque libre me queda?");
    expect(fuentesConsultadas).toEqual(["schedule"]);
  });

  test("«¿Qué nota saqué en el parcial?» consulta solo las notas", async () => {
    await preguntar("¿Qué nota saqué en el parcial?");
    expect(fuentesConsultadas).toEqual(["grades"]);
  });

  test("sin palabras clave consulta horario, notas y malla", async () => {
    await preguntar("hola, ¿cómo estás?");
    expect([...fuentesConsultadas].sort()).toEqual(["curriculum", "grades", "schedule"]);
  });
});
