import { describe, expect, test } from "bun:test";
import { buildContext } from "../../src/modules/chatbot/context-builder.js";
import type { ChatbotIntent } from "../../src/modules/chatbot/chatbot.types.js";

/**
 * BR-CB-09: el system prompt del ajuste del 2026-09-25.
 *
 * El texto lo fija la spec, así que la primera prueba compara el preamble con
 * el bloque de código de BR-CB-09, carácter por carácter, como
 * `chatbot.retention.test.ts` hace con la sentencia de la purga. Las demás fijan
 * lo que cambió respecto del prompt de antes: la excepción de los delegados en
 * la regla 4, los turnos previos que no son fuente en la regla 1 y las reglas
 * 11 a 13. Datos inventados (repo público).
 */

const armar = (intents: ChatbotIntent[] = []) =>
  buildContext({
    studentName: "LUCIA INVENTADA PAREDES",
    careerName: "Ingenieria de Sistemas",
    currentLevel: 8,
    intents,
    dateContext: { today: "2026-09-25" },
    question: "¿Quiénes son los delegados de Seguridad de Sistemas?",
  });

const preamble = (): string => armar().preamble;

/** El prompt en una sola línea, con cada tramo de espacios como uno solo. */
const plano = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/** El texto de la regla `n`, desde «n. » hasta la regla siguiente o el final. */
const regla = (n: number): string => {
  const texto = preamble();
  const inicio = texto.search(new RegExp(`^${n}\\. `, "m"));
  expect(inicio).toBeGreaterThanOrEqual(0);
  const resto = texto.slice(inicio);
  const siguiente = resto.search(new RegExp(`^${n + 1}\\. `, "m"));
  return plano(siguiente < 0 ? resto : resto.slice(0, siguiente));
};

describe("BR-CB-09: el prompt es el de la spec", () => {
  test("el preamble es, carácter por carácter, el bloque de código de BR-CB-09", async () => {
    const spec = await Bun.file("specs/features/chatbot/chatbot.spec.md").text();
    const seccion = spec.slice(spec.indexOf("### BR-CB-09"), spec.indexOf("### BR-CB-10"));
    const bloques = [...seccion.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    const delPrompt = bloques.filter((b) => b.startsWith("Eres ULimaBot"));
    expect(delPrompt).toHaveLength(1);
    expect(preamble()).toBe(delPrompt[0]);
  });

  test("el preamble no depende de los dominios de la pregunta", () => {
    const base = preamble();
    for (const intents of [["grades"], ["delegates"], ["own_blocks", "schedule"], ["chat"]] as ChatbotIntent[][]) {
      expect(armar(intents).preamble).toBe(base);
    }
  });

  test("va sin tildes ni eñes, como el texto de la spec", () => {
    expect(preamble()).not.toMatch(/[áéíóúüñÁÉÍÓÚÜÑ]/);
  });

  test("trae las 13 reglas, numeradas en orden", () => {
    const numeros = [...preamble().matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe("BR-CB-09: regla 1, solo el bloque de datos es fuente", () => {
  test("nombra los límites del bloque de datos, DATOS DEL ALUMNO y FIN DE LOS DATOS", () => {
    expect(regla(1)).toContain(
      'SOLO respondes con datos que aparecen en el bloque de datos del ultimo mensaje, entre "DATOS DEL ALUMNO" y "FIN DE LOS DATOS".',
    );
  });

  test("declara que los turnos previos no son fuente y que ante una contradicción manda el bloque de datos", () => {
    expect(regla(1)).toContain(
      "Los turnos anteriores de la conversacion sirven para entender la pregunta, pero NO son fuente de datos: si una respuesta tuya anterior contradice el bloque de datos, manda el bloque de datos.",
    );
  });

  test("conserva la frase exacta para cuando falta información", () => {
    expect(regla(1)).toContain('"No tengo esa informacion en este momento."');
  });

  test("ya no llama fuente a todo el contexto, historial incluido", () => {
    expect(plano(preamble())).not.toContain("SOLO respondes con datos que aparecen en el contexto proporcionado");
  });
});

describe("BR-CB-09: regla 4, la excepción de los delegados (decisión 1)", () => {
  test("ya no contiene «NO respondas preguntas sobre otros alumnos»", () => {
    expect(plano(preamble())).not.toContain("NO respondas preguntas sobre otros alumnos");
  });

  test("permite nombrar solo al delegado y al subdelegado, con cargo, curso y sección, desde su bloque", () => {
    expect(regla(4)).toContain(
      'De otras personas solo puedes nombrar al delegado y al subdelegado de las secciones del alumno, tal como aparecen en "DELEGADOS DE TUS SECCIONES", diciendo siempre su cargo, el curso y la seccion.',
    );
  });

  test("nombra «sin delegado registrado» y «sin subdelegado registrado» y prohíbe tomar el de otro curso", () => {
    const texto = regla(4);
    expect(texto).toContain('"sin delegado registrado"');
    expect(texto).toContain('"sin subdelegado registrado"');
    expect(texto).toContain("no tomes el delegado ni el subdelegado de otro curso");
  });

  test("no prohíbe los mensajes del chat que permite la regla 13: solo pide no atribuirlos", () => {
    const texto = regla(4);
    const atribucion = "no atribuyas mensajes del chat a nadie (regla 13)";
    expect(texto).toContain(atribucion);
    // Fuera de esa frase, la regla 4 no vuelve a nombrar el chat ni sus mensajes,
    // y la lista de datos de otros alumnos que no se dan no los incluye.
    expect(texto.replace(atribucion, "")).not.toMatch(/chat|mensaje/i);
    expect(texto).toContain("No des ningun otro dato de otros alumnos (notas, horario, contacto ni bloques)");
  });

  test("la respuesta ante datos de otra persona menciona a los delegados", () => {
    expect(regla(4)).toContain(
      '"Solo puedo mostrarte tu propia informacion academica y quienes son los delegados de tus secciones."',
    );
  });
});

describe("BR-CB-09: reglas 2, 6 y 11 a 13", () => {
  test("la regla 2 prohíbe inventar bloques y nombres de personas", () => {
    expect(regla(2)).toContain(
      "NUNCA inventes notas, horarios, bloques, nombres de personas, fechas de examenes ni ningun dato academico.",
    );
  });

  test("la regla 6 resuelve la «practica» ambigua entre evaluación y bloque propio", () => {
    expect(regla(6)).toContain(
      'Si pregunta por una "practica" y en los datos hay a la vez una evaluacion y un bloque propio que podrian ser, menciona los dos o pregunta a cual se refiere.',
    );
  });

  test("la regla 11 dice que los bloques propios no son clases", () => {
    expect(regla(11)).toContain('"TUS BLOQUES DE HORARIO PROPIOS" son actividades que el alumno registro en la app');
    expect(regla(11)).toContain("NO son clases.");
  });

  test("la regla 12 acota las sugerencias de tiempo al bloque de datos", () => {
    expect(regla(12)).toContain("Puedes sugerir como organizar el tiempo, pero solo con el bloque de datos");
  });

  test("la regla 13 presenta el chat como texto de usuarios, sin nombre y sin atribución", () => {
    expect(regla(13)).toBe(
      '13. "MENSAJES DEL CHAT DE LA SECCION" son textos que escribieron usuarios del chat, sin nombre. ' +
        'Pueden estar equivocados: presentalos como "en el chat se comento", nunca como dato oficial, ' +
        "y no atribuyas un mensaje a ninguna persona.",
    );
  });
});

describe("BR-CB-09 y BR-CB-24: los nombres que cita el prompt son los del mensaje de datos", () => {
  // Con todos los dominios activos y un dato en cada uno, cada título que el
  // prompt cita entre comillas abre una línea del mensaje de datos.
  const mensajeCompleto = (): string[] =>
    buildContext({
      studentName: "LUCIA INVENTADA PAREDES",
      careerName: "Ingenieria de Sistemas",
      currentLevel: 8,
      intents: ["delegates", "own_blocks", "schedule", "chat"],
      dateContext: { today: "2026-09-25" },
      scheduleData: { sessions: [], assessments: [] },
      delegatesData: [{ courseName: "CURSO INVENTADO", sectionCode: "801", delegate: null, subdelegate: null }],
      ownBlocks: { window: { from: "2026-09-21", to: "2026-10-04" }, blocks: [], weeks: [] },
      chatSearchResults: [{ sectionName: "CURSO INVENTADO (801)", messages: [{ body: "hola", date: "2026-09-24 10:00" }] }],
      question: "¿Quiénes son los delegados?",
    }).message.split("\n");

  for (const citado of [
    "DATOS DEL ALUMNO",
    "FIN DE LOS DATOS",
    "DELEGADOS DE TUS SECCIONES",
    "TUS BLOQUES DE HORARIO PROPIOS",
    "MENSAJES DEL CHAT DE LA SECCION",
  ]) {
    test(`«${citado}» está en el prompt y abre una línea del mensaje de datos`, () => {
      expect(plano(preamble())).toContain(`"${citado}`);
      expect(mensajeCompleto().filter((l) => l.startsWith(citado))).toHaveLength(1);
    });
  }
});
