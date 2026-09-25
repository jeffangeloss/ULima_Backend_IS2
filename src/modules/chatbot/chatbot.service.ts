import { cohereClient } from "../../services/cohere.client.js";
import { todayISO } from "../../shared/clock.js";
import type { ScheduleService } from "../schedule/index.js";
// RS-BE-35: de `time-blocks` solo la función acotada y su tipo, y aquí solo
// como tipos. El valor lo inyecta `chatbot/index.ts` por constructor.
import type { OwnTimeBlocksSummary, readOwnTimeBlocksForAssistant } from "../time-blocks/index.js";
import { ChatbotRepository } from "./chatbot.repository.js";
import { classifyByKeywords } from "./intent-classifier.js";
import { buildContext, type DateContext } from "./context-builder.js";
import { searchChatMessages, type ChatSearchResult } from "./chat-search.js";
import { summarizeOfficialGrades } from "./grades-summary.js";
import type { ChatbotMessageRow, ChatbotSessionRow } from "./chatbot.types.js";
import type { AskInput } from "./chatbot.schemas.js";

const WEEK_RANGE_RADIUS = 1;

/** BR-CB-07 y BR-CB-20: turnos previos que viajan a Cohere en cada pregunta. */
const HISTORY_LIMIT = 10;

/** Violación de llave foránea de PostgreSQL. */
const FOREIGN_KEY_VIOLATION = "23503";

export class ChatbotService {
  constructor(
    private readonly repository: ChatbotRepository,
    private readonly scheduleService: ScheduleService,
    // BR-CB-18: la lectura de los bloques propios del alumno, la única puerta
    // del chatbot a `time-blocks` (RS-BE-35).
    private readonly readOwnTimeBlocks: typeof readOwnTimeBlocksForAssistant,
    // Inyectable para tests (default: la función real). Evita tener que mockear
    // el módulo chat-search.js globalmente, que en Bun se filtra entre archivos.
    private readonly searchChat: typeof searchChatMessages = searchChatMessages,
  ) {}

  async createSession(studentId: number): Promise<ChatbotSessionRow> {
    await this.purgeExpiredSessions();
    return this.repository.createSession(studentId);
  }

  async listSessions(studentId: number): Promise<ChatbotSessionRow[]> {
    await this.purgeExpiredSessions();
    return this.repository.listSessions(studentId);
  }

  async getSession(sessionId: string, studentId: number): Promise<{ session: ChatbotSessionRow; messages: ChatbotMessageRow[] } | null> {
    // BR-CB-22: una sesión del ciclo anterior se borra primero y la ruta da 404.
    await this.purgeExpiredSessions();
    const session = await this.repository.findSessionById(sessionId, studentId);
    if (!session) return null;
    const messages = await this.repository.getMessages(sessionId);
    return { session, messages };
  }

  /** BR-CB-22: `deleteSession` no corre la purga. */
  async deleteSession(sessionId: string, studentId: number): Promise<boolean> {
    return this.repository.deleteSession(sessionId, studentId);
  }

  /**
   * Orden de BR-CB-21: purga del ciclo, sesión del alumno, los 10 últimos
   * mensajes, clasificación y fecha, recolección, Cohere, guardado atómico del
   * par y, si el historial estaba vacío, el título.
   */
  async ask(sessionId: string, studentId: number, input: AskInput): Promise<{ answer: string; sessionId: string }> {
    // BR-CB-22: una sesión del ciclo anterior se borra aquí y responde 404.
    await this.purgeExpiredSessions();

    const session = await this.repository.findSessionById(sessionId, studentId);
    if (!session) {
      throw sessionNotFound();
    }

    // BR-CB-20: el historial se lee ANTES de guardar nada, así que no trae la
    // pregunta actual. Viaja una sola vez, como turnos.
    const history = await this.repository.getRecentMessages(sessionId, HISTORY_LIMIT);

    // BR-CB-04: solo palabras clave, sin esperar a Cohere. Una repregunta sin
    // palabras clave hereda los dominios de la pregunta anterior del alumno, que
    // sale de los mensajes `user` del historial ya leído (decisión 11).
    const previousQuestions = history.filter((m) => m.role === "user").map((m) => m.content);
    const intents = classifyByKeywords(input.question, previousQuestions);
    const studentInfo = await this.repository.getStudentInfo(studentId);

    const dateContext = await this.computeDateContext();

    // BR-CB-23: el chat de la sección solo se lee con preguntas sobre el chat o
    // los avisos.
    const readsChat = intents.includes("chat") || intents.includes("announcements");

    const [
      scheduleData,
      curriculumData,
      alertsData,
      announcementsData,
      delegatesData,
      ownBlocks,
      chatSearchResults,
      officialGradesRows,
    ] = await Promise.all([
      intents.includes("schedule") ? this.getScheduleData(studentId, dateContext) : Promise.resolve(null),
      intents.includes("curriculum") ? this.getCurriculumData(studentId) : Promise.resolve(null),
      intents.includes("alerts") ? this.getAlertsData(studentId) : Promise.resolve(null),
      intents.includes("announcements") ? this.getAnnouncementsData(studentId) : Promise.resolve(null),
      // BR-CB-16: delegado y subdelegado por curso y sección. Reemplaza a la lista
      // plana de compañeros, que ya no existe (BR-CB-17).
      intents.includes("delegates") ? this.repository.getSectionRepresentatives(studentId) : Promise.resolve(null),
      // BR-CB-18: los bloques propios del alumno del token, con la fecha de hoy
      // de BR-CB-13. El clasificador ya agregó `schedule` (BR-CB-04).
      intents.includes("own_blocks") ? this.getOwnBlocks(studentId, dateContext.today) : Promise.resolve(null),
      readsChat ? this.getChatResults(studentId, input.question) : Promise.resolve(null),
      // Notas OFICIALES (fuente de la verdad): matrícula real del período activo.
      intents.includes("grades") ? this.repository.getOfficialGrades(studentId) : Promise.resolve(null),
    ]);

    const officialGrades = officialGradesRows ? summarizeOfficialGrades(officialGradesRows) : null;

    const { preamble, message: contextMessage } = buildContext({
      studentName: studentInfo?.fullName ?? "Alumno",
      careerName: studentInfo?.careerName ?? "Desconocida",
      currentLevel: studentInfo?.currentLevel ?? null,
      intents,
      dateContext,
      scheduleData,
      curriculumData,
      alertsData,
      announcementsData,
      delegatesData,
      ownBlocks,
      chatSearchResults,
      officialGrades,
      localGrades: input.localGrades,
      question: input.question,
    });

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 8000);

    let answer: string;
    try {
      // BR-CB-07 y BR-CB-20: los turnos previos y, al final, el mensaje de datos.
      const historyMessages = history.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      answer = await cohereClient.chatWithHistory(
        [...historyMessages, { role: "user", content: contextMessage }],
        {
          preamble,
          temperature: 0.3,
          maxTokens: 1000,
          signal: abortController.signal,
        },
      );
    } catch (error) {
      clearTimeout(timeout);
      const cohereErr = error instanceof Error ? error.message : String(error);
      console.error("Cohere Chat error:", cohereErr);
      throw Object.assign(new Error("CHATBOT_UNAVAILABLE"), { statusCode: 503 });
    }
    clearTimeout(timeout);

    // BR-CB-21: pregunta y respuesta juntas, solo después de que Cohere
    // respondió. Si Cohere falló, arriba ya salió el 503 sin escribir nada.
    try {
      await this.repository.saveExchange(sessionId, input.question, answer);
    } catch (error) {
      // La sesión se borró mientras el alumno esperaba la respuesta.
      if (hasPostgresCode(error, FOREIGN_KEY_VIOLATION)) {
        throw sessionNotFound();
      }
      // Cualquier otro fallo sale como 500 genérico desde el controlador.
      throw error;
    }

    // BR-CB-03: «primera pregunta» es que la sesión no tenía mensajes. El
    // fallo del título no deshace el par ya guardado.
    if (history.length === 0) {
      try {
        const title = await cohereClient.generateTitle(input.question);
        await this.repository.updateSessionTitle(sessionId, title);
      } catch {
        // Se queda el título por defecto.
      }
    }

    return { answer, sessionId };
  }

  /**
   * BR-CB-22 y BR-CB-12: la purga perezosa del ciclo. Si falla, se registra y la
   * petición sigue; la próxima petición la reintenta.
   */
  private async purgeExpiredSessions(): Promise<void> {
    try {
      await this.repository.purgeSessionsBeforeActivePeriod();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("No se pudo purgar el historial del chatbot del ciclo anterior:", detail);
    }
  }

  private async getScheduleData(studentId: number, dateContext: DateContext) {
    const [sessions, allAssessments] = await Promise.all([
      this.repository.getSchedule(studentId),
      this.scheduleService.getAssessments(studentId),
    ]);

    const currentWeek = dateContext.currentWeekNumber;
    const fromWeek = currentWeek != null ? currentWeek - WEEK_RANGE_RADIUS : null;
    const toWeek = currentWeek != null ? currentWeek + WEEK_RANGE_RADIUS : null;

    const assessments = fromWeek != null && toWeek != null
      ? allAssessments.assessments.filter(
          (a) => a.weekNumber >= fromWeek && a.weekNumber <= toWeek,
        )
      : allAssessments.assessments;

    return { sessions, assessments };
  }

  private async getCurriculumData(studentId: number) {
    return this.repository.getCurriculum(studentId);
  }

  private async getAlertsData(studentId: number) {
    return this.repository.getAlerts(studentId);
  }

  private async getAnnouncementsData(studentId: number) {
    return this.repository.getAnnouncements(studentId);
  }

  /**
   * BR-CB-18 y BR-CB-12: si la lectura falla, se registra con `console.warn` y
   * la respuesta sigue sin el bloque de bloques propios, como con el chat.
   */
  private async getOwnBlocks(studentId: number, today: string): Promise<OwnTimeBlocksSummary | null> {
    try {
      return await this.readOwnTimeBlocks(studentId, today);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn("No se pudieron leer los bloques propios del alumno:", detail);
      return null;
    }
  }

  /**
   * BR-CB-06 y BR-CB-24: un arreglo vacío es «no hay mensajes» y el bloque 11
   * sale con su línea; null es una lectura fallida y el bloque no sale. Sin
   * secciones activas no hay chat que leer, así que no hay mensajes.
   */
  private async getChatResults(studentId: number, question: string): Promise<ChatSearchResult[] | null> {
    const sectionDetails = await this.repository.getActiveSectionDetails(studentId);
    if (sectionDetails.length === 0) return [];
    return this.searchChat(question, sectionDetails);
  }

  private async computeDateContext(): Promise<DateContext> {
    const today = todayISO();
    const [activePeriod, weeks] = await Promise.all([
      this.repository.getActiveAcademicPeriod(),
      this.repository.getAcademicWeeksForActivePeriod(),
    ]);

    const dateContext: DateContext = { today };

    if (activePeriod) {
      dateContext.academicPeriodCode = activePeriod.code;
    }

    if (weeks.length === 0) {
      return dateContext;
    }

    const currentWeek = pickCurrentWeek(weeks, today);
    if (currentWeek) {
      dateContext.currentWeekNumber = currentWeek.weekNumber;
      dateContext.currentWeekRange = `${currentWeek.startDate} → ${currentWeek.endDate}`;

      const nextWeek = weeks.find((w) => w.weekNumber === currentWeek.weekNumber + 1);
      if (nextWeek) {
        dateContext.nextWeekNumber = nextWeek.weekNumber;
        dateContext.nextWeekRange = `${nextWeek.startDate} → ${nextWeek.endDate}`;
      }
    }

    return dateContext;
  }
}

const sessionNotFound = () => Object.assign(new Error("SESSION_NOT_FOUND"), { statusCode: 404 });

/**
 * Busca el código de PostgreSQL en el error o en su cadena de `cause`: Drizzle
 * 0.45 envuelve el error de postgres.js en `DrizzleQueryError`.
 */
const hasPostgresCode = (error: unknown, code: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

type AcademicWeekRow = { weekNumber: number; startDate: string; endDate: string };

const pickCurrentWeek = (weeks: AcademicWeekRow[], today: string): AcademicWeekRow | null => {
  const exact = weeks.find((w) => w.startDate <= today && today <= w.endDate);
  if (exact) return exact;

  const past = weeks
    .filter((w) => w.startDate <= today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (past) return past;

  return weeks.slice().sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
};
