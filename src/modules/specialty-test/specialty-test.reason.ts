/**
 * RS-BE-43 · Motivo redactado por Cohere, con las plantillas como respaldo.
 *
 * Cohere no decide nada del resultado: recibe el ranking ya calculado y solo
 * textos del propio contenido, sin cifras y sin ningún dato del alumno. Si no
 * responde en 5 segundos, falla o devuelve un texto que no pasa la validación,
 * el resultado sale igual con el motivo de las plantillas (RS-BE-42) y un
 * `console.warn` con un código corto. Ningún fallo de Cohere llega a la app.
 *
 * REGISTRO. El único `console` de este archivo imprime el código corto. Nunca
 * el texto de Cohere, `error.message` (en un error HTTP trae el cuerpo de la
 * respuesta de Cohere), las respuestas ni el id del alumno.
 */
import type { Evaluation } from "./specialty-test.logic.js";
import {
  AFFINITY_50_S,
  nameOf,
  plain,
  scaleOf,
  tasksChosen,
  tiebreakTaskFor,
  type MainTemplateId,
} from "./specialty-test.templates.js";
import type {
  Answer,
  ReasonSource,
  SpecialtyKey,
  SpecialtyTestContent,
} from "./specialty-test.types.js";

/** Lo único que el módulo usa del cliente de Cohere (`cohere.client.ts:72-114`). */
export interface CohereChat {
  chatWithHistory(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: { preamble?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal },
  ): Promise<string>;
}

export const COHERE_TIMEOUT_MS = 5000;
export const COHERE_TEMPERATURE = 0.3;
export const COHERE_MAX_TOKENS = 200;
export const REASON_MIN_LENGTH = 60;
export const REASON_MAX_LENGTH = 500;

/** El mensaje `system`, tal cual lo fija la spec. */
export const REASON_PROMPT = `Eres Ulises, el cuervo que acompaña a los alumnos de Ingeniería de Sistemas de la Universidad de Lima en ULima++. El alumno acaba de terminar un test de especialidad y el sistema ya tiene calculado su resultado. Tu único trabajo es escribir el motivo que acompaña ese resultado.

REGLAS
1. Usa solo los datos que vienen entre DATOS DEL TEST y FIN DE LOS DATOS. No inventes tareas, cursos ni especialidades.
2. La especialidad recomendada es la del campo ganadoras. No recomiendes otra ni cambies el orden del ranking. Si empate es verdadero, presenta las dos ganadoras en pie de igualdad.
3. No escribas números, porcentajes ni puntajes. La pantalla ya los muestra.
4. Nombra cada especialidad con su nombre completo, tal como viene. Solo puedes nombrar las especialidades de la lista nombrables.
5. Menciona al menos una tarea de tareasElegidas o de tareasQueLeGustaronConOtra de la ganadora, con las palabras del resumen.
6. Usa comillas latinas solo para el nombre de un curso de la lista electivos o para la respuesta de la escala tal como viene. No uses otras comillas.
7. Escribe en español, con trato de tú y lenguaje neutro en género, en un solo párrafo de dos a cuatro oraciones y de menos de 450 caracteres.
8. No uses dos puntos, guiones largos, listas, emojis ni formato Markdown.
9. No felicites la elección ni prometas nada sobre el futuro laboral. El resultado es una brújula, no una sentencia.
10. Responde solo con el texto del motivo, sin saludo ni despedida.`;

/** `lectura`: la plantilla `main` elegida, dicha como una frase fija. */
export const READINGS: Record<MainTemplateId | "tie", string> = {
  low: "Ninguna especialidad llama con fuerza al alumno y la ganadora va adelante sin mucha distancia.",
  noMainPoints: "La ganadora no suma en los duelos de las preguntas y sube por la escala y los desempates.",
  strong: "Los duelos y la escala apuntan con fuerza a la ganadora.",
  duelsOverScale:
    "La ganadora suma bien en los duelos, pero en la escala el alumno muestra poco entusiasmo.",
  scaleOverDuels: "La respuesta de la escala pesa más que los duelos.",
  general: "La ganadora suma en los duelos y en la escala sin un patrón marcado.",
  tie: "Las dos primeras quedan empatadas.",
};

export interface ReasonData {
  empate: boolean;
  ganadoras: string[];
  ranking: string[];
  nombrables: string[];
  lectura: string;
  detalle: Array<{
    especialidad: string;
    tareasElegidas: string[];
    tareasQueLeGustaronConOtra: string[];
    escala: { tarea: string; respuesta: string };
  }>;
  desempate: { rival: string; tareaElegida: string | null } | null;
  electivos: string[];
}

const sinRepetir = (lista: string[]): string[] => [...new Set(lista)];

/**
 * Los datos que le llegan a Cohere: textos del contenido y el resultado del
 * cálculo, sin afinidades ni puntos. `main` es la plantilla `main` elegida por
 * `buildTemplateReason`, o null con empate.
 */
export const buildReasonData = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  ev: Evaluation,
  main: MainTemplateId | null,
): ReasonData => {
  const [primera, segunda] = [ev.ranking[0]!, ev.ranking[1]!];
  const ganadoras: SpecialtyKey[] = ev.tie ? [primera, segunda] : [primera];
  const enElPar = !ev.tie && ev.pair !== null && ev.pair.includes(primera);

  let nombrables: SpecialtyKey[];
  if (ev.tie) {
    nombrables = [primera, segunda];
  } else {
    nombrables = [primera];
    if (ev.scores[segunda].S >= AFFINITY_50_S) nombrables.push(segunda);
    if (enElPar) nombrables.push(ev.pair!.find((k) => k !== primera)!);
  }

  const desempate = enElPar
    ? {
        rival: nameOf(content, ev.pair!.find((k) => k !== primera)!),
        tareaElegida: tiebreakTaskFor(ev.shown, primera) || null,
      }
    : null;

  return {
    empate: ev.tie,
    ganadoras: ganadoras.map((k) => nameOf(content, k)),
    ranking: ev.ranking.map((k) => nameOf(content, k)),
    nombrables: sinRepetir(nombrables.map((k) => nameOf(content, k))),
    lectura: READINGS[ev.tie || main === null ? "tie" : main],
    detalle: ganadoras.map((k) => {
      const elegidas = tasksChosen(content, answers, k);
      const escala = scaleOf(content, answers, k);
      return {
        especialidad: nameOf(content, k),
        tareasElegidas: elegidas.alone.map((t) => t.summary),
        tareasQueLeGustaronConOtra: elegidas.both.map((t) => t.summary),
        escala: { tarea: escala.task.summary, respuesta: escala.label },
      };
    }),
    desempate,
    electivos: sinRepetir(
      ganadoras.flatMap(
        (k) => content.specialties.find((s) => s.key === k)!.electives.map((e) => e.shortName),
      ),
    ),
  };
};

/** El mensaje `user`, exactamente como lo fija la spec. */
export const buildReasonMessage = (data: ReasonData): string =>
  `DATOS DEL TEST\n${JSON.stringify(data, null, 2)}\nFIN DE LOS DATOS\nEscribe el motivo.`;

// ── Validación de la salida ────────────────────────────────────────────────

const PARES_DE_COMILLAS: ReadonlyArray<[string, string]> = [
  ['"', '"'],
  ["“", "”"],
  ["'", "'"],
  ["‘", "’"],
  ["«", "»"],
];

/**
 * Recorta los espacios del borde, junta los espacios repetidos (sin tocar los
 * saltos de línea, que mira la regla `largo`) y quita un par de comillas que
 * envuelva todo el texto, solo si no hay otra comilla de ese par adentro.
 */
export const normalizeReason = (bruto: string): string => {
  let texto = bruto.trim().replace(/[ \t]+/g, " ");
  for (const [abre, cierra] of PARES_DE_COMILLAS) {
    const adentro = texto.slice(1, -1);
    if (
      texto.length >= 2 &&
      texto.startsWith(abre) &&
      texto.endsWith(cierra) &&
      !adentro.includes(abre) &&
      !adentro.includes(cierra)
    ) {
      texto = adentro.trim();
      break;
    }
  }
  return texto;
};

const SIGNOS_PROHIBIDOS = [":", "—", "–", "*", "#", "`", "http", "@"];
const EMOJI = /\p{Extended_Pictographic}/u;

export type ReasonRule =
  | "largo"
  | "cifras"
  | "formato"
  | "ganadora"
  | "otras"
  | "comillas"
  | "resto";

/**
 * Las siete reglas de RS-BE-43, en orden. Devuelve la primera que falla, o
 * null si el texto (ya normalizado) las cumple todas.
 */
export const firstBrokenRule = (
  texto: string,
  data: ReasonData,
  todas: readonly string[],
): ReasonRule | null => {
  if (texto.length < REASON_MIN_LENGTH || texto.length > REASON_MAX_LENGTH || /[\r\n]/.test(texto)) {
    return "largo";
  }
  if (/[0-9%]/.test(texto)) return "cifras";
  if (SIGNOS_PROHIBIDOS.some((s) => texto.includes(s)) || EMOJI.test(texto)) return "formato";

  const llano = plain(texto);
  if (!data.ganadoras.every((g) => llano.includes(plain(g)))) return "ganadora";

  const fueraDeComillas = plain(texto.replace(/«[^«»]*»/g, " "));
  const noNombrables = todas.filter((n) => !data.nombrables.includes(n));
  if (noNombrables.some((n) => fueraDeComillas.includes(plain(n)))) return "otras";

  const permitidas = new Set([...data.electivos, ...data.detalle.map((d) => d.escala.respuesta)]);
  const citas = [...texto.matchAll(/«([^«»]*)»/g)].map((m) => m[1]!.trim());
  const abiertas = (texto.match(/«/g) ?? []).length;
  const cerradas = (texto.match(/»/g) ?? []).length;
  if (abiertas !== citas.length || cerradas !== citas.length || citas.some((c) => !permitidas.has(c))) {
    return "comillas";
  }

  if (texto.includes("DATOS DEL TEST") || texto.includes("FIN DE LOS DATOS")) return "resto";
  return null;
};

// ── La llamada ─────────────────────────────────────────────────────────────

export interface WrittenReason {
  reason: string;
  reasonSource: ReasonSource;
}

const conPlantillas = (motivo: string, codigo: string): WrittenReason => {
  console.warn(`[specialty-test] motivo con plantillas: ${codigo}`);
  return { reason: motivo, reasonSource: "templates" };
};

const esErrorHttp = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith("Cohere Chat error");

/**
 * Pide el motivo a Cohere y lo valida. `respaldo` es el motivo de las
 * plantillas, que sale si algo falla. `todas` son los nombres de las cuatro
 * especialidades del contenido, para la regla `otras`. `timeoutMs` existe solo
 * para las pruebas; el servicio usa siempre `COHERE_TIMEOUT_MS`.
 */
export const writeReason = async (
  cohere: CohereChat,
  data: ReasonData,
  respaldo: string,
  todas: readonly string[],
  timeoutMs: number = COHERE_TIMEOUT_MS,
): Promise<WrittenReason> => {
  const controller = new AbortController();
  // La carrera contra la señal garantiza el corte aunque el cliente no la
  // respete; `fetch` sí la respeta y además cancela la petición.
  const abortado = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("abort")), { once: true });
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let bruto: string;
  try {
    bruto = await Promise.race([
      cohere.chatWithHistory([{ role: "user", content: buildReasonMessage(data) }], {
        preamble: REASON_PROMPT,
        temperature: COHERE_TEMPERATURE,
        maxTokens: COHERE_MAX_TOKENS,
        signal: controller.signal,
      }),
      abortado,
    ]);
  } catch (error) {
    if (controller.signal.aborted) return conPlantillas(respaldo, "timeout");
    return conPlantillas(respaldo, esErrorHttp(error) ? "http" : "error");
  } finally {
    clearTimeout(timer);
  }

  const texto = normalizeReason(typeof bruto === "string" ? bruto : "");
  if (texto === "") return conPlantillas(respaldo, "empty");
  const rota = firstBrokenRule(texto, data, todas);
  if (rota) return conPlantillas(respaldo, `invalid:${rota}`);
  return { reason: texto, reasonSource: "ai" };
};
