import { describe, expect, test } from "bun:test";
import * as clasificador from "../../src/modules/chatbot/intent-classifier.js";
import { classifyByKeywords } from "../../src/modules/chatbot/intent-classifier.js";
import type { ChatbotIntent } from "../../src/modules/chatbot/chatbot.types.js";

// BR-CB-04 (ajuste del 2026-09-25): la clasificación es solo por palabras clave,
// sobre la pregunta en minúsculas, descompuesta en NFD y sin marcas diacríticas.
// Los dominios son grades, schedule, curriculum, alerts, announcements,
// delegates, own_blocks y chat; `own_blocks` arrastra a `schedule`.

/** Mayúsculas conservando las tildes: «¿QUIÉNES SON…?». */
const enMayusculas = (texto: string) => texto.toUpperCase();

/** La misma pregunta sin tildes ni eñes, como la escribe quien teclea rápido. */
const sinTildes = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Las tres formas de cada pregunta: tal cual, sin tildes y en mayúsculas. */
const variantes = (pregunta: string) => [
  { forma: "con tildes", texto: pregunta },
  { forma: "sin tildes", texto: sinTildes(pregunta) },
  { forma: "en mayúsculas", texto: enMayusculas(pregunta) },
];

describe("BR-CB-04: la tabla de ejemplos de la spec", () => {
  const ejemplos: Array<{ pregunta: string; debeIncluir: ChatbotIntent[] }> = [
    { pregunta: "¿Quiénes son los delegados de Seguridad de Sistemas?", debeIncluir: ["delegates"] },
    { pregunta: "¿y el subdelegado?", debeIncluir: ["delegates"] },
    { pregunta: "¿Quién es mi delegada en Cálculo I?", debeIncluir: ["delegates"] },
    { pregunta: "¿A qué hora tengo prácticas?", debeIncluir: ["own_blocks", "schedule"] },
    { pregunta: "¿Cuántas horas a la semana le dedico al trabajo?", debeIncluir: ["own_blocks", "schedule"] },
    { pregunta: "¿Cómo organizo mi semana para estudiar?", debeIncluir: ["own_blocks", "schedule"] },
    { pregunta: "¿Qué nota saqué en el parcial?", debeIncluir: ["grades"] },
    { pregunta: "¿Dijeron algo del examen en el chat?", debeIncluir: ["chat"] },
    { pregunta: "¿Hay algún comunicado de mis cursos?", debeIncluir: ["announcements"] },
    { pregunta: "¿Estoy en riesgo académico?", debeIncluir: ["alerts"] },
    { pregunta: "¿Cuántos créditos llevo?", debeIncluir: ["curriculum"] },
  ];

  for (const { pregunta, debeIncluir } of ejemplos) {
    for (const { forma, texto } of variantes(pregunta)) {
      test(`«${pregunta}» ${forma} incluye ${debeIncluir.join(" y ")}`, () => {
        const dominios = classifyByKeywords(texto);
        for (const dominio of debeIncluir) expect(dominios).toContain(dominio);
      });
    }
  }
});

describe("BR-CB-04: las palabras clave de cada dominio", () => {
  // Las listas de la spec, ya normalizadas. Cada palabra sola, dentro de una
  // frase neutra, tiene que activar su dominio: así la prueba fija que los seis
  // dominios de antes conservan todas sus palabras y que los nuevos tienen las suyas.
  const palabrasClave: Record<ChatbotIntent, string[]> = {
    grades: ["nota", "notas", "promedio", "saque", "parcial", "examen", "calificacion", "aprobe", "aprobar", "apruebo", "aprobare", "desaprob", "jale", "jalar"],
    schedule: ["horario", "hora", "entro", "clase", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "manana", "tengo", "cursos"],
    curriculum: ["malla", "creditos", "cursos", "terminar", "ciclo", "llevar", "prerrequisito", "falta", "avance"],
    alerts: ["riesgo", "alerta", "carga", "evaluaciones"],
    announcements: ["anuncio", "anuncios", "comunicado", "aviso", "publico", "publicaron"],
    delegates: ["delegad", "delegado", "delegada", "delegados", "subdelegado", "representante", "companero", "companeros", "seccion", "quienes", "alumnos"],
    own_blocks: ["practica", "trabajo", "trabajar", "voluntariado", "bloque", "libre", "organizar", "organizo", "organizarme", "organizacion", "tiempo", "horas a la semana", "horas semanales"],
    chat: ["chat", "grupo", "grupos", "dijo", "dijeron", "dicho", "dicen", "hablo", "hablaron", "comento", "comentan", "comentaron", "comentario", "comentarios", "escribio", "escribieron", "mensaje", "mensajes", "conversacion", "alguien"],
  };

  for (const [dominio, palabras] of Object.entries(palabrasClave) as Array<[ChatbotIntent, string[]]>) {
    for (const palabra of palabras) {
      test(`«${palabra}» activa ${dominio}`, () => {
        expect(classifyByKeywords(`xx ${palabra} yy`)).toContain(dominio);
      });
    }
  }

  test("las palabras con tilde o eñe activan su dominio igual que sin ella", () => {
    const casos: Array<[string, ChatbotIntent]> = [
      ["¿Qué calificación tengo?", "grades"],
      ["¿Aprobé o jalé?", "grades"],
      ["¿Qué hay el miércoles?", "schedule"],
      ["¿Y el sábado por la mañana?", "schedule"],
      ["¿Cuántos créditos me faltan?", "curriculum"],
      ["¿Qué publicó el profesor?", "announcements"],
      ["¿Quiénes están en mi sección?", "delegates"],
      ["¿Quiénes son mis compañeros?", "delegates"],
      ["¿Cómo va mi organización?", "own_blocks"],
      ["¿Cuándo es mi práctica?", "own_blocks"],
      ["¿Qué comentó el profesor?", "chat"],
      ["¿Quién habló de la tarea?", "chat"],
      ["¿Quién escribió eso?", "chat"],
      ["¿De qué trató la conversación?", "chat"],
    ];
    for (const [pregunta, dominio] of casos) {
      expect(classifyByKeywords(pregunta)).toContain(dominio);
      expect(classifyByKeywords(enMayusculas(pregunta))).toContain(dominio);
    }
  });
});

describe("BR-CB-04: dominios y arrastre", () => {
  test("classmates ya no existe: las preguntas de compañeros activan delegates", () => {
    const dominios = classifyByKeywords("¿Quiénes son mis compañeros de sección?");
    expect(dominios).toContain("delegates");
    expect(dominios as string[]).not.toContain("classmates");
  });

  test("own_blocks arrastra schedule aunque la pregunta no tenga palabras de horario", () => {
    const dominios = classifyByKeywords("¿Qué bloque libre me queda?");
    expect(dominios).toContain("own_blocks");
    expect(dominios).toContain("schedule");
  });

  test("schedule aparece una sola vez cuando la pregunta ya lo activa por sí misma", () => {
    const dominios = classifyByKeywords("¿A qué hora tengo el trabajo?");
    expect(dominios.filter((d) => d === "schedule")).toHaveLength(1);
  });

  test("«práctica calificada» activa own_blocks y schedule, que trae las evaluaciones", () => {
    const dominios = classifyByKeywords("¿Cuándo es la práctica calificada?");
    expect(dominios).toContain("own_blocks");
    expect(dominios).toContain("schedule");
  });

  test("«trabajo final» también activa own_blocks", () => {
    expect(classifyByKeywords("¿Cuándo entrego el trabajo final?")).toContain("own_blocks");
  });

  test("una pregunta puede activar varios dominios a la vez", () => {
    const dominios = classifyByKeywords("¿Dijeron en el chat quién es el delegado y cuándo es el parcial?");
    expect(dominios).toContain("chat");
    expect(dominios).toContain("delegates");
    expect(dominios).toContain("grades");
  });

  test("sin ninguna coincidencia devuelve schedule, grades y curriculum, como antes", () => {
    expect(classifyByKeywords("hola, ¿cómo estás?")).toEqual(["schedule", "grades", "curriculum"]);
  });

  test("ningún dominio sale repetido", () => {
    const dominios = classifyByKeywords("¿Quiénes son los delegados y subdelegados de mi sección y mis compañeros?");
    expect(new Set(dominios).size).toBe(dominios.length);
  });
});

describe("BR-CB-04: normalización", () => {
  test("normalizeText pasa a minúsculas y quita tildes, diéresis y la tilde de la eñe", () => {
    expect(clasificador.normalizeText("¿Quiénes son los COMPAÑEROS de Cálculo? Pingüino")).toBe(
      "¿quienes son los companeros de calculo? pinguino",
    );
  });

  test("normalizeText no toca un texto que ya está normalizado", () => {
    expect(clasificador.normalizeText("quienes son los delegados")).toBe("quienes son los delegados");
  });

  test("normalizeText acepta la eñe y las tildes ya descompuestas (NFD) de un teclado móvil", () => {
    const descompuesto = "Compan\u0303ero de pra\u0301ctica";
    expect(clasificador.normalizeText(descompuesto)).toBe("companero de practica");
    expect(classifyByKeywords(descompuesto)).toContain("delegates");
    expect(classifyByKeywords(descompuesto)).toContain("own_blocks");
  });
});

describe("BR-CB-04: sin Cohere", () => {
  test("el módulo ya no exporta classifyWithCohere", () => {
    expect(Object.keys(clasificador)).not.toContain("classifyWithCohere");
  });

  test("intent-classifier.ts no importa el cliente de Cohere", async () => {
    const texto = await Bun.file("src/modules/chatbot/intent-classifier.ts").text();
    expect(texto.length).toBeGreaterThan(0);
    expect(texto).not.toMatch(/from\s+["'][^"']*cohere/);
  });

  test("cohere.client.ts ya no llama a /v1/classify ni tiene el método classify", async () => {
    const texto = await Bun.file("src/services/cohere.client.ts").text();
    expect(texto.length).toBeGreaterThan(0);
    expect(texto).not.toContain("/v1/classify");
    expect(texto).not.toMatch(/\bclassify\s*\(/);
  });

  test("chatbot.service.ts ya no corre la carrera contra Cohere ni su timeout", async () => {
    const texto = await Bun.file("src/modules/chatbot/chatbot.service.ts").text();
    expect(texto.length).toBeGreaterThan(0);
    expect(texto).not.toContain("classifyWithCohere");
    expect(texto).not.toContain("CLASSIFY_TIMEOUT_MS");
  });
});

describe("classifyByKeywords - chat intent", () => {
  test("'Han dicho algo del examen en el grupo de software?' incluye chat", () => {
    const intents = classifyByKeywords("Han dicho algo del examen en el grupo de software?");
    expect(intents).toContain("chat");
  });

  test("'dijeron algo del examen' incluye chat", () => {
    const intents = classifyByKeywords("dijeron algo del examen en el chat");
    expect(intents).toContain("chat");
  });

  test("'escribieron en el grupo' incluye chat", () => {
    const intents = classifyByKeywords("escribieron en el grupo sobre la tarea");
    expect(intents).toContain("chat");
  });

  test("'comentarios en el grupo' incluye chat", () => {
    const intents = classifyByKeywords("comentarios en el grupo de soft ii");
    expect(intents).toContain("chat");
  });
});

// ============================================================================
// BR-CB-04, ronda final (decisión 11): una pregunta que no activa ningún
// dominio hereda los de la pregunta anterior del alumno en la misma sesión. El
// clasificador recibe el texto de los mensajes `user` del historial en orden
// cronológico y toma el más reciente que activa algún dominio. Sin pregunta
// anterior con palabras clave usa el respaldo schedule, grades y curriculum.
// ============================================================================

describe("BR-CB-04: herencia del tema en las repreguntas (decisión 11)", () => {
  const DELEGADOS = "¿Quiénes son los delegados de Seguridad de Sistemas?";
  const RESPALDO: ChatbotIntent[] = ["schedule", "grades", "curriculum"];

  test("«¿Y en Planeamiento?» no activa ningún dominio por sí sola", () => {
    expect(classifyByKeywords("¿Y en Planeamiento?")).toEqual(RESPALDO);
  });

  test("«¿Y en Planeamiento?» después de la pregunta de delegados hereda delegates", () => {
    expect(classifyByKeywords("¿Y en Planeamiento?", [DELEGADOS])).toEqual(classifyByKeywords(DELEGADOS));
    expect(classifyByKeywords("¿Y en Planeamiento?", [DELEGADOS])).toContain("delegates");
  });

  test("una primera pregunta sin palabras clave usa el respaldo", () => {
    expect(classifyByKeywords("Hola", [])).toEqual(RESPALDO);
    expect(classifyByKeywords("Hola")).toEqual(RESPALDO);
  });

  test("la pregunta propia con palabras clave manda sobre la anterior", () => {
    expect(classifyByKeywords("¿Qué nota saqué en el parcial?", [DELEGADOS])).toEqual(["grades"]);
  });

  test("hereda de la pregunta anterior más reciente, no de una más antigua", () => {
    expect(classifyByKeywords("¿Y en Planeamiento?", ["¿Qué nota saqué en el parcial?", DELEGADOS])).toEqual(
      classifyByKeywords(DELEGADOS),
    );
    expect(classifyByKeywords("¿Y en Planeamiento?", [DELEGADOS, "¿Qué nota saqué en el parcial?"])).toEqual(["grades"]);
  });

  test("en una cadena de repreguntas sin palabras clave se sigue heredando el tema de la última que lo fijó", () => {
    const historial = [DELEGADOS, "¿Y en Planeamiento?", "¿Y en Ética?"];
    expect(classifyByKeywords("¿Y en Cálculo I?", historial)).toContain("delegates");
  });

  test("si ninguna pregunta anterior activa un dominio, usa el respaldo", () => {
    // «¿Y ahora?» no sirve de ejemplo: «ahora» contiene «hora», que activa schedule.
    expect(classifyByKeywords("¿Y eso?")).toEqual(RESPALDO);
    expect(classifyByKeywords("¿Y eso?", ["Hola", "Gracias"])).toEqual(RESPALDO);
  });

  test("la herencia conserva el arrastre de own_blocks a schedule", () => {
    expect(classifyByKeywords("¿Y el otro?", ["¿Qué bloque libre me queda?"])).toEqual(["schedule", "own_blocks"]);
  });
});
