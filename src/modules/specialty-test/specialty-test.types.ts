/**
 * Tipos del test de especialidad (RS-BE-37 a RS-BE-45).
 *
 * La primera mitad describe el archivo de contenido tal como lo escribe
 * `scripts/specialty-test/generar.py` (`content/<versión>.json`). Solo se
 * tipan los campos que el módulo lee; el resto del archivo (fuentes, balance,
 * pautas) viaja en el JSON y no se usa en tiempo de ejecución.
 *
 * La segunda mitad son las respuestas de las tres rutas, campo por campo como
 * las fija el contrato de la spec.
 */

/** Las cuatro claves estables, en el orden fijo de RS-BE-37. */
export const SPECIALTY_KEYS = ["sw", "ti", "si", "vj"] as const;
export type SpecialtyKey = (typeof SPECIALTY_KEYS)[number];

export const DUEL_ANSWERS = ["top", "bottom", "both", "none"] as const;
export type DuelAnswer = (typeof DUEL_ANSWERS)[number];

export const SCALE_ANSWERS = ["nada", "un_poco", "bastante", "me_encantaria"] as const;
export type ScaleAnswer = (typeof SCALE_ANSWERS)[number];

export type Answer = DuelAnswer | ScaleAnswer;

/** `{ lucide, flutter }`: el nombre de Lucide y la constante de `LucideIcons`. */
export interface ContentIcon {
  lucide: string;
  flutter: string;
}

export interface ContentElective {
  code: string;
  name: string;
  shortName: string;
  credits: number;
  prerequisite: string;
  sharedWith: SpecialtyKey[];
}

export interface ContentSpecialty {
  key: SpecialtyKey;
  name: string;
  diplomaName: string;
  color: { light: string; dark: string };
  icon: ContentIcon;
  tagline: string;
  totalCredits: number;
  electives: ContentElective[];
}

export interface ContentTask {
  specialty: SpecialtyKey;
  text: string;
  summary: string;
  illustration: string;
  icon: ContentIcon;
  /** Códigos de electivo; el primero es el que nombra `{electivos}`. */
  electives: string[];
  wordCount: number;
}

export interface DuelQuestion {
  n: number;
  id: string;
  type: "duel";
  block: number;
  prompt: string;
  pair: [SpecialtyKey, SpecialtyKey];
  top: ContentTask;
  bottom: ContentTask;
  reaction: string;
}

export interface ScaleQuestion {
  n: number;
  id: string;
  type: "scale";
  block: number;
  prompt: string;
  specialty: SpecialtyKey;
  task: ContentTask;
  blockClose: string;
}

export type ContentQuestion = DuelQuestion | ScaleQuestion;

export interface Tiebreaker {
  id: string;
  pair: [SpecialtyKey, SpecialtyKey];
  order: 1 | 2;
  prompt: string;
  top: ContentTask;
  bottom: ContentTask;
}

export interface ReasonTemplate {
  id: string;
  when: string;
  text: string;
}

export interface ContentExample {
  id: string;
  title: string;
  answers: Record<string, Answer>;
  tiebreakAnswers: DuelAnswer[];
  result: {
    ranking: SpecialtyKey[];
    affinity: Record<SpecialtyKey, string>;
    display: Record<SpecialtyKey, number>;
    tie: boolean;
  };
  reasonTemplatesUsed: string[];
  reasonText: string;
}

export interface SpecialtyTestContent {
  version: string;
  meta: {
    duelOptions: Array<{ id: DuelAnswer; label: string }>;
  };
  specialties: ContentSpecialty[];
  questions: ContentQuestion[];
  tiebreakers: Tiebreaker[];
  weights: {
    duel: { pick: number; both: number; none: number; duelsPerSpecialty: number };
    scale: { options: Array<{ id: ScaleAnswer; label: string; value: number }>; max: number };
    affinity: { duelsWeight: number; scaleWeight: number };
    tiebreak: { threshold: number; maxDuels: number };
    examples: ContentExample[];
  };
  reasonTemplates: {
    main: ReasonTemplate[];
    tiebreak: ReasonTemplate[];
    second: ReasonTemplate[];
    electives: ReasonTemplate[];
    tie: ReasonTemplate[];
  };
  ulisesLines: {
    welcome: string[];
    startButton: string;
    duelHelp: string;
    scaleHelp: string;
    reactions: { pick: string[]; both: string[]; none: string[]; scale: string[] };
    result: {
      loading: string;
      intro: string;
      winner: string;
      second: string;
      tie: string;
      low: string;
      closing: string;
      retake: string;
    };
    tiebreak: { first: string; second: string; resolved: string; stillTied: string };
  };
}

/** Las versiones que el servidor acepta y la vigente (RS-BE-37). */
export interface ContentRegistry {
  currentVersion: string;
  byVersion: ReadonlyMap<string, SpecialtyTestContent>;
}

/** Clave → id de `specialty` de la carrera del alumno (RS-BE-38). */
export type SpecialtyIds = Record<SpecialtyKey, number>;

// ── Respuestas de las rutas ────────────────────────────────────────────────

/** Una tarea tal como la recibe la app: sin resumen, sin electivos, con el ícono como cadena. */
export interface PublicTask {
  id: string;
  specialty: SpecialtyKey;
  text: string;
  illustration: string;
  icon: string;
}

export type PublicQuestion =
  | {
      id: string;
      n: number;
      type: "duel";
      prompt: string;
      top: PublicTask;
      bottom: PublicTask;
      reaction: string;
    }
  | {
      id: string;
      n: number;
      type: "scale";
      prompt: string;
      task: PublicTask;
      blockClose: string;
    };

export interface PublicContent {
  version: string;
  specialties: Array<{
    key: SpecialtyKey;
    specialtyId: number;
    name: string;
    tagline: string;
    color: { light: string; dark: string };
    icon: string;
    totalCredits: number;
    electives: Array<{
      code: string;
      name: string;
      shortName: string;
      credits: number;
      prerequisite: string;
    }>;
  }>;
  ulises: {
    welcome: string[];
    startButton: string;
    duelHelp: string;
    scaleHelp: string;
    reactions: { pick: string[]; both: string[]; none: string[]; scale: string[] };
    loading: string;
  };
  duelOptions: Array<{ id: DuelAnswer; label: string }>;
  scaleOptions: Array<{ id: ScaleAnswer; label: string }>;
  questions: PublicQuestion[];
}

export interface PublicTiebreak {
  id: string;
  order: 1 | 2;
  prompt: string;
  top: PublicTask;
  bottom: PublicTask;
}

export interface RankingEntry {
  key: SpecialtyKey;
  specialtyId: number;
  name: string;
  affinity: number;
}

export interface ResultUlises {
  intro: string;
  headline: string;
  tiebreakOutcome: string | null;
  closing: string;
  retake: string;
}

export type ReasonSource = "ai" | "templates";

export type EvaluateResponse =
  | { status: "tiebreak"; tiebreak: PublicTiebreak; ulisesLine: string }
  | {
      status: "result";
      result: {
        version: string;
        completedAt: string;
        tie: boolean;
        ranking: RankingEntry[];
        reason: string;
        reasonSource: ReasonSource;
        ulises: ResultUlises;
      };
    };

export interface StoredResultResponse {
  result: {
    version: string;
    isCurrentVersion: boolean;
    completedAt: string;
    tie: boolean;
    ranking: RankingEntry[];
  } | null;
}

// ── Guardado (RS-BE-44) ─────────────────────────────────────────────────────

/** Un elemento de `student_specialty_test_result.ranking`. */
export interface StoredRankingEntry {
  key: SpecialtyKey;
  specialtyId: number;
  affinity: number;
}

export interface StoredResult {
  contentVersion: string;
  ranking: StoredRankingEntry[];
  isTie: boolean;
  /** ISO-8601 en UTC con milisegundos, armado en SQL. */
  completedAt: string;
}
