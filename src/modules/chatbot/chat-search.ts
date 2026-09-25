import { firebaseService } from "../../services/firebase.service.js";
import { LIMA_TZ } from "../../shared/clock.js";
import { normalizeText } from "./intent-classifier.js";

/**
 * Mensajes del chat de una sección tal como viajan a Cohere (BR-CB-23): solo el
 * texto y la fecha en hora de Lima, sin remitente.
 */
export interface ChatSearchResult {
  sectionName: string;
  messages: Array<{
    body: string;
    date: string;
  }>;
}

/**
 * Lo que deja la lectura del chat (BR-CB-06 y BR-CB-24). `results` trae solo
 * las secciones con mensajes y es el JSON del bloque 11. `sectionsRead` nombra,
 * como «CURSO (código)» y en el orden de BR-CB-06, cada sección cuya lectura
 * respondió, con mensajes o sin ellos, porque la línea de «no hay» del bloque
 * 11 dice de qué secciones no hay mensajes y no puede hablar de las que no leyó.
 */
export interface ChatSearchOutcome {
  results: ChatSearchResult[];
  sectionsRead: string[];
}

type SectionDetail = { sectionId: number; courseName: string; sectionCode: string };

/**
 * Lectura de los últimos mensajes de una sección. Solo se usan el texto, la
 * hora y la marca de borrado de R-CHAT-4, que conserva `body`.
 */
export type ChatMessagesReader = (
  sectionId: number,
  limit: number,
) => Promise<Array<{ body: string; createdAt: number; deleted?: boolean }>>;

// Tope de BR-CB-06: los últimos 200 mensajes de cada sección.
const MESSAGES_PER_SECTION = 200;

const LIMA_DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: LIMA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `createdAt` en milisegundos → `YYYY-MM-DD HH:MM` en hora de Lima (BR-CB-23). */
function limaDateTime(createdAt: number): string {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return "sin fecha";
  const parts: Record<string, string> = {};
  for (const p of LIMA_DATE_TIME.formatToParts(new Date(createdAt))) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * Mensajes de las secciones que corresponden a la pregunta (BR-CB-06). Una
 * sección cuya lectura falla se registra y se salta, y no entra en
 * `sectionsRead`. Si ninguna sección trae mensajes y alguna lectura falló,
 * devuelve null, porque no puede afirmar que no hay mensajes, y el bloque 11
 * no sale (BR-CB-24).
 */
export async function searchChatMessages(
  question: string,
  sectionDetails: SectionDetail[],
  // Inyectable para pruebas; por defecto, Firebase RTDB.
  readMessages: ChatMessagesReader = (sectionId, limit) => firebaseService.getRecentMessages(sectionId, limit),
): Promise<ChatSearchOutcome | null> {
  const results: ChatSearchResult[] = [];
  const sectionsRead: string[] = [];
  let failedReads = 0;

  const matchedSections = filterSections(question, sectionDetails);

  for (const section of matchedSections) {
    const sectionName = `${section.courseName} (${section.sectionCode})`;
    try {
      // Un mensaje que su autor o el profesor titular borró guarda aún su
      // texto (R-CHAT-4) y no viaja (BR-CB-23). Si todos lo están, la sección
      // se omite como una sin mensajes.
      const messages = (await readMessages(section.sectionId, MESSAGES_PER_SECTION)).filter(
        (m) => m.deleted !== true,
      );
      sectionsRead.push(sectionName);

      if (messages.length === 0) continue;

      results.push({
        sectionName,
        // Solo el texto y la fecha: el remitente no se copia (BR-CB-23).
        messages: messages.map((m) => ({
          body: m.body,
          date: limaDateTime(m.createdAt),
        })),
      });
    } catch (error) {
      failedReads++;
      console.warn(`Failed to search chat for section ${section.sectionId}:`, error);
    }
  }

  return results.length === 0 && failedReads > 0 ? null : { results, sectionsRead };
}

/** Orden de BR-CB-06: nombre de curso (normalizado) y código de sección. */
const bySectionOrder = (a: SectionDetail, b: SectionDetail): number => {
  const nameA = normalizeText(a.courseName);
  const nameB = normalizeText(b.courseName);
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  if (a.sectionCode !== b.sectionCode) return a.sectionCode < b.sectionCode ? -1 : 1;
  return a.sectionId - b.sectionId;
};

// Números romanos que no cuentan como token del nombre del curso (BR-CB-06).
const ROMAN_NUMERAL = /^(ii|iii|iv|vi|vii|viii|ix|x)$/;

// Artículos y preposiciones que BR-CB-06 ignora, ya normalizados. La regla de
// longitud mayor que 3 deja pasar los de cuatro letras o más («para», «sobre»,
// «entre», «desde», «hasta»…); los cortos van también para que la lista esté
// completa.
const STOPWORDS = new Set([
  // Artículos y contracciones.
  "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "al", "del",
  // Preposiciones.
  "a", "ante", "bajo", "cabe", "con", "contra", "de", "desde", "durante", "en", "entre",
  "hacia", "hasta", "mediante", "para", "por", "segun", "sin", "so", "sobre", "tras",
  "versus", "via",
]);

export function filterSections(question: string, sections: SectionDetail[]): SectionDetail[] {
  // La pregunta y los nombres de curso se comparan con la normalización de
  // BR-CB-04: minúsculas y sin tildes.
  const normalizedQuestion = normalizeText(question);
  const ordered = [...sections].sort(bySectionOrder);
  const mentioned = ordered.filter((s) => {
    const courseName = normalizeText(s.courseName);
    if (normalizedQuestion.includes(normalizeText(s.sectionCode))) return true;
    if (normalizedQuestion.includes(courseName)) return true;
    const tokens = courseName
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3 && !ROMAN_NUMERAL.test(t) && !STOPWORDS.has(t));
    return tokens.some((t) => normalizedQuestion.includes(t));
  });
  return mentioned.length > 0 ? mentioned : ordered.slice(0, 3);
}
