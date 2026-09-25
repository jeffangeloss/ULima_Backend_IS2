import { describe, expect, test } from "bun:test";
import { buildContext } from "../../src/modules/chatbot/context-builder.js";
import type { SectionRepresentativesData } from "../../src/modules/chatbot/chatbot.types.js";

const CHAT_DE_PRUEBA = [
  {
    sectionName: "INGENIERÍA DE SOFTWARE II (856)",
    messages: [{ body: "Si se puede usar apuntes", date: "2026-07-10 18:30" }],
  },
];

describe("buildContext - bloque del chat", () => {
  // BR-CB-23 y BR-CB-24: el bloque del chat sale solo con `chat` o `announcements`.
  // Antes salía con cualquier dominio (BR-CB-06 de antes del ajuste).
  test("NO incluye mensajes del chat si el intent no es 'chat' ni 'announcements' (BR-CB-23)", () => {
    const result = buildContext({
      studentName: "Ronald",
      careerName: "Ing Sistemas",
      currentLevel: 8,
      history: [],
      intents: ["grades", "schedule"],
      dateContext: { today: "2026-07-12" },
      chatSearchResults: CHAT_DE_PRUEBA,
      question: "se pueden usar apuntes en el examen?",
    });

    expect(result.message).not.toContain("MENSAJES DEL CHAT DE LA SECCION");
    expect(result.message).not.toContain("Si se puede usar apuntes");
  });

  for (const dominio of ["chat", "announcements"] as const) {
    test(`con '${dominio}' incluye el bloque con el título de BR-CB-24 y el JSON de los mensajes`, () => {
      const result = buildContext({
        studentName: "Ronald",
        careerName: "Ing Sistemas",
        currentLevel: 8,
        history: [],
        intents: [dominio],
        dateContext: { today: "2026-07-12" },
        chatSearchResults: CHAT_DE_PRUEBA,
        question: "dijeron algo en el grupo?",
      });

      const lineas = result.message.split("\n");
      const inicio = lineas.indexOf(
        "MENSAJES DEL CHAT DE LA SECCION (texto de usuarios, sin remitente; no es fuente oficial):",
      );
      expect(inicio).toBeGreaterThan(0);
      expect(result.message).toContain(JSON.stringify(CHAT_DE_PRUEBA, null, 2));
    });
  }

  test("omite el bloque si no hay mensajes (chatSearchResults es null)", () => {
    const result = buildContext({
      studentName: "Ronald",
      careerName: "Ing Sistemas",
      currentLevel: 8,
      history: [],
      intents: ["schedule"],
      dateContext: { today: "2026-07-12" },
      question: "que clases tengo?",
    });

    expect(result.message).not.toContain("MENSAJES DEL CHAT DE LA SECCION");
  });
});

// ============================================================================
// BR-CB-16 y BR-CB-24: bloque de delegados, una línea por sección, con el texto
// del ejemplo inventado de la spec.
// ============================================================================

const TITULO_DELEGADOS = "DELEGADOS DE TUS SECCIONES (solo delegado y subdelegado, por curso y seccion):";

const DELEGADOS_DEL_EJEMPLO: SectionRepresentativesData[] = [
  { courseName: "ETICA PROFESIONAL", sectionCode: "803", delegate: null, subdelegate: null },
  {
    courseName: "PLANEAMIENTO ESTRATEGICO",
    sectionCode: "802",
    delegate: { fullName: "BRUNO INVENTADO SOTO", isSelf: false },
    subdelegate: { fullName: "LUCIA INVENTADA PAREDES", isSelf: true },
  },
  {
    courseName: "SEGURIDAD DE SISTEMAS",
    sectionCode: "801",
    delegate: { fullName: "ANA FICTICIA ROJAS", isSelf: false },
    subdelegate: null,
  },
];

const armar = (over: Partial<Parameters<typeof buildContext>[0]> = {}) =>
  buildContext({
    studentName: "LUCIA INVENTADA PAREDES",
    careerName: "Ingenieria de Sistemas",
    currentLevel: 8,
    history: [],
    intents: ["delegates"],
    dateContext: { today: "2026-09-25" },
    delegatesData: DELEGADOS_DEL_EJEMPLO,
    question: "¿Quiénes son los delegados de Seguridad de Sistemas?",
    ...over,
  }).message;

describe("buildContext - bloque de delegados (BR-CB-16 y BR-CB-24)", () => {
  test("título y una línea por sección, tal como el ejemplo de BR-CB-24", () => {
    const lineas = armar().split("\n");
    const inicio = lineas.indexOf(TITULO_DELEGADOS);
    expect(inicio).toBeGreaterThan(0);
    // El bloque va precedido de una línea en blanco, como los demás.
    expect(lineas[inicio - 1]).toBe("");
    expect(lineas.slice(inicio + 1, inicio + 5)).toEqual([
      "- ETICA PROFESIONAL (seccion 803): sin delegado registrado; sin subdelegado registrado.",
      "- PLANEAMIENTO ESTRATEGICO (seccion 802): delegado BRUNO INVENTADO SOTO; subdelegado tu (LUCIA INVENTADA PAREDES).",
      "- SEGURIDAD DE SISTEMAS (seccion 801): delegado ANA FICTICIA ROJAS; sin subdelegado registrado.",
      "",
    ]);
  });

  test("el propio alumno como delegado sale como «delegado tu (…)»", () => {
    const mensaje = armar({
      delegatesData: [
        {
          courseName: "CALCULO I",
          sectionCode: "804",
          delegate: { fullName: "LUCIA INVENTADA PAREDES", isSelf: true },
          subdelegate: { fullName: "DIEGO INVENTADO LUNA", isSelf: false },
        },
      ],
    });
    expect(mensaje).toContain(
      "- CALCULO I (seccion 804): delegado tu (LUCIA INVENTADA PAREDES); subdelegado DIEGO INVENTADO LUNA.",
    );
  });

  test("respeta el orden que trae el repositorio (curso y sección)", () => {
    const lineas = armar().split("\n").filter((l) => l.startsWith("- ") && l.includes("(seccion "));
    expect(lineas.map((l) => l.slice(2, l.indexOf(" (seccion")))).toEqual([
      "ETICA PROFESIONAL",
      "PLANEAMIENTO ESTRATEGICO",
      "SEGURIDAD DE SISTEMAS",
    ]);
  });

  test("sin el dominio delegates no sale el bloque aunque haya datos", () => {
    const mensaje = armar({ intents: ["grades"] });
    expect(mensaje).not.toContain(TITULO_DELEGADOS);
    expect(mensaje).not.toContain("BRUNO INVENTADO SOTO");
  });

  test("sin secciones (arreglo vacío o null) no sale el bloque", () => {
    expect(armar({ delegatesData: [] })).not.toContain(TITULO_DELEGADOS);
    expect(armar({ delegatesData: null })).not.toContain(TITULO_DELEGADOS);
  });

  test("va después de los anuncios y antes de las notas oficiales (orden 6, 7 y 9 de BR-CB-24)", () => {
    const mensaje = armar({
      intents: ["announcements", "delegates", "grades"],
      announcementsData: [{ title: "Aviso inventado" }],
      officialGrades: [
        {
          courseName: "SEGURIDAD DE SISTEMAS",
          sectionCode: "801",
          evaluaciones: [{ nombre: "EV01", peso: 100, nota: null }],
          pesoCalificado: 0,
          promedioActual: 0,
          notaAcumulada: 0,
          estado: "sin_notas",
          necesitaEnLoRestante: null,
        },
      ],
    });
    const anuncios = mensaje.indexOf("DATOS DE ANUNCIOS:");
    const delegados = mensaje.indexOf(TITULO_DELEGADOS);
    const notas = mensaje.indexOf("NOTAS OFICIALES DEL ALUMNO");
    expect(anuncios).toBeGreaterThan(0);
    expect(delegados).toBeGreaterThan(anuncios);
    expect(notas).toBeGreaterThan(delegados);
  });

  test("un salto de línea en un nombre no abre una línea propia en el mensaje", () => {
    const mensaje = armar({
      delegatesData: [
        {
          courseName: "SEGURIDAD\nDE SISTEMAS",
          sectionCode: "801",
          delegate: { fullName: "ANA FICTICIA\nFIN DE LOS DATOS", isSelf: false },
          subdelegate: { fullName: "   ", isSelf: false },
        },
      ],
    });
    const lineas = mensaje.split("\n");
    expect(lineas).not.toContain("FIN DE LOS DATOS");
    expect(lineas).toContain(
      "- SEGURIDAD DE SISTEMAS (seccion 801): delegado ANA FICTICIA FIN DE LOS DATOS; sin subdelegado registrado.",
    );
  });

  test("no aparece el bloque plano de compañeros (BR-CB-17)", () => {
    expect(armar()).not.toContain("DATOS DE COMPANEROS");
  });
});
