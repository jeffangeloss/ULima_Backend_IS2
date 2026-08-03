import type { ChatbotIntent } from "./chatbot.types.js";

const KEYWORD_MAP: Record<ChatbotIntent, string[]> = {
  grades: ["nota", "promedio", "saque", "parcial", "examen", "calificacion", "aprobe", "aprobar", "apruebo", "aprobare", "desaprob", "jale", "jalar", "notas"],
  schedule: ["horario", "hora", "entro", "clase", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "manana", "tengo", "cursos"],
  curriculum: ["malla", "creditos", "cursos", "terminar", "ciclo", "llevar", "prerrequisito", "falta", "avance"],
  alerts: ["riesgo", "alerta", "carga", "evaluaciones"],
  announcements: ["anuncio", "comunicado", "aviso", "publico", "anuncios", "publicaron"],
  classmates: ["companero", "companeros", "seccion", "quienes", "alumnos", "compañero", "compañeros"],
  chat: [
    "chat", "grupo", "grupos",
    "dijo", "dijeron", "dicho", "dicen",
    "hablo", "hablaron", "habló",
    "comento", "comentó", "comentan", "comentaron", "comentario", "comentarios",
    "escribio", "escribió", "escribieron",
    "mensaje", "mensajes", "conversacion",
    "alguien",
  ],
};

export function classifyByKeywords(question: string): ChatbotIntent[] {
  const lower = question.toLowerCase();
  const matchedIntents: ChatbotIntent[] = [];

  for (const [intent, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matchedIntents.push(intent as ChatbotIntent);
    }
  }

  if (matchedIntents.length === 0) {
    matchedIntents.push("schedule", "grades", "curriculum");
  }

  return matchedIntents;
}

export function classifyWithCohere(
  question: string,
  cohere: { classify(
    inputs: string[],
    examples: Array<{ text: string; label: string }>,
  ): Promise<Array<{ input: string; labels: Record<string, { confidence: number }> }>> },
): Promise<ChatbotIntent[]> {
  const examples: Array<{ text: string; label: string }> = [
    { text: "Que nota saque en el parcial de Algebra", label: "grades" },
    { text: "Cual es mi promedio general", label: "grades" },
    { text: "Como voy en Soft II", label: "grades" },
    { text: "Cuanto me falta para aprobar Ingenieria de Software", label: "grades" },
    { text: "Que necesito sacar para aprobar el curso", label: "grades" },
    { text: "Voy a aprobar Contabilidad", label: "grades" },
    { text: "Que examenes tengo hoy", label: "schedule" },
    { text: "Cuando es mi proximo examen", label: "schedule" },
    { text: "A que hora entro manana", label: "schedule" },
    { text: "Que cursos tengo los lunes", label: "schedule" },
    { text: "Cuantos creditos llevo", label: "curriculum" },
    { text: "Que cursos me faltan para terminar", label: "curriculum" },
    { text: "Puedo llevar Base de Datos este ciclo", label: "curriculum" },
    { text: "Estoy en riesgo academico", label: "alerts" },
    { text: "Tengo alta carga de evaluaciones", label: "alerts" },
    { text: "Que anuncios hubo esta semana", label: "announcements" },
    { text: "Que publicaron en mis cursos", label: "announcements" },
    { text: "Quienes son mis companeros en Soft II", label: "classmates" },
    { text: "Quien esta en mi seccion", label: "classmates" },
    { text: "Alguien dijo algo sobre el examen en el chat", label: "chat" },
    { text: "Que se hablo en el chat ayer", label: "chat" },
    { text: "Que comentaron sobre la tarea", label: "chat" },
    { text: "Han dicho algo del examen en el grupo de software", label: "chat" },
    { text: "Que escribieron en el grupo sobre la exposicion", label: "chat" },
    { text: "Algun comentario en el grupo de la clase", label: "chat" },
  ];

  return cohere.classify([question], examples).then((results) => {
    if (!results.length) return classifyByKeywords(question);
    const labels = results[0].labels;
    const intents: ChatbotIntent[] = [];
    for (const [label, { confidence }] of Object.entries(labels)) {
      if (confidence > 0.3) {
        intents.push(label as ChatbotIntent);
      }
    }
    if (intents.length === 0) {
      return classifyByKeywords(question);
    }
    return intents;
  });
}
