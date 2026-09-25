import { describe, expect, test, mock, beforeEach, afterEach, afterAll } from "bun:test";
import { Hono, type Context } from "hono";

afterAll(() => {
  mock.restore();
});

// Escrituras y lecturas del historial que hizo el servicio, en orden (BR-CB-03,
// BR-CB-20 y BR-CB-21).
const llamadasRepo: string[] = [];
// Lo que devuelve `getRecentMessages` en la próxima pregunta.
let historialFalso: Array<{ id: string; sessionId: string; role: "user" | "assistant"; content: string; createdAt: Date }> = [];
// Títulos que se pidieron a Cohere y si esa llamada o su guardado fallan (BR-CB-03).
const titulosPedidos: string[] = [];
let tituloFalla = false;
let guardarTituloFalla = false;
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
// Fallos de BR-CB-12. Cohere puede fallar con un error o no responder hasta que
// el servicio aborta la llamada; el guardado y la purga pueden lanzar.
let falloDeCohere: Error | "timeout" | null = null;
let falloDeGuardado: Error | null = null;
let purgaFalla = false;
// Lo que devuelve `getSchedule`. Vacío por omisión, así que el bloque 3 no sale
// (BR-CB-24: un bloque sale solo si tiene datos).
let horarioFalso: unknown[] = [];

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
      options: { preamble?: string; signal?: AbortSignal },
    ) => {
      enviosACohere.push(JSON.stringify({ preamble: options?.preamble ?? "", messages }));
      if (falloDeCohere === "timeout") {
        // Como `fetch` con `signal`: no responde y se rechaza cuando el servicio aborta.
        return new Promise<string>((_, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
        });
      }
      if (falloDeCohere) throw falloDeCohere;
      return "respuesta del bot";
    },
    generateTitle: async (question: string) => {
      titulosPedidos.push(question);
      llamadasRepo.push("generateTitle");
      if (tituloFalla) throw new Error("Cohere generate error inventado");
      return "titulo";
    },
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
  purgeSessionsBeforeActivePeriod: async () => {
    if (purgaFalla) throw new Error("falla inventada de la purga");
  },
  getRecentMessages: async (_sessionId: string, _limit: number) => {
    llamadasRepo.push("getRecentMessages");
    return historialFalso;
  },
  saveExchange: async (sessionId: string, question: string, answer: string) => {
    llamadasRepo.push(`saveExchange(${sessionId}, ${question}, ${answer})`);
    if (falloDeGuardado) throw falloDeGuardado;
  },
  updateSessionTitle: async (sessionId: string, title: string) => {
    llamadasRepo.push(`updateSessionTitle(${sessionId}, ${title})`);
    if (guardarTituloFalla) throw new Error("falla inventada al guardar el título");
  },
  getStudentInfo: async () => ({
    fullName: "LUCIA INVENTADA PAREDES",
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
    return horarioFalso;
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
  // Delegados por sección (BR-CB-16), ya resueltos como los devuelve el
  // repositorio. Es el caso del bug reportado: la alumna lleva dos cursos con
  // delegados distintos. PLANEAMIENTO ESTRATEGICO tiene delegado y subdelegado
  // reales; SEGURIDAD DE SISTEMAS no tiene representante activo y su delegada
  // sale del claim del portal. Nombres inventados.
  getSectionRepresentatives: async () => {
    fuentesConsultadas.push("delegates");
    return [
      {
        courseName: "PLANEAMIENTO ESTRATEGICO",
        sectionCode: "802",
        delegate: { fullName: "BRUNO INVENTADO SOTO", isSelf: false },
        subdelegate: { fullName: "CARLA INVENTADA DIAZ", isSelf: false },
      },
      {
        courseName: "SEGURIDAD DE SISTEMAS",
        sectionCode: "801",
        delegate: { fullName: "ANA FICTICIA ROJAS", isSelf: false },
        subdelegate: null,
      },
    ];
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

// La función de RS-BE-35 que el servicio recibe por constructor (BR-CB-18).
// Anota su uso en las fuentes consultadas y devuelve un resumen sin bloques.
const fakeReadOwnBlocks = async (_studentId: number, _today: string) => {
  fuentesConsultadas.push("own_blocks");
  return {
    window: { from: "2026-07-06", to: "2026-07-19" },
    blocks: [],
    weeks: [
      { weekStart: "2026-07-06", hours: 0 },
      { weekStart: "2026-07-13", hours: 0 },
    ],
  };
};

const stubSearchChat = async (question: string, _sections: unknown) => {
  searchChatCalls.push({ question });
  return [
    {
      sectionName: "INGENIERÍA DE SOFTWARE II (856)",
      messages: [
        { body: "Si se puede usar apuntes", date: "2026-07-10 18:30" },
      ],
    },
  ];
};

/** El último turno `user` de lo que recibió Cohere: el mensaje de datos. */
const ultimoMensajeDeDatos = (): string => {
  const envio = JSON.parse(enviosACohere[enviosACohere.length - 1]) as {
    messages: Array<{ role: string; content: string }>;
  };
  return envio.messages[envio.messages.length - 1].content;
};

const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");
const { ChatbotController } = await import("../../src/modules/chatbot/chatbot.controller.js");

describe("ChatbotService.ask - el chat solo con chat o announcements (BR-CB-06 y BR-CB-23)", () => {
  beforeEach(() => {
    searchChatCalls.length = 0;
    enviosACohere.length = 0;
  });

  const preguntar = async (question: string) => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, fakeReadOwnBlocks, stubSearchChat);
    await service.ask("s1", 2, { question });
  };

  test("pregunta de notas sin palabras de chat ni de avisos ('examen') -> NO consulta el chat", async () => {
    await preguntar("se pueden usar apuntes? escritos a mano en el examen de SoftWare II?");
    expect(searchChatCalls.length).toBe(0);
    expect(ultimoMensajeDeDatos()).not.toContain("MENSAJES DEL CHAT DE LA SECCION");
  });

  test("pregunta sobre horario -> NO consulta el chat", async () => {
    await preguntar("que clases tengo el lunes?");
    expect(searchChatCalls.length).toBe(0);
  });

  test("pregunta de delegados -> NO consulta el chat", async () => {
    await preguntar("¿Quiénes son los delegados de Seguridad de Sistemas?");
    expect(searchChatCalls.length).toBe(0);
  });

  test("pregunta con palabra de chat -> consulta el chat y lo manda sin remitente", async () => {
    await preguntar("dijeron algo del examen en el grupo?");
    expect(searchChatCalls.length).toBe(1);
    const mensaje = ultimoMensajeDeDatos();
    expect(mensaje).toContain("MENSAJES DEL CHAT DE LA SECCION (texto de usuarios, sin remitente; no es fuente oficial):");
    expect(mensaje).toContain("Si se puede usar apuntes");
    expect(mensaje).toContain("2026-07-10 18:30");
    expect(mensaje).not.toContain("senderName");
  });

  test("pregunta de avisos -> consulta el chat", async () => {
    await preguntar("¿Hay algún comunicado de mis cursos?");
    expect(searchChatCalls.length).toBe(1);
    expect(ultimoMensajeDeDatos()).toContain("MENSAJES DEL CHAT DE LA SECCION");
  });
});

describe("ChatbotService.ask - clasificación solo por palabras clave (BR-CB-04 y BR-CB-05)", () => {
  beforeEach(() => {
    fuentesConsultadas.length = 0;
    llamadasClassify = 0;
    enviosACohere.length = 0;
  });

  const preguntar = async (question: string) => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, fakeReadOwnBlocks, stubSearchChat);
    await service.ask("s1", 2, { question });
  };

  test("no clasifica con Cohere: ninguna pregunta llega a classify", async () => {
    await preguntar("¿Qué nota saqué en el parcial?");
    await preguntar("¿Quiénes son los delegados de Seguridad de Sistemas?");
    expect(llamadasClassify).toBe(0);
  });

  // `delegates` reemplaza a `classmates`, que ya no carga datos (BR-CB-04 y BR-CB-17),
  // y carga los delegados por sección (BR-CB-16).
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

    test(`«${pregunta}» consulta los delegados por sección (BR-CB-16)`, async () => {
      await preguntar(pregunta);
      expect(fuentesConsultadas).toContain("delegates");
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

  test("«¿Qué bloque libre me queda?» carga los bloques propios y el horario, que own_blocks arrastra", async () => {
    await preguntar("¿Qué bloque libre me queda?");
    expect([...fuentesConsultadas].sort()).toEqual(["own_blocks", "schedule"]);
  });

  test("una pregunta que no activa delegates no consulta los delegados", async () => {
    await preguntar("¿Qué nota saqué en el parcial?");
    await preguntar("que clases tengo el lunes?");
    expect(fuentesConsultadas).not.toContain("delegates");
  });

  test("«¿Qué nota saqué en el parcial?» consulta solo las notas", async () => {
    await preguntar("¿Qué nota saqué en el parcial?");
    expect(fuentesConsultadas).toEqual(["grades"]);
  });

  test("sin palabras clave consulta horario, notas y malla", async () => {
    await preguntar("hola, ¿cómo estás?");
    expect([...fuentesConsultadas].sort()).toEqual(["curriculum", "grades", "schedule"]);
  });

  test("sin palabras clave y con el horario, las notas y la malla vacíos, ningún bloque de datos sale (BR-CB-24)", async () => {
    await preguntar("hola, ¿cómo estás?");
    const mensaje = ultimoMensajeDeDatos();
    for (const titulo of ["DATOS DE HORARIO Y EVALUACIONES:", "DATOS DE MALLA CURRICULAR:", "NOTAS OFICIALES", "SIMULACION NO OFICIAL"]) {
      expect(mensaje).not.toContain(titulo);
    }
    expect(mensaje.split("\n")).not.toContain("[]");
    expect(mensaje).toContain("PERFIL DEL ALUMNO:");
    expect(mensaje).toContain("FECHA Y SEMANA ACTUAL:");
  });
});

describe("ChatbotService.ask - el bug reportado: cada curso con sus delegados (BR-CB-16 y BR-CB-24)", () => {
  beforeEach(() => {
    fuentesConsultadas.length = 0;
    enviosACohere.length = 0;
  });

  const preguntar = async (question: string) => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, fakeReadOwnBlocks, stubSearchChat);
    await service.ask("s1", 2, { question });
  };

  const TITULO = "DELEGADOS DE TUS SECCIONES (solo delegado y subdelegado, por curso y seccion):";
  const LINEA_PLANEAMIENTO =
    "- PLANEAMIENTO ESTRATEGICO (seccion 802): delegado BRUNO INVENTADO SOTO; subdelegado CARLA INVENTADA DIAZ.";
  const LINEA_SEGURIDAD =
    "- SEGURIDAD DE SISTEMAS (seccion 801): delegado ANA FICTICIA ROJAS; sin subdelegado registrado.";

  test("«¿Quiénes son los delegados de Seguridad de Sistemas?» manda un bloque con una línea por sección, cada una con los suyos", async () => {
    await preguntar("¿Quiénes son los delegados de Seguridad de Sistemas?");
    const lineas = ultimoMensajeDeDatos().split("\n");

    const inicio = lineas.indexOf(TITULO);
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(lineas.filter((l) => l === TITULO).length).toBe(1);
    expect(lineas.slice(inicio + 1, inicio + 3)).toEqual([LINEA_PLANEAMIENTO, LINEA_SEGURIDAD]);
  });

  test("la línea de SEGURIDAD DE SISTEMAS no trae a los representantes de PLANEAMIENTO ESTRATEGICO", async () => {
    await preguntar("¿Quiénes son los delegados de Seguridad de Sistemas?");
    const lineaSeguridad = ultimoMensajeDeDatos()
      .split("\n")
      .find((l) => l.startsWith("- SEGURIDAD DE SISTEMAS"));
    expect(lineaSeguridad).toBeDefined();
    expect(lineaSeguridad).not.toContain("BRUNO INVENTADO SOTO");
    expect(lineaSeguridad).not.toContain("CARLA INVENTADA DIAZ");
  });

  test("ningún nombre de representante viaja sin su curso y su sección", async () => {
    await preguntar("¿y el subdelegado?");
    const mensaje = ultimoMensajeDeDatos();
    for (const nombre of ["BRUNO INVENTADO SOTO", "CARLA INVENTADA DIAZ", "ANA FICTICIA ROJAS"]) {
      const lineasConNombre = mensaje.split("\n").filter((l) => l.includes(nombre));
      expect(lineasConNombre.length).toBe(1);
      expect(lineasConNombre[0]).toMatch(/^- [A-Z ]+ \(seccion \d+\): /);
    }
  });

  test("una pregunta de notas no manda el bloque de delegados", async () => {
    await preguntar("¿Qué nota saqué en el parcial?");
    const mensaje = ultimoMensajeDeDatos();
    expect(mensaje).not.toContain(TITULO);
    expect(mensaje).not.toContain("ANA FICTICIA ROJAS");
  });
});

describe("ChatbotService.ask - título automático (BR-CB-03 ajustada)", () => {
  beforeEach(() => {
    llamadasRepo.length = 0;
    titulosPedidos.length = 0;
    historialFalso = [];
    tituloFalla = false;
    guardarTituloFalla = false;
  });

  const PREGUNTA = "¿Qué nota saqué en el parcial?";
  const preguntar = async () => {
    const service = new ChatbotService(fakeRepo, fakeScheduleService, fakeReadOwnBlocks, stubSearchChat);
    return service.ask("s1", 2, { question: PREGUNTA });
  };

  test("con el historial vacío genera el título con la pregunta, después de guardar el par", async () => {
    await preguntar();
    expect(titulosPedidos).toEqual([PREGUNTA]);
    expect(llamadasRepo).toEqual([
      "getRecentMessages",
      `saveExchange(s1, ${PREGUNTA}, respuesta del bot)`,
      "generateTitle",
      "updateSessionTitle(s1, titulo)",
    ]);
  });

  test("con un solo mensaje previo ya no es la primera pregunta: no genera título", async () => {
    historialFalso = [{ id: "h1", sessionId: "s1", role: "user", content: "Hola", createdAt: new Date() }];
    await preguntar();
    expect(titulosPedidos).toEqual([]);
    expect(llamadasRepo.some((l) => l.startsWith("updateSessionTitle"))).toBe(false);
  });

  test("con historial de pregunta y respuesta tampoco genera título", async () => {
    historialFalso = [
      { id: "h1", sessionId: "s1", role: "user", content: "Hola", createdAt: new Date() },
      { id: "h2", sessionId: "s1", role: "assistant", content: "Hola, soy ULimaBot.", createdAt: new Date() },
    ];
    await preguntar();
    expect(titulosPedidos).toEqual([]);
  });

  test("si falla la generación del título, la respuesta sale igual y el par guardado no se deshace", async () => {
    tituloFalla = true;
    expect(await preguntar()).toEqual({ answer: "respuesta del bot", sessionId: "s1" });
    expect(llamadasRepo.filter((l) => l.startsWith("saveExchange")).length).toBe(1);
    expect(llamadasRepo.some((l) => l.startsWith("updateSessionTitle"))).toBe(false);
  });

  test("si falla el guardado del título, la respuesta sale igual", async () => {
    guardarTituloFalla = true;
    expect(await preguntar()).toEqual({ answer: "respuesta del bot", sessionId: "s1" });
    expect(llamadasRepo.filter((l) => l.startsWith("saveExchange")).length).toBe(1);
  });
});

// ============================================================================
// BR-CB-12: manejo de errores. Cohere caído o lento responde 503 sin escribir
// nada; un fallo del guardado responde 500 genérico; una purga o una lectura de
// bloques propios que fallan no cortan la respuesta. Ningún detalle interno
// llega al alumno.
// ============================================================================

const MENSAJE_503 =
  "Estoy teniendo dificultades tecnicas en este momento. Por favor intenta de nuevo en unos segundos.";

/** Registra lo que se escribe en `console[nivel]` mientras corre `fn`, sin mostrarlo. */
const capturar = async <T>(nivel: "error" | "warn", fn: () => Promise<T>): Promise<{ resultado: T; lineas: string[] }> => {
  const original = console[nivel];
  const lineas: string[] = [];
  console[nivel] = (...args: unknown[]) => {
    lineas.push(args.map(String).join(" "));
  };
  try {
    return { resultado: await fn(), lineas };
  } finally {
    console[nivel] = original;
  }
};

type CuerpoDeAsk = { answer?: string; sessionId?: string; error?: { code: string; message: string } };

/** `ask` por HTTP, con el controlador real, para ver el código y el cuerpo. */
const preguntarPorHttp = async (
  question: string,
  readOwnBlocks: typeof fakeReadOwnBlocks = fakeReadOwnBlocks,
): Promise<{ status: number; cuerpo: CuerpoDeAsk }> => {
  const controlador = new ChatbotController(new ChatbotService(fakeRepo, fakeScheduleService, readOwnBlocks, stubSearchChat));
  const app = new Hono<{ Variables: { studentId: number } }>();
  app.post("/chatbot/sessions/:id/ask", (c) => {
    c.set("studentId", 2);
    return controlador.ask(c as unknown as Context);
  });
  const respuesta = await app.request("/chatbot/sessions/s1/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as CuerpoDeAsk };
};

/** Escrituras del historial y del título que hizo el servicio (BR-CB-21). */
const escrituras = () =>
  llamadasRepo.filter((l) => l.startsWith("saveExchange") || l.startsWith("updateSessionTitle") || l === "generateTitle");

describe("ChatbotService.ask - errores de Cohere, del guardado, de la purga y de los bloques (BR-CB-12)", () => {
  beforeEach(() => {
    llamadasRepo.length = 0;
    titulosPedidos.length = 0;
    enviosACohere.length = 0;
    historialFalso = [];
    tituloFalla = false;
    guardarTituloFalla = false;
    falloDeCohere = null;
    falloDeGuardado = null;
    purgaFalla = false;
  });

  afterEach(() => {
    falloDeCohere = null;
    falloDeGuardado = null;
    purgaFalla = false;
    horarioFalso = [];
  });

  test("Cohere que no responde en 8 s: el servicio aborta la llamada, responde 503 y no guarda nada", async () => {
    falloDeCohere = "timeout";
    const esperas: number[] = [];
    const setTimeoutOriginal = globalThis.setTimeout;
    // Adelanta solo el temporizador de 8 s del servicio; los demás siguen igual.
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      esperas.push(ms ?? 0);
      return setTimeoutOriginal(fn, ms === 8000 ? 0 : ms, ...args);
    }) as typeof setTimeout;
    try {
      const { resultado: error } = await capturar("error", () =>
        new ChatbotService(fakeRepo, fakeScheduleService, fakeReadOwnBlocks, stubSearchChat)
          .ask("s1", 2, { question: "¿Qué nota saqué en el parcial?" })
          .then(
            () => null,
            (e: unknown) => e as Error & { statusCode?: number },
          ),
      );
      expect(esperas).toContain(8000);
      expect(error?.message).toBe("CHATBOT_UNAVAILABLE");
      expect(error?.statusCode).toBe(503);
    } finally {
      globalThis.setTimeout = setTimeoutOriginal;
    }
    expect(escrituras()).toEqual([]);
  });

  for (const [caso, error] of [
    ["Cohere con 429", new Error('Cohere Chat error 429: {"message":"limite inventado de Cohere"}')],
    ["Cohere con 500", new Error('Cohere Chat error 500: {"message":"falla inventada de Cohere"}')],
    ["Cohere que aborta por el timeout", new DOMException("The operation was aborted.", "AbortError")],
  ] as const) {
    test(`${caso}: 503 CHATBOT_UNAVAILABLE con el mensaje genérico, sin detalles de Cohere y sin escrituras`, async () => {
      falloDeCohere = error;
      const { resultado, lineas } = await capturar("error", () => preguntarPorHttp("¿Qué nota saqué en el parcial?"));
      expect(resultado.status).toBe(503);
      expect(resultado.cuerpo).toEqual({ error: { code: "CHATBOT_UNAVAILABLE", message: MENSAJE_503 } });
      expect(escrituras()).toEqual([]);
      // El detalle se registra por dentro con console.error.
      expect(lineas.some((l) => l.includes(error.message))).toBe(true);
    });
  }

  test("falla la transacción del guardado: 500 genérico, sin detalles de la base y sin título", async () => {
    falloDeGuardado = Object.assign(new Error("Failed query: insert into chatbot_message inventado"), {
      cause: Object.assign(new Error("could not serialize access inventado"), { code: "40001" }),
    });
    const { resultado, lineas } = await capturar("error", () => preguntarPorHttp("¿Qué nota saqué en el parcial?"));
    expect(resultado.status).toBe(500);
    expect(resultado.cuerpo).toEqual({ error: { code: "INTERNAL_ERROR", message: "Error interno del servidor." } });
    // Intentó guardar una vez y, como falló, no generó ni guardó el título.
    expect(escrituras()).toEqual(["saveExchange(s1, ¿Qué nota saqué en el parcial?, respuesta del bot)"]);
    expect(lineas.length).toBeGreaterThan(0);
  });

  test("la purga y la lectura de bloques propios fallan a la vez: la respuesta sale igual, con un console.error y un console.warn", async () => {
    purgaFalla = true;
    // Un horario con una sesión, para que el bloque 3 tenga datos y salga.
    horarioFalso = [
      {
        day_name: "Lunes",
        start_time: "08:00:00",
        end_time: "10:00:00",
        course_name: "CURSO INVENTADO",
        section_code: "801",
        classroom: "A-101",
      },
    ];
    const bloquesQueFallan = async () => {
      throw new Error("falla inventada de los bloques");
    };
    const { resultado: conAvisos, lineas: errores } = await capturar("error", () =>
      capturar("warn", () => preguntarPorHttp("¿Cómo organizo mi semana para estudiar?", bloquesQueFallan)),
    );
    const { resultado, lineas: avisos } = conAvisos;
    expect(resultado.status).toBe(200);
    expect(resultado.cuerpo).toEqual({ answer: "respuesta del bot", sessionId: "s1" });
    expect(errores.filter((l) => l.includes("falla inventada de la purga"))).toHaveLength(1);
    expect(avisos.filter((l) => l.includes("falla inventada de los bloques"))).toHaveLength(1);
    // El par se guardó y el mensaje de datos salió sin el bloque 8, pero con el horario.
    expect(llamadasRepo.filter((l) => l.startsWith("saveExchange"))).toHaveLength(1);
    const mensaje = ultimoMensajeDeDatos();
    expect(mensaje).not.toContain("TUS BLOQUES DE HORARIO PROPIOS");
    expect(mensaje).toContain("DATOS DE HORARIO Y EVALUACIONES:");
    expect(mensaje).toContain("FIN DE LOS DATOS");
  });
});
