import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import { evaluateAnswers, type Evaluation } from "../../src/modules/specialty-test/specialty-test.logic.js";
import { buildTemplateReason } from "../../src/modules/specialty-test/specialty-test.templates.js";
import {
  COHERE_MAX_TOKENS,
  COHERE_TEMPERATURE,
  COHERE_TIMEOUT_MS,
  REASON_PROMPT,
  buildReasonData,
  buildReasonMessage,
  firstBrokenRule,
  normalizeReason,
  writeReason,
  type CohereChat,
  type ReasonData,
} from "../../src/modules/specialty-test/specialty-test.reason.js";
import type { Answer, DuelAnswer } from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-43: el motivo de Cohere, su validación y el respaldo de plantillas.
 *
 * Ninguna prueba llama a Cohere: todas inyectan un cliente falso. Los datos
 * del alumno de prueba son INVENTADOS (el repo es público): código 20230001,
 * Garcia Lopez, Maria, `student.id` 42. Se espía `console` para fijar que
 * ningún registro lleva el texto de Cohere, `error.message`, las respuestas ni
 * el id del alumno.
 */

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const TODAS = c.specialties.map((s) => s.name);
const ALUMNO = { id: 42, codigo: "20230001", nombre: "Garcia Lopez, Maria" };

const resolver = (answers: Readonly<Record<string, Answer>>, respuestas: readonly DuelAnswer[]): Evaluation => {
  const recibidos: Array<{ id: string; answer: DuelAnswer }> = [];
  let paso = evaluateAnswers(c, answers, recibidos);
  while (paso.kind === "tiebreak") {
    recibidos.push({ id: paso.tiebreaker.id, answer: respuestas[recibidos.length]! });
    paso = evaluateAnswers(c, answers, recibidos);
  }
  if (paso.kind !== "result") throw new Error("se esperaba un resultado");
  return paso.evaluation;
};

const datosDe = (id: string): { data: ReasonData; respaldo: string } => {
  const e = c.weights.examples.find((x) => x.id === id)!;
  const ev = resolver(e.answers, e.tiebreakAnswers);
  const plantillas = buildTemplateReason(c, e.answers, ev);
  return { data: buildReasonData(c, e.answers, ev, plantillas.main), respaldo: plantillas.text };
};

const { data: DATOS, respaldo: RESPALDO } = datosDe("ejemplo-2");

/** Un motivo que cumple las siete reglas para el ejemplo-2. */
const VALIDO =
  "Desarrollo de Videojuegos va contigo porque elegiste diseñar niveles que se ponen difíciles poco a poco. " +
  "Con Sistemas de Información estuvo parejo, y en el desempate te quedaste con escribir finales distintos. " +
  "Mira cursos como «Storytelling» y «Proyecto de Videojuegos».";

/** Cliente falso que anota cada llamada y responde lo que se le pida. */
const cliente = (responder: (signal?: AbortSignal) => Promise<string>) => {
  const llamadas: Array<{ messages: unknown; options: Record<string, unknown> | undefined }> = [];
  const chat: CohereChat = {
    chatWithHistory: async (messages, options) => {
      llamadas.push({ messages, options: options as Record<string, unknown> | undefined });
      return responder(options?.signal);
    },
  };
  return { chat, llamadas };
};

let avisos: ReturnType<typeof spyOn>;
let errores: ReturnType<typeof spyOn>;
let logs: ReturnType<typeof spyOn>;

beforeEach(() => {
  avisos = spyOn(console, "warn").mockImplementation(() => {});
  errores = spyOn(console, "error").mockImplementation(() => {});
  logs = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  avisos.mockRestore();
  errores.mockRestore();
  logs.mockRestore();
});

/** Todo lo que el módulo escribió en consola, en una sola cadena. */
const registrado = (): string =>
  [avisos, errores, logs].flatMap((s) => s.mock.calls.map((args: unknown[]) => args.map(String).join(" "))).join("\n");

describe("datos y mensaje para Cohere (RS-BE-43)", () => {
  test("el ejemplo-2 produce exactamente el JSON de la spec", () => {
    expect(DATOS).toEqual({
      empate: false,
      ganadoras: ["Desarrollo de Videojuegos"],
      ranking: [
        "Desarrollo de Videojuegos", "Sistemas de Información",
        "Tecnologías de la Información", "Ingeniería de Software",
      ],
      nombrables: ["Desarrollo de Videojuegos", "Sistemas de Información"],
      lectura: "La ganadora suma en los duelos y en la escala sin un patrón marcado.",
      detalle: [{
        especialidad: "Desarrollo de Videojuegos",
        tareasElegidas: [
          "diseñar niveles que se ponen difíciles poco a poco",
          "programar cómo salta un personaje de juego",
          "escribir la historia y los diálogos de un juego",
        ],
        tareasQueLeGustaronConOtra: ["observar a jugadores probando un juego"],
        escala: { tarea: "programar un juego sencillo para celular", respuesta: "Bastante" },
      }],
      desempate: {
        rival: "Sistemas de Información",
        tareaElegida: "escribir finales distintos según lo que decide el jugador",
      },
      electivos: [
        "Storytelling", "Diseño de Videojuegos", "Narrativa Gráfica", "Programación Móvil",
        "Proyecto de Desarrollo de Software", "Proyecto de Videojuegos", "Interacción Humano Computadora",
      ],
    });
  });

  test("el mensaje user es DATOS DEL TEST, el JSON, FIN DE LOS DATOS y Escribe el motivo.", () => {
    const mensaje = buildReasonMessage(DATOS);
    const lineas = mensaje.split("\n");
    expect(lineas[0]).toBe("DATOS DEL TEST");
    expect(lineas.at(-2)).toBe("FIN DE LOS DATOS");
    expect(lineas.at(-1)).toBe("Escribe el motivo.");
    expect(JSON.parse(lineas.slice(1, -2).join("\n"))).toEqual(DATOS);
  });

  test("el mensaje no lleva cifras ni datos del alumno", () => {
    const mensaje = buildReasonMessage(DATOS);
    expect(mensaje).not.toMatch(/[0-9%]/);
    expect(mensaje).not.toContain(ALUMNO.codigo);
    expect(mensaje).not.toContain("Garcia");
    expect(mensaje).not.toContain("Maria");
  });

  test("con empate: desempate en null y solo las dos ganadoras como nombrables", () => {
    const { data } = datosDe("ejemplo-8");
    expect(data.empate).toBe(true);
    expect(data.desempate).toBeNull();
    expect(data.ganadoras).toEqual(["Ingeniería de Software", "Tecnologías de la Información"]);
    expect(data.nombrables).toEqual(data.ganadoras);
    expect(data.detalle).toHaveLength(2);
    expect(data.lectura).toBe("Las dos primeras quedan empatadas.");
  });

  test("sin la ganadora en el par, desempate va en null", () => {
    // ejemplo-7 gana si y el par es sw-si: está en el par. ejemplo-1 no tuvo desempate.
    expect(datosDe("ejemplo-1").data.desempate).toBeNull();
    expect(datosDe("ejemplo-7").data.desempate).toEqual({
      rival: "Ingeniería de Software",
      tareaElegida: "unir en una base de datos las ventas de todas las sedes",
    });
    expect(datosDe("ejemplo-4").data.desempate).toEqual({
      rival: "Ingeniería de Software",
      tareaElegida: null,
    });
  });
});

describe("validacion de la salida (RS-BE-43)", () => {
  const rota = (texto: string) => firstBrokenRule(normalizeReason(texto), DATOS, TODAS);

  test("el motivo valido pasa las siete reglas", () => {
    expect(rota(VALIDO)).toBeNull();
  });

  test("recorta, junta espacios y quita un par de comillas que envuelve todo", () => {
    expect(normalizeReason(`  "${VALIDO}"  `)).toBe(VALIDO);
    expect(normalizeReason(`“${VALIDO}”`)).toBe(VALIDO);
    expect(normalizeReason(VALIDO.replace(" va ", "   va  "))).toBe(VALIDO);
  });

  test("largo: menos de 60, mas de 500 o con salto de linea", () => {
    expect(rota("Desarrollo de Videojuegos va contigo.")).toBe("largo");
    expect(rota(`${VALIDO} ${"Sigue mirando cursos con calma y sin apuro. ".repeat(10)}`)).toBe("largo");
    expect(rota(VALIDO.replace(". Con", ".\nCon"))).toBe("largo");
  });

  test("cifras: un digito o un signo de porcentaje", () => {
    expect(rota(VALIDO.replace("poco a poco", "con 75 de afinidad"))).toBe("cifras");
    expect(rota(VALIDO.replace("poco a poco", "con mucho %"))).toBe("cifras");
  });

  test("formato: dos puntos, guiones largos, markdown, enlaces, arrobas y emojis", () => {
    for (const intruso of [":", "—", "–", "*", "#", "`", "http", "@", "🎮"]) {
      expect(rota(VALIDO.replace("va contigo", `va contigo ${intruso}`))).toBe("formato");
    }
  });

  test("ganadora: tiene que nombrar a la ganadora completa, sin importar tildes ni mayusculas", () => {
    expect(rota(VALIDO.replace("Desarrollo de Videojuegos", "Videojuegos"))).toBe("ganadora");
    expect(rota(VALIDO.replace("Desarrollo de Videojuegos", "desarrollo de videojuegos"))).toBeNull();
  });

  test("otras: no nombra fuera de comillas una especialidad que no es nombrable", () => {
    expect(rota(VALIDO.replace("Con Sistemas de Información", "Con Ingeniería de Software"))).toBe("otras");
    expect(rota(VALIDO.replace("Con Sistemas de Información", "Con ingenieria de software"))).toBe("otras");
  });

  test("comillas: solo electivos de la lista o la respuesta de escala", () => {
    expect(rota(VALIDO.replace("«Storytelling»", "«Cálculo I»"))).toBe("comillas");
    expect(rota(VALIDO.replace("«Storytelling»", "«Bastante»"))).toBeNull();
    expect(rota(VALIDO.replace("«Storytelling»", "«Storytelling"))).toBe("comillas");
  });

  test("resto: no trae las marcas de los datos", () => {
    expect(rota(VALIDO.replace("Mira cursos", "FIN DE LOS DATOS mira cursos"))).toBe("resto");
    expect(rota(VALIDO.replace("Mira cursos", "DATOS DEL TEST mira cursos"))).toBe("resto");
  });
});

describe("la llamada y el respaldo (RS-BE-43)", () => {
  test("los parametros son los de la spec y el texto aceptado sale como ai", async () => {
    const { chat, llamadas } = cliente(async () => ` ${VALIDO} `);
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS)).toEqual({ reason: VALIDO, reasonSource: "ai" });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.messages).toEqual([{ role: "user", content: buildReasonMessage(DATOS) }]);
    expect(llamadas[0]!.options).toMatchObject({ preamble: REASON_PROMPT, temperature: 0.3, maxTokens: 200 });
    expect(llamadas[0]!.options!.signal).toBeInstanceOf(AbortSignal);
    expect([COHERE_TIMEOUT_MS, COHERE_TEMPERATURE, COHERE_MAX_TOKENS]).toEqual([5000, 0.3, 200]);
    expect(avisos).not.toHaveBeenCalled();
  });

  test("el prompt es el de la spec, con sus diez reglas", () => {
    expect(REASON_PROMPT.startsWith("Eres Ulises, el cuervo que acompaña")).toBe(true);
    expect(REASON_PROMPT).toContain("\n\nREGLAS\n1. Usa solo los datos");
    expect(REASON_PROMPT.endsWith("10. Responde solo con el texto del motivo, sin saludo ni despedida.")).toBe(true);
  });

  test("tiempo agotado: corta con la senal y sale el motivo de plantillas con timeout", async () => {
    const { chat } = cliente(
      (signal) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("AbortError")))),
    );
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS, 20)).toEqual({ reason: RESPALDO, reasonSource: "templates" });
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: timeout");
  });

  test("tiempo agotado aunque el cliente ignore la senal", async () => {
    const { chat } = cliente(() => new Promise(() => {}));
    expect((await writeReason(chat, DATOS, RESPALDO, TODAS, 20)).reasonSource).toBe("templates");
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: timeout");
  });

  test("error HTTP: codigo http y el cuerpo de Cohere no se registra", async () => {
    const { chat } = cliente(async () => {
      throw new Error('Cohere Chat error 429: {"message":"cuerpo-secreto-de-cohere"}');
    });
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS)).toEqual({ reason: RESPALDO, reasonSource: "templates" });
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: http");
    expect(registrado()).not.toContain("cuerpo-secreto-de-cohere");
  });

  test("error de red o cuerpo que no es JSON: codigo error", async () => {
    for (const falla of [new TypeError("fetch failed"), new SyntaxError("Unexpected token < in JSON")]) {
      const { chat } = cliente(async () => {
        throw falla;
      });
      expect((await writeReason(chat, DATOS, RESPALDO, TODAS)).reasonSource).toBe("templates");
    }
    expect(avisos.mock.calls).toEqual([
      ["[specialty-test] motivo con plantillas: error"],
      ["[specialty-test] motivo con plantillas: error"],
    ]);
    expect(registrado()).not.toContain("fetch failed");
    expect(registrado()).not.toContain("Unexpected token");
  });

  test("texto vacio: codigo empty", async () => {
    const { chat } = cliente(async () => "   ");
    expect((await writeReason(chat, DATOS, RESPALDO, TODAS)).reasonSource).toBe("templates");
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: empty");
  });

  test("texto invalido: codigo invalid con la regla, y el texto de Cohere no se registra", async () => {
    const malo = VALIDO.replace("poco a poco", "con 75 % de afinidad");
    const { chat } = cliente(async () => malo);
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS)).toEqual({ reason: RESPALDO, reasonSource: "templates" });
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: invalid:cifras");
    expect(registrado()).not.toContain("afinidad");
  });

  test("ningun registro lleva respuestas ni el id o el codigo del alumno", async () => {
    const { chat } = cliente(async () => {
      throw new Error(`Cohere Chat error 500: ${ALUMNO.codigo} ${ALUMNO.id} bottom me_encantaria`);
    });
    await writeReason(chat, DATOS, RESPALDO, TODAS);
    const texto = registrado();
    for (const prohibido of [ALUMNO.codigo, String(ALUMNO.id), "bottom", "me_encantaria", "Garcia"]) {
      expect(texto).not.toContain(prohibido);
    }
  });
});
