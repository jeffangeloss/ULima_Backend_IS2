import { describe, expect, test, mock, beforeEach } from "bun:test";
import { filterSections, searchChatMessages } from "../../src/modules/chatbot/chat-search.js";

const SECTIONS = [
  { sectionId: 1, courseName: "INGENIERÍA DE SOFTWARE II", sectionCode: "856" },
  { sectionId: 2, courseName: "APRENDIZAJE DE MÁQUINA / MACHINE LEARNING", sectionCode: "753" },
  { sectionId: 3, courseName: "CIBERSEGURIDAD / CYBERSECURITY", sectionCode: "751" },
  { sectionId: 4, courseName: "GESTIÓN DE OPERACIONES", sectionCode: "756" },
  { sectionId: 5, courseName: "SISTEMAS DE INTELIGENCIA EMPRESARIAL", sectionCode: "751" },
];

describe("filterSections - chat search", () => {
  test("match por nombre completo en minúsculas", () => {
    const result = filterSections("qué se dijo en gestión de operaciones", SECTIONS);
    expect(result.map((s) => s.sectionId)).toContain(4);
  });

  test("match por token parcial: 'software' matchea INGENIERÍA DE SOFTWARE II", () => {
    const result = filterSections("han dicho algo en el grupo de software", SECTIONS);
    expect(result.map((s) => s.sectionId)).toContain(1);
  });

  test("match por token parcial: 'machine' matchea APRENDIZAJE DE MÁQUINA / MACHINE LEARNING", () => {
    const result = filterSections("comentarios en el grupo de machine learning", SECTIONS);
    expect(result.map((s) => s.sectionId)).toContain(2);
  });

  test("match por sectionCode", () => {
    const result = filterSections("algo sobre la sección 856", SECTIONS);
    expect(result.map((s) => s.sectionId)).toContain(1);
  });

  test("ignora palabras cortas y numeros romanos", () => {
    const result = filterSections("qué pasa en el grupo de ciberseguridad", SECTIONS);
    expect(result.map((s) => s.sectionId)).toContain(3);
  });

  test("sin match: cae al fallback de las primeras 3 secciones", () => {
    const result = filterSections("xyz abc sin coincidencia", SECTIONS);
    expect(result.length).toBe(3);
  });
});

describe("searchChatMessages - lectura completa", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("devuelve TODOS los mensajes leídos (no top-K)", async () => {
    const fakeMessages = [
      { id: "m0", senderName: "A", body: "Hola", createdAt: 1 },
      { id: "m1", senderName: "B", body: "Se puede usar apuntes en el examen?", createdAt: 2 },
      { id: "m2", senderName: "C", body: "Miau miau", createdAt: 3 },
    ];

    mock.module("../../src/services/firebase.service.js", () => ({
      firebaseService: { getRecentMessages: async () => fakeMessages },
    }));

    const { searchChatMessages: search } = await import("../../src/modules/chatbot/chat-search.js");
    const results = await search(
      "Se puede usar apuntes en el examen de software? lo han dicho por el grupo?",
      [{ sectionId: 1, courseName: "INGENIERIA DE SOFTWARE II", sectionCode: "856" }],
    );

    expect(results.length).toBe(1);
    expect(results[0].messages.length).toBe(3);
    expect(results[0].messages[1].body).toBe("Se puede usar apuntes en el examen?");
  });

  test("sección sin mensajes: no agrega resultado", async () => {
    mock.module("../../src/services/firebase.service.js", () => ({
      firebaseService: { getRecentMessages: async () => [] },
    }));

    const { searchChatMessages: search } = await import("../../src/modules/chatbot/chat-search.js");
    const results = await search(
      "qué se dijo en el chat?",
      [{ sectionId: 1, courseName: "INGENIERIA DE SOFTWARE II", sectionCode: "856" }],
    );

    expect(results.length).toBe(0);
  });

  test("error de firebase: continua con la siguiente sección, no rompe", async () => {
    mock.module("../../src/services/firebase.service.js", () => ({
      firebaseService: {
        getRecentMessages: async (sectionId: number) => {
          if (sectionId === 1) throw new Error("firebase down");
          return [
            { id: "m0", senderName: "A", body: "ok", createdAt: 1 },
          ];
        },
      },
    }));

    const { searchChatMessages: search } = await import("../../src/modules/chatbot/chat-search.js");
    const results = await search(
      "qué se dijo?",
      [
        { sectionId: 1, courseName: "CURSO A", sectionCode: "100" },
        { sectionId: 2, courseName: "CURSO B", sectionCode: "200" },
      ],
    );

    expect(results.length).toBe(1);
    expect(results[0].sectionName).toContain("CURSO B");
  });
});

// ============================================================================
// Ajuste del 2026-09-25: BR-CB-06 (normalización y respaldo ordenado) y BR-CB-23
// (mensajes sin remitente y con la fecha en hora de Lima). Cursos, secciones y
// mensajes inventados.
// ============================================================================

describe("filterSections - normalización de BR-CB-04 y respaldo ordenado (BR-CB-06)", () => {
  const CURSOS = [
    { sectionId: 11, courseName: "CÁLCULO I", sectionCode: "801" },
    { sectionId: 12, courseName: "ETICA PROFESIONAL", sectionCode: "803" },
    { sectionId: 13, courseName: "ÓPTICA APLICADA", sectionCode: "805" },
  ];

  test("la pregunta sin tilde encuentra el curso escrito con tilde («calculo» → CÁLCULO I)", () => {
    const result = filterSections("que dijeron en el grupo de calculo?", CURSOS);
    expect(result.map((s) => s.sectionId)).toEqual([11]);
  });

  test("la pregunta con tilde encuentra el curso escrito sin tilde («ética» → ETICA PROFESIONAL)", () => {
    const result = filterSections("¿Qué se comentó en ética?", CURSOS);
    expect(result.map((s) => s.sectionId)).toEqual([12]);
  });

  test("el nombre completo coincide aunque la pregunta y el curso difieran en tildes y mayúsculas", () => {
    const result = filterSections("mensajes de OPTICA APLICADA", CURSOS);
    expect(result.map((s) => s.sectionId)).toEqual([13]);
  });

  test("sin coincidencia, el respaldo toma las 3 primeras por nombre de curso y código de sección, sin importar el orden de entrada", () => {
    const desordenadas = [
      { sectionId: 1, courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801" },
      { sectionId: 2, courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "802" },
      { sectionId: 3, courseName: "ÉTICA PROFESIONAL", sectionCode: "803" },
      { sectionId: 4, courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "801" },
      { sectionId: 5, courseName: "ANALITICA DE DATOS", sectionCode: "807" },
    ];
    const result = filterSections("xyz abc sin coincidencia", desordenadas);
    // ANALITICA, ÉTICA (se ordena como «etica») y PLANEAMIENTO 801 antes que 802.
    expect(result.map((s) => s.sectionId)).toEqual([5, 3, 4]);
    // Otra permutación de la misma entrada da la misma salida.
    const alReves = filterSections("xyz abc sin coincidencia", [...desordenadas].reverse());
    expect(alReves.map((s) => s.sectionId)).toEqual([5, 3, 4]);
  });

  test("las coincidencias también salen ordenadas por curso y sección", () => {
    const result = filterSections("que se dijo en planeamiento?", [
      { sectionId: 2, courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "802" },
      { sectionId: 4, courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "801" },
    ]);
    expect(result.map((s) => s.sectionId)).toEqual([4, 2]);
  });

  test("no cambia el arreglo que recibe", () => {
    const entrada = [
      { sectionId: 2, courseName: "ZOOLOGIA", sectionCode: "802" },
      { sectionId: 1, courseName: "ALGEBRA", sectionCode: "801" },
    ];
    filterSections("sin coincidencia", entrada);
    expect(entrada.map((s) => s.sectionId)).toEqual([2, 1]);
  });
});

describe("searchChatMessages - sin remitente y con fecha en hora de Lima (BR-CB-23)", () => {
  const SECCION = [{ sectionId: 7, courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801" }];

  // Lector inyectado en lugar de Firebase. Trae el remitente, como la lectura
  // real, para comprobar que el chatbot no lo copia.
  const lectorCon = (mensajes: Array<{ id: string; senderName: string; body: string; createdAt: number }>) =>
    async (_sectionId: number, _limit: number) => mensajes;

  test("cada mensaje queda solo con body y date, en ese orden, sin senderName ni createdAt", async () => {
    const results = await searchChatMessages("que dijeron en el chat?", SECCION, lectorCon([
      { id: "m1", senderName: "REMITENTE INVENTADO UNO", body: "El parcial es el lunes 28?", createdAt: Date.UTC(2026, 8, 25, 2, 15) },
    ]));

    expect(results).toEqual([
      {
        sectionName: "SEGURIDAD DE SISTEMAS (801)",
        messages: [{ body: "El parcial es el lunes 28?", date: "2026-09-24 21:15" }],
      },
    ]);
    expect(Object.keys(results[0].messages[0])).toEqual(["body", "date"]);
    const json = JSON.stringify(results);
    expect(json).not.toContain("REMITENTE INVENTADO UNO");
    expect(json).not.toContain("senderName");
    expect(json).not.toContain("createdAt");
  });

  test("la fecha usa America/Lima (UTC-5): la medianoche de Lima sale 00:00, no 24:00 ni el día UTC", async () => {
    const results = await searchChatMessages("chat", SECCION, lectorCon([
      { id: "a", senderName: "X", body: "uno", createdAt: Date.UTC(2026, 8, 25, 5, 0) },
      { id: "b", senderName: "X", body: "dos", createdAt: Date.UTC(2026, 8, 25, 4, 59) },
      { id: "c", senderName: "X", body: "tres", createdAt: Date.UTC(2026, 0, 1, 3, 7) },
    ]));

    expect(results[0].messages.map((m) => m.date)).toEqual([
      "2026-09-25 00:00",
      "2026-09-24 23:59",
      "2025-12-31 22:07",
    ]);
  });

  test("una fecha que no es un número válido no tumba la sección: el mensaje sale con «sin fecha»", async () => {
    const results = await searchChatMessages("chat", SECCION, lectorCon([
      { id: "a", senderName: "X", body: "sin hora", createdAt: Number.NaN },
      { id: "b", senderName: "X", body: "con hora", createdAt: Date.UTC(2026, 8, 24, 21, 17) },
    ]));

    expect(results[0].messages).toEqual([
      { body: "sin hora", date: "sin fecha" },
      { body: "con hora", date: "2026-09-24 16:17" },
    ]);
  });

  test("pide los 200 últimos mensajes de cada sección que coincide", async () => {
    const pedidos: Array<{ sectionId: number; limit: number }> = [];
    await searchChatMessages("que dijeron en seguridad?", [
      ...SECCION,
      { sectionId: 8, courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "802" },
    ], async (sectionId, limit) => {
      pedidos.push({ sectionId, limit });
      return [];
    });
    expect(pedidos).toEqual([{ sectionId: 7, limit: 200 }]);
  });

  test("chat-search.ts ya no lee el remitente del mensaje", async () => {
    const fuente = await Bun.file("src/modules/chatbot/chat-search.ts").text();
    expect(fuente).not.toMatch(/\.senderName\b/);
    expect(fuente).not.toMatch(/senderName\s*:/);
  });
});

// ============================================================================
// Revisión de la Tarea 2 (2026-09-25): el filtro de BR-CB-06 ignora artículos y
// preposiciones aunque tengan más de 3 letras, y los mensajes que su autor
// borró (R-CHAT-4, borrado suave que conserva `body`) no viajan (BR-CB-23).
// Cursos y mensajes inventados.
// ============================================================================

describe("filterSections - artículos y preposiciones no emparejan (BR-CB-06)", () => {
  // El respaldo, sin coincidencias, da ANALITICA, BASES y CALCULO. Si una
  // palabra vacía emparejara, saldría la sección de ZOOLOGIA.
  const CON_PALABRAS_VACIAS = [
    { sectionId: 1, courseName: "ANALITICA DE DATOS", sectionCode: "801" },
    { sectionId: 2, courseName: "BASES DE DATOS", sectionCode: "802" },
    { sectionId: 3, courseName: "CÁLCULO I", sectionCode: "803" },
    {
      sectionId: 9,
      courseName:
        "ZOOLOGÍA ANTE BAJO CABE CONTRA DESDE DURANTE ENTRE HACIA HASTA MEDIANTE PARA SEGÚN SOBRE TRAS VERSUS VÍA UNOS UNAS",
      sectionCode: "809",
    },
  ];

  test("«para», «sobre», «entre», «desde» y «hasta» en la pregunta no emparejan un curso que las lleva", () => {
    const result = filterSections(
      "¿qué dijeron para el examen, sobre la práctica, entre semana, desde el lunes hasta el viernes?",
      CON_PALABRAS_VACIAS,
    );
    expect(result.map((s) => s.sectionId)).toEqual([1, 2, 3]);
  });

  test("ningún artículo ni preposición de más de 3 letras empareja por sí solo", () => {
    const vacias = [
      "ante", "bajo", "cabe", "contra", "desde", "durante", "entre", "hacia", "hasta",
      "mediante", "para", "según", "sobre", "tras", "versus", "vía", "unos", "unas",
    ];
    for (const palabra of vacias) {
      const result = filterSections(`mensajes ${palabra} el grupo`, CON_PALABRAS_VACIAS);
      expect({ palabra, ids: result.map((s) => s.sectionId) }).toEqual({ palabra, ids: [1, 2, 3] });
    }
  });

  test("una preposición dentro de otra palabra tampoco empareja («preparar» contiene «para»)", () => {
    const result = filterSections("¿cómo preparar el parcial?", [
      { sectionId: 1, courseName: "ANALITICA DE DATOS", sectionCode: "801" },
      { sectionId: 2, courseName: "BASES DE DATOS", sectionCode: "802" },
      { sectionId: 3, courseName: "CÁLCULO I", sectionCode: "803" },
      { sectionId: 4, courseName: "ESTADÍSTICA PARA INGENIEROS", sectionCode: "804" },
    ]);
    expect(result.map((s) => s.sectionId)).toEqual([1, 2, 3]);
  });

  test("las palabras con contenido del mismo curso siguen emparejando", () => {
    const result = filterSections("¿qué dijeron en zoología?", CON_PALABRAS_VACIAS);
    expect(result.map((s) => s.sectionId)).toEqual([9]);
  });
});

describe("searchChatMessages - los mensajes borrados no viajan (BR-CB-23, R-CHAT-4)", () => {
  const SECCIONES = [
    { sectionId: 7, courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801" },
    { sectionId: 8, courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "802" },
  ];

  test("un mensaje con deleted === true se omite y su texto no llega al resultado", async () => {
    const results = await searchChatMessages("que dijeron en seguridad?", SECCIONES, async () => [
      { body: "El parcial es el lunes", createdAt: Date.UTC(2026, 8, 24, 15, 0) },
      { body: "TEXTO BORRADO POR SU AUTOR", createdAt: Date.UTC(2026, 8, 24, 15, 5), deleted: true },
      { body: "Gracias", createdAt: Date.UTC(2026, 8, 24, 15, 10), deleted: false },
    ]);

    expect(results).toEqual([
      {
        sectionName: "SEGURIDAD DE SISTEMAS (801)",
        messages: [
          { body: "El parcial es el lunes", date: "2026-09-24 10:00" },
          { body: "Gracias", date: "2026-09-24 10:10" },
        ],
      },
    ]);
    expect(JSON.stringify(results)).not.toContain("TEXTO BORRADO POR SU AUTOR");
  });

  test("una sección cuyos mensajes leídos están todos borrados se omite, como una sección sin mensajes", async () => {
    const results = await searchChatMessages("chat de seguridad y planeamiento", SECCIONES, async (sectionId) =>
      sectionId === 7
        ? [{ body: "BORRADO UNO", createdAt: 1, deleted: true }, { body: "BORRADO DOS", createdAt: 2, deleted: true }]
        : [{ body: "Nos vemos en clase", createdAt: Date.UTC(2026, 8, 24, 15, 0) }],
    );

    expect(results.map((r) => r.sectionName)).toEqual(["PLANEAMIENTO ESTRATEGICO (802)"]);
    expect(JSON.stringify(results)).not.toContain("BORRADO");
  });
});

// ============================================================================
// BR-CB-06 y BR-CB-24, ronda final (decisión 8): el bloque 11 dice «no hay
// mensajes» solo si todas las lecturas respondieron. Si ninguna sección trajo
// mensajes y alguna lectura falló, `searchChatMessages` devuelve null, que el
// armado del contexto lee como lectura fallida y no manda el bloque.
// ============================================================================

describe("searchChatMessages - una lectura fallida no se confunde con «no hay mensajes» (BR-CB-06)", () => {
  const SECCIONES = [
    { sectionId: 7, courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801" },
    { sectionId: 8, courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "802" },
  ];
  const PREGUNTA = "chat de seguridad y planeamiento";

  test("si todas las lecturas fallan, devuelve null", async () => {
    const results = await searchChatMessages(PREGUNTA, SECCIONES, async () => {
      throw new Error("firebase inventado caído");
    });
    expect(results).toBeNull();
  });

  test("si una lectura falla y la otra responde sin mensajes, devuelve null", async () => {
    const results = await searchChatMessages(PREGUNTA, SECCIONES, async (sectionId) => {
      if (sectionId === 7) throw new Error("firebase inventado caído");
      return [];
    });
    expect(results).toBeNull();
  });

  test("si una lectura falla y la otra solo trae mensajes borrados, devuelve null", async () => {
    const results = await searchChatMessages(PREGUNTA, SECCIONES, async (sectionId) => {
      if (sectionId === 8) throw new Error("firebase inventado caído");
      return [{ body: "BORRADO", createdAt: 1, deleted: true }];
    });
    expect(results).toBeNull();
  });

  test("si todas las lecturas responden sin mensajes, devuelve un arreglo vacío", async () => {
    const results = await searchChatMessages(PREGUNTA, SECCIONES, async () => []);
    expect(results).toEqual([]);
  });

  test("si una lectura falla y la otra trae mensajes, devuelve los que llegaron", async () => {
    const results = await searchChatMessages(PREGUNTA, SECCIONES, async (sectionId) => {
      if (sectionId === 7) throw new Error("firebase inventado caído");
      return [{ body: "Nos vemos en clase", createdAt: Date.UTC(2026, 8, 24, 15, 0) }];
    });
    expect(results).toEqual([
      { sectionName: "PLANEAMIENTO ESTRATEGICO (802)", messages: [{ body: "Nos vemos en clase", date: "2026-09-24 10:00" }] },
    ]);
  });
});
