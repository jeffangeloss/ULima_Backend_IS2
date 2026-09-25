import type { ChatbotIntent } from "./chatbot.types.js";

// BR-CB-04: la clasificación es solo por palabras clave, sin llamadas a Cohere.
// Las palabras se escriben ya normalizadas (minúsculas, sin tildes ni eñes) y se
// comparan por subcadena contra la pregunta normalizada con `normalizeText`.
// El orden de las claves fija el orden de la salida.
const KEYWORD_MAP: Record<ChatbotIntent, readonly string[]> = {
  grades: ["nota", "notas", "promedio", "saque", "parcial", "examen", "calificacion", "aprobe", "aprobar", "apruebo", "aprobare", "desaprob", "jale", "jalar"],
  schedule: ["horario", "hora", "entro", "clase", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "manana", "tengo", "cursos"],
  curriculum: ["malla", "creditos", "cursos", "terminar", "ciclo", "llevar", "prerrequisito", "falta", "avance"],
  alerts: ["riesgo", "alerta", "carga", "evaluaciones"],
  announcements: ["anuncio", "anuncios", "comunicado", "aviso", "publico", "publicaron"],
  // Reemplaza a `classmates` y hereda sus palabras. «delegad» cubre delegado,
  // delegada, delegados y subdelegado.
  delegates: ["delegad", "representante", "companero", "companeros", "seccion", "quienes", "alumnos"],
  own_blocks: [
    "practica", "trabajo", "trabajar", "voluntariado", "bloque", "libre",
    "organizar", "organizo", "organizarme", "organizacion", "tiempo",
    "horas a la semana", "horas semanales",
  ],
  chat: [
    "chat", "grupo", "grupos",
    "dijo", "dijeron", "dicho", "dicen",
    "hablo", "hablaron",
    "comento", "comentan", "comentaron", "comentario", "comentarios",
    "escribio", "escribieron",
    "mensaje", "mensajes", "conversacion",
    "alguien",
  ],
};

const DEFAULT_INTENTS: readonly ChatbotIntent[] = ["schedule", "grades", "curriculum"];

/**
 * Normalización de BR-CB-04: minúsculas, descomposición NFD y sin las marcas
 * diacríticas (U+0300 a U+036F). «¿Quiénes?» queda «¿quienes?» y «compañero»
 * queda «companero».
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Los dominios que activan las palabras clave de un texto, en el orden de
 * `KEYWORD_MAP`, con el arrastre de `own_blocks` a `schedule`. Vacío si no
 * activa ninguno.
 */
function domainsOf(text: string): ChatbotIntent[] {
  const normalized = normalizeText(text);
  const matched = new Set<ChatbotIntent>();

  for (const [intent, keywords] of Object.entries(KEYWORD_MAP) as Array<[ChatbotIntent, readonly string[]]>) {
    if (keywords.some((kw) => normalized.includes(kw))) {
      matched.add(intent);
    }
  }

  // `own_blocks` arrastra a `schedule`: BR-CB-19 combina los bloques propios con
  // el horario de clases, y «practica» también es la «práctica calificada», que
  // llega con las evaluaciones del horario. Este es el único lugar del arrastre.
  if (matched.has("own_blocks")) {
    matched.add("schedule");
  }

  return (Object.keys(KEYWORD_MAP) as ChatbotIntent[]).filter((intent) => matched.has(intent));
}

/**
 * BR-CB-04: los dominios de la pregunta. Si no activa ninguno, hereda los de la
 * pregunta anterior del alumno en la misma sesión (decisión 11 de la ronda
 * final). `previousQuestions` es el texto de los mensajes `user` del historial
 * de BR-CB-20, en orden cronológico. Como la pregunta anterior pudo heredar a su
 * vez, se toma la más reciente cuyas palabras clave activan algún dominio. Sin
 * ninguna, el respaldo `schedule`, `grades` y `curriculum`.
 */
export function classifyByKeywords(question: string, previousQuestions: readonly string[] = []): ChatbotIntent[] {
  const own = domainsOf(question);
  if (own.length > 0) return own;

  for (let i = previousQuestions.length - 1; i >= 0; i--) {
    const inherited = domainsOf(previousQuestions[i]);
    if (inherited.length > 0) return inherited;
  }

  return [...DEFAULT_INTENTS];
}
