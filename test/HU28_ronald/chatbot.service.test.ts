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
    chatWithHistory: async () => "respuesta del bot",
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
  getClassmates: async () => {
    fuentesConsultadas.push("delegates");
    return [];
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

  test("«¿Quiénes son los delegados…?» con tilde consulta la fuente de delegados", async () => {
    // Hasta BR-CB-16, `delegates` usa la fuente que hereda de `classmates`.
    await preguntar("¿Quiénes son los delegados de Seguridad de Sistemas?");
    expect(fuentesConsultadas).toContain("delegates");
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
