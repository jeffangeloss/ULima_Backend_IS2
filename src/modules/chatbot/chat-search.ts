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

type SectionDetail = { sectionId: number; courseName: string; sectionCode: string };

/** Lectura de los últimos mensajes de una sección. Solo se usan el texto y la hora. */
export type ChatMessagesReader = (
  sectionId: number,
  limit: number,
) => Promise<Array<{ body: string; createdAt: number }>>;

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

export async function searchChatMessages(
  question: string,
  sectionDetails: SectionDetail[],
  // Inyectable para pruebas; por defecto, Firebase RTDB.
  readMessages: ChatMessagesReader = (sectionId, limit) => firebaseService.getRecentMessages(sectionId, limit),
): Promise<ChatSearchResult[]> {
  const results: ChatSearchResult[] = [];

  const matchedSections = filterSections(question, sectionDetails);

  for (const section of matchedSections) {
    try {
      const messages = await readMessages(section.sectionId, MESSAGES_PER_SECTION);

      if (messages.length === 0) continue;

      results.push({
        sectionName: `${section.courseName} (${section.sectionCode})`,
        // Solo el texto y la fecha: el remitente no se copia (BR-CB-23).
        messages: messages.map((m) => ({
          body: m.body,
          date: limaDateTime(m.createdAt),
        })),
      });
    } catch (error) {
      console.warn(`Failed to search chat for section ${section.sectionId}:`, error);
    }
  }

  return results;
}

/** Orden de BR-CB-06: nombre de curso (normalizado) y código de sección. */
const bySectionOrder = (a: SectionDetail, b: SectionDetail): number => {
  const nameA = normalizeText(a.courseName);
  const nameB = normalizeText(b.courseName);
  if (nameA !== nameB) return nameA < nameB ? -1 : 1;
  if (a.sectionCode !== b.sectionCode) return a.sectionCode < b.sectionCode ? -1 : 1;
  return a.sectionId - b.sectionId;
};

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
      .filter((t) => t.length > 3 && !/^(ii|iii|iv|vi|vii|viii|ix|x)$/.test(t));
    return tokens.some((t) => normalizedQuestion.includes(t));
  });
  return mentioned.length > 0 ? mentioned : ordered.slice(0, 3);
}
