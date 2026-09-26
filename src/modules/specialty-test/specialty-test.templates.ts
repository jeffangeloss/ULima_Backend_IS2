/**
 * RS-BE-42 · Motivo con plantillas y líneas de Ulises del resultado.
 *
 * Funciones puras sobre una `Evaluation` ya calculada por
 * `specialty-test.logic.ts`. Los textos salen del contenido de la versión
 * (`reasonTemplates` y `ulisesLines`); las condiciones de cada plantilla
 * están aquí, en aritmética exacta sobre `S` y `U`, y la prueba del contenido
 * exige que el campo `when` del archivo diga lo mismo que
 * `TEMPLATE_CONDITIONS`.
 */
import {
  AFFINITY_SCALE,
  roundAffinity,
  type Evaluation,
  type ShownTiebreak,
} from "./specialty-test.logic.js";
import type {
  Answer,
  ContentQuestion,
  ContentTask,
  DuelQuestion,
  ReasonTemplate,
  ResultUlises,
  ScaleAnswer,
  ScaleQuestion,
  SpecialtyKey,
  SpecialtyTestContent,
} from "./specialty-test.types.js";

/** 210 · 50: el corte `A < 50` de `low` y el `A2 ≥ 50` de `second`. */
export const AFFINITY_50_S = 50 * AFFINITY_SCALE;
const U_80 = 80 * AFFINITY_SCALE; // 16800, D ≥ 80
const U_60 = 60 * AFFINITY_SCALE; // 12600, D ≥ 60 y D < 60

/** Condición de cada plantilla, con el texto exacto de `reasonTemplates.*.when`. */
export const TEMPLATE_CONDITIONS = {
  low: "A < 50",
  noMainPoints: "tareas == ''",
  strong: "D >= 80 && e >= 2",
  duelsOverScale: "D >= 60 && e <= 1",
  scaleOverDuels: "e == 3 && D < 60",
  general: "true",
  tiebreakPicked: "huboDesempate && ganadoraEnElPar && tareaDesempate != ''",
  tiebreakNoPick: "huboDesempate && ganadoraEnElPar",
  second: "A2 >= 50",
  electives: "electivos != ''",
  tie: "empate",
} as const;

/** Orden en que se prueban las plantillas `main` (RS-BE-42). */
export const MAIN_ORDER = [
  "low",
  "noMainPoints",
  "strong",
  "duelsOverScale",
  "scaleOverDuels",
  "general",
] as const;
export const TIEBREAK_TEMPLATE_ORDER = ["tiebreakPicked", "tiebreakNoPick"] as const;

export type MainTemplateId = (typeof MAIN_ORDER)[number];

// ── Lo que el motivo y Cohere leen de las respuestas ───────────────────────

const duelos = (content: SpecialtyTestContent): DuelQuestion[] =>
  content.questions.filter((q): q is DuelQuestion => q.type === "duel");

const escalaDe = (content: SpecialtyTestContent, k: SpecialtyKey): ScaleQuestion => {
  const q = content.questions.find(
    (p: ContentQuestion): p is ScaleQuestion => p.type === "scale" && p.task.specialty === k,
  );
  if (!q) throw new Error(`Falta la escala de ${k}`);
  return q;
};

/**
 * Tareas de `k` en los 10 duelos de las preguntas: las que el alumno elige
 * sola, en orden de pregunta, y las de «Me gustan las dos», también en orden.
 */
export const tasksChosen = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  k: SpecialtyKey,
): { alone: ContentTask[]; both: ContentTask[] } => {
  const alone: ContentTask[] = [];
  const both: ContentTask[] = [];
  for (const q of duelos(content)) {
    const respuesta = answers[q.id];
    for (const lado of ["top", "bottom"] as const) {
      if (q[lado].specialty !== k) continue;
      if (respuesta === lado) alone.push(q[lado]);
      else if (respuesta === "both") both.push(q[lado]);
    }
  }
  return { alone, both };
};

export const scaleOf = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  k: SpecialtyKey,
): { task: ContentTask; label: string } => {
  const q = escalaDe(content, k);
  const respuesta = answers[q.id] as ScaleAnswer;
  const opcion = content.weights.scale.options.find((o) => o.id === respuesta);
  if (!opcion) throw new Error(`Respuesta de escala desconocida en ${q.id}`);
  return { task: q.task, label: opcion.label };
};

/** Resumen de la última tarea de desempate que el alumno elige sola y que es de `k`. */
export const tiebreakTaskFor = (shown: readonly ShownTiebreak[], k: SpecialtyKey): string => {
  let tarea = "";
  for (const { tiebreaker, answer } of shown) {
    if ((answer === "top" || answer === "bottom") && tiebreaker[answer].specialty === k) {
      tarea = tiebreaker[answer].summary;
    }
  }
  return tarea;
};

export const nameOf = (content: SpecialtyTestContent, k: SpecialtyKey): string => {
  const especialidad = content.specialties.find((s) => s.key === k);
  if (!especialidad) throw new Error(`Falta la especialidad ${k}`);
  return especialidad.name;
};

const nombreCortoDe = (content: SpecialtyTestContent, codigo: string): string => {
  for (const s of content.specialties) {
    const electivo = s.electives.find((e) => e.code === codigo);
    if (electivo) return electivo.shortName;
  }
  throw new Error(`Electivo desconocido: ${codigo}`);
};

/** Sin tildes ni mayúsculas, para comparar nombres (RS-BE-38 y RS-BE-43). */
export const plain = (texto: string): string =>
  texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** `h/2` con coma decimal: «4» o «3,5». */
export const formatPoints = (h: number): string =>
  h % 2 === 0 ? String(h / 2) : `${(h - 1) / 2},5`;

// ── Motivo con plantillas (RS-BE-42) ────────────────────────────────────────

const plantilla = (lista: readonly ReasonTemplate[], id: string): string => {
  const encontrada = lista.find((t) => t.id === id);
  if (!encontrada) throw new Error(`Falta la plantilla ${id}`);
  return encontrada.text;
};

/** Reemplaza `{variable}`; una llave que queda es un error de la implementación. */
export const fillTemplate = (texto: string, valores: Readonly<Record<string, string>>): string => {
  const lleno = texto.replace(/\{(\w+)\}/g, (marca, nombre: string) =>
    Object.hasOwn(valores, nombre) ? valores[nombre]! : marca,
  );
  if (lleno.includes("{") || lleno.includes("}")) {
    throw new Error("Plantilla con una variable sin reemplazar");
  }
  return lleno;
};

export interface TemplateReason {
  text: string;
  /** Ids de las plantillas usadas, en orden, como `reasonTemplatesUsed` de los ejemplos. */
  used: string[];
  /** La plantilla `main` elegida, o null con empate. Cohere la recibe como `lectura`. */
  main: MainTemplateId | null;
}

const elegirMain = (
  S: number,
  U: number,
  e: number,
  tareas: string,
): MainTemplateId => {
  if (S < AFFINITY_50_S) return "low";
  if (tareas === "") return "noMainPoints";
  if (U >= U_80 && e >= 2) return "strong";
  if (U >= U_60 && e <= 1) return "duelsOverScale";
  if (e === 3 && U < U_60) return "scaleOverDuels";
  return "general";
};

export const buildTemplateReason = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  ev: Evaluation,
): TemplateReason => {
  const plantillas = content.reasonTemplates;
  const [a, b] = [ev.ranking[0]!, ev.ranking[1]!];

  if (ev.tie) {
    const valores = {
      a: nameOf(content, a),
      b: nameOf(content, b),
      puntosA: formatPoints(ev.tally.h[a]),
      duelosA: String(ev.tally.n[a]),
      puntosB: formatPoints(ev.tally.h[b]),
      duelosB: String(ev.tally.n[b]),
    };
    return { text: fillTemplate(plantilla(plantillas.tie, "tie"), valores), used: ["tie"], main: null };
  }

  const ganadora = a;
  const { S, U, e } = ev.scores[ganadora];
  const elegidas = tasksChosen(content, answers, ganadora);
  const conTareas = [...elegidas.alone, ...elegidas.both].slice(0, 2);
  const tareas = conTareas.map((t) => t.summary).join(" y ");
  const electivos = [
    ...new Set(conTareas.map((t) => `«${nombreCortoDe(content, t.electives[0]!)}»`)),
  ].join(" y ");
  const escala = scaleOf(content, answers, ganadora);
  const enElPar = ev.pair !== null && ev.pair.includes(ganadora);
  const rival = enElPar ? ev.pair!.find((k) => k !== ganadora)! : null;
  const tareaDesempate = tiebreakTaskFor(ev.shown, ganadora);

  const valores: Record<string, string> = {
    nombre: nameOf(content, ganadora),
    afinidad: String(roundAffinity(S)),
    puntos: formatPoints(ev.tally.h[ganadora]),
    duelos: String(ev.tally.n[ganadora]),
    tareas,
    escalaTarea: escala.task.summary,
    escalaRespuesta: escala.label,
    rival: rival ? nameOf(content, rival) : "",
    tareaDesempate,
    segunda: nameOf(content, b),
    afinidadSegunda: String(roundAffinity(ev.scores[b].S)),
    electivos,
  };

  const main = elegirMain(S, U, e, tareas);
  const partes = [plantilla(plantillas.main, main)];
  const used: string[] = [main];

  if (ev.shown.length > 0 && enElPar) {
    const id = tareaDesempate !== "" ? "tiebreakPicked" : "tiebreakNoPick";
    partes.push(plantilla(plantillas.tiebreak, id));
    used.push(id);
  }
  if (ev.scores[b].S >= AFFINITY_50_S) {
    partes.push(plantilla(plantillas.second, "second"));
    used.push("second");
  }
  if (electivos !== "") {
    partes.push(plantilla(plantillas.electives, "electives"));
    used.push("electives");
  }

  return { text: fillTemplate(partes.join(" "), valores), used, main };
};

// ── Líneas de Ulises del resultado (RS-BE-42) ───────────────────────────────

export const buildResultUlises = (content: SpecialtyTestContent, ev: Evaluation): ResultUlises => {
  const lineas = content.ulisesLines;
  const ganadora = ev.ranking[0]!;
  const afinidad = String(roundAffinity(ev.scores[ganadora].S));

  let headline: string;
  if (ev.tie) {
    headline = fillTemplate(lineas.result.tie, {
      a: nameOf(content, ev.ranking[0]!),
      b: nameOf(content, ev.ranking[1]!),
      afinidad,
    });
  } else {
    const titular = ev.scores[ganadora].S < AFFINITY_50_S ? lineas.result.low : lineas.result.winner;
    headline = fillTemplate(titular, { nombre: nameOf(content, ganadora), afinidad });
  }

  let tiebreakOutcome: string | null = null;
  if (ev.shown.length > 0) tiebreakOutcome = ev.tie ? lineas.tiebreak.stillTied : lineas.tiebreak.resolved;

  return {
    intro: lineas.result.intro,
    headline,
    tiebreakOutcome,
    closing: lineas.result.closing,
    retake: lineas.result.retake,
  };
};
