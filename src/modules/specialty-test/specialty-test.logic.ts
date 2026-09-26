/**
 * RS-BE-40 y RS-BE-41 · El cálculo del test, en funciones puras.
 *
 * Nada de este archivo toca la base ni la red. Recibe el contenido de una
 * versión y las respuestas, y devuelve el paso siguiente: un desempate, un
 * desempate que no corresponde o el resultado con su ranking. El motivo de las
 * plantillas y las líneas de Ulises (RS-BE-42) viven en
 * `specialty-test.templates.ts`.
 *
 * ARITMÉTICA EXACTA. Ninguna comparación usa coma flotante. Para cada
 * especialidad se cuentan `h` (medios puntos de duelo), `n` (duelos mostrados,
 * 5, 6 o 7) y `e` (valor de su escala, 0 a 3), y se trabaja con
 *   S = 210 · A = (7350 / n) · h + 2100 · e
 *   U = 210 · D = (10500 / n) · h
 * que son enteros porque 5, 6 y 7 dividen a 7350 y a 10500. «La misma
 * afinidad exacta» es `S` igual, y el redondeo que ve la app es
 * `floor((S + 105) / 210)`.
 */
import type {
  Answer,
  ContentTask,
  DuelAnswer,
  ScaleAnswer,
  SpecialtyKey,
  SpecialtyTestContent,
  Tiebreaker,
} from "./specialty-test.types.js";
import { SPECIALTY_KEYS } from "./specialty-test.types.js";

// ── Constantes que el contenido tiene que repetir (RS-BE-37) ────────────────
//
// `specialty-test-content.test.ts` compara cada una con el JSON de cada
// versión del registro. Un cambio de peso en el archivo sin su cambio aquí
// hace fallar la prueba en vez de quedar ignorado en silencio.

/** Medios puntos por respuesta de duelo: elegir da 2, «las dos» da 1 a cada una. */
export const HALF_POINTS = { pick: 2, both: 1, none: 0 } as const;
export const DUELS_PER_SPECIALTY = 5;
export const SCALE_VALUE: Record<ScaleAnswer, number> = {
  nada: 0,
  un_poco: 1,
  bastante: 2,
  me_encantaria: 3,
};
export const SCALE_MAX = 3;
/** A = 0,7 · D + 0,3 · E, en décimos para no escribir un flotante. */
export const DUELS_WEIGHT_TENTHS = 7;
export const SCALE_WEIGHT_TENTHS = 3;
/** Diferencia de afinidad que pide un desempate: 10, o sea 2100 en `S`. */
export const TIEBREAK_THRESHOLD = 10;
export const MAX_TIEBREAKS = 2;

/** Escala entera de las comparaciones: S = 210 · A y U = 210 · D. */
export const AFFINITY_SCALE = 210;
const ESCALA = AFFINITY_SCALE;
const UMBRAL_S = TIEBREAK_THRESHOLD * ESCALA; // 2100

// ── Conteo y afinidad (RS-BE-40) ────────────────────────────────────────────

/** Un desempate ya mostrado y su respuesta. */
export interface ShownTiebreak {
  tiebreaker: Tiebreaker;
  answer: DuelAnswer;
}

export interface Tally {
  h: Record<SpecialtyKey, number>;
  n: Record<SpecialtyKey, number>;
  e: Record<SpecialtyKey, number>;
}

export interface Score {
  /** 210 · A, entero. */
  S: number;
  /** 210 · D, entero. */
  U: number;
  e: number;
}

const porClave = <T>(valor: (clave: SpecialtyKey) => T): Record<SpecialtyKey, T> =>
  Object.fromEntries(SPECIALTY_KEYS.map((k) => [k, valor(k)])) as Record<SpecialtyKey, T>;

const sumarDuelo = (t: Tally, top: ContentTask, bottom: ContentTask, answer: DuelAnswer): void => {
  for (const [lado, tarea] of [["top", top], ["bottom", bottom]] as const) {
    const k = tarea.specialty;
    t.n[k] += 1;
    if (answer === lado) t.h[k] += HALF_POINTS.pick;
    else if (answer === "both") t.h[k] += HALF_POINTS.both;
  }
};

/** Cuenta h, n y e con las 14 respuestas y los desempates mostrados. */
export const tally = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  shown: readonly ShownTiebreak[],
): Tally => {
  const t: Tally = { h: porClave(() => 0), n: porClave(() => 0), e: porClave(() => 0) };
  for (const q of content.questions) {
    const respuesta = answers[q.id];
    if (q.type === "scale") t.e[q.task.specialty] = SCALE_VALUE[respuesta as ScaleAnswer];
    else sumarDuelo(t, q.top, q.bottom, respuesta as DuelAnswer);
  }
  for (const { tiebreaker, answer } of shown) {
    sumarDuelo(t, tiebreaker.top, tiebreaker.bottom, answer);
  }
  return t;
};

/** 7350 / n y 10500 / n, exigiendo que la división sea exacta (n ∈ {5, 6, 7}). */
const divisionExacta = (dividendo: number, n: number): number => {
  if (!Number.isInteger(n) || n <= 0 || dividendo % n !== 0) {
    throw new Error(`Número de duelos inesperado: ${n}`);
  }
  return dividendo / n;
};

export const scoreOf = (h: number, n: number, e: number): Score => ({
  S: divisionExacta(35 * ESCALA, n) * h + 10 * ESCALA * e,
  U: divisionExacta(50 * ESCALA, n) * h,
  e,
});

export const scores = (t: Tally): Record<SpecialtyKey, Score> =>
  porClave((k) => scoreOf(t.h[k], t.n[k], t.e[k]));

/** S descendente, U descendente, e descendente y el orden fijo sw, ti, si, vj. */
export const rankKeys = (s: Record<SpecialtyKey, Score>): SpecialtyKey[] =>
  [...SPECIALTY_KEYS].sort(
    (a, b) =>
      s[b].S - s[a].S ||
      s[b].U - s[a].U ||
      s[b].e - s[a].e ||
      SPECIALTY_KEYS.indexOf(a) - SPECIALTY_KEYS.indexOf(b),
  );

/** Entero de 0 a 100 con el medio hacia arriba: 17,5 → 18. */
export const roundAffinity = (S: number): number => Math.floor((S + ESCALA / 2) / ESCALA);

/** Las dos claves de un par en el orden fijo, que es como se nombran los desempates. */
export const pairOf = (a: SpecialtyKey, b: SpecialtyKey): [SpecialtyKey, SpecialtyKey] =>
  SPECIALTY_KEYS.indexOf(a) <= SPECIALTY_KEYS.indexOf(b) ? [a, b] : [b, a];

// ── Desempates (RS-BE-41) ───────────────────────────────────────────────────

export interface Evaluation {
  tally: Tally;
  scores: Record<SpecialtyKey, Score>;
  /** Las cuatro, en el orden final. */
  ranking: SpecialtyKey[];
  /** Las dos primeras con la misma `S`. */
  tie: boolean;
  shown: ShownTiebreak[];
  /** El par del desempate, o null si no se mostró ninguno. */
  pair: [SpecialtyKey, SpecialtyKey] | null;
}

export type Step =
  | { kind: "tiebreak"; tiebreaker: Tiebreaker; line: "first" | "second" }
  | { kind: "mismatch"; expected: string | null }
  | { kind: "result"; evaluation: Evaluation };

const buscarDesempate = (
  content: SpecialtyTestContent,
  par: [SpecialtyKey, SpecialtyKey],
  orden: number,
): Tiebreaker => {
  const encontrado = content.tiebreakers.find(
    (t) => t.pair[0] === par[0] && t.pair[1] === par[1] && t.order === orden,
  );
  if (!encontrado) throw new Error(`Falta el desempate ${par.join("-")}-${orden}`);
  return encontrado;
};

/**
 * Repite el cálculo con las 14 respuestas y, paso a paso, con los desempates
 * recibidos. Cada desempate recibido tiene que ser justo el que toca en su
 * paso; si llega otro, o uno de más, el paso es `mismatch` con el id que tocaba
 * (o null si ya no tocaba ninguno). Supone respuestas ya validadas contra la
 * versión (RS-BE-39, paso 5).
 */
export const evaluateAnswers = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  received: ReadonlyArray<{ id: string; answer: DuelAnswer }>,
): Step => {
  const inicial = rankKeys(scores(tally(content, answers, [])));
  const primera = inicial[0]!;
  const segunda = inicial[1]!;
  const par = pairOf(primera, segunda);
  const shown: ShownTiebreak[] = [];

  for (let orden = 1; orden <= MAX_TIEBREAKS; orden++) {
    const s = scores(tally(content, answers, shown));
    if (Math.abs(s[primera].S - s[segunda].S) > UMBRAL_S) break;
    const tiebreaker = buscarDesempate(content, par, orden);
    const recibido = received[orden - 1];
    if (!recibido) {
      return { kind: "tiebreak", tiebreaker, line: orden === 1 ? "first" : "second" };
    }
    if (recibido.id !== tiebreaker.id) return { kind: "mismatch", expected: tiebreaker.id };
    shown.push({ tiebreaker, answer: recibido.answer });
  }

  if (received.length > shown.length) return { kind: "mismatch", expected: null };

  const t = tally(content, answers, shown);
  const s = scores(t);
  const ranking = rankKeys(s);
  return {
    kind: "result",
    evaluation: {
      tally: t,
      scores: s,
      ranking,
      tie: s[ranking[0]!].S === s[ranking[1]!].S,
      shown,
      pair: shown.length > 0 ? par : null,
    },
  };
};
