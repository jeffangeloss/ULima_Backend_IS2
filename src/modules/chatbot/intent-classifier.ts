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

export function classifyByKeywords(question: string): ChatbotIntent[] {
  const normalized = normalizeText(question);
  const matched = new Set<ChatbotIntent>();

  for (const [intent, keywords] of Object.entries(KEYWORD_MAP) as Array<[ChatbotIntent, readonly string[]]>) {
    if (keywords.some((kw) => normalized.includes(kw))) {
      matched.add(intent);
    }
  }

  if (matched.size === 0) {
    return [...DEFAULT_INTENTS];
  }

  // `own_blocks` arrastra a `schedule`: BR-CB-19 combina los bloques propios con
  // el horario de clases, y «practica» también es la «práctica calificada», que
  // llega con las evaluaciones del horario. Este es el único lugar del arrastre.
  if (matched.has("own_blocks")) {
    matched.add("schedule");
  }

  return (Object.keys(KEYWORD_MAP) as ChatbotIntent[]).filter((intent) => matched.has(intent));
}
