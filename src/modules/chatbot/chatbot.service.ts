import { cohereClient } from "../../services/cohere.client.js";
import { todayISO } from "../../shared/clock.js";
import type { ScheduleService } from "../schedule/index.js";
import { ChatbotRepository } from "./chatbot.repository.js";
import { classifyByKeywords, classifyWithCohere } from "./intent-classifier.js";
import { buildContext, type DateContext } from "./context-builder.js";
import { searchChatMessages } from "./chat-search.js";
import { summarizeOfficialGrades } from "./grades-summary.js";
import type { ChatbotIntent, ChatbotMessageRow, ChatbotSessionRow } from "./chatbot.types.js";
import type { AskInput } from "./chatbot.schemas.js";

const CLASSIFY_TIMEOUT_MS = 500;
const WEEK_RANGE_RADIUS = 1;

export class ChatbotService {
  constructor(
    private readonly repository: ChatbotRepository,
    private readonly scheduleService: ScheduleService,
    // Inyectable para tests (default: la función real). Evita tener que mockear
    // el módulo chat-search.js globalmente, que en Bun se filtra entre archivos.
    private readonly searchChat: typeof searchChatMessages = searchChatMessages,
  ) {}

  async createSession(studentId: number): Promise<ChatbotSessionRow> {
    return this.repository.createSession(studentId);
  }

  async listSessions(studentId: number): Promise<ChatbotSessionRow[]> {
    return this.repository.listSessions(studentId);
  }

  async getSession(sessionId: string, studentId: number): Promise<{ session: ChatbotSessionRow; messages: ChatbotMessageRow[] } | null> {
    const session = await this.repository.findSessionById(sessionId, studentId);
    if (!session) return null;
    const messages = await this.repository.getMessages(sessionId);
    return { session, messages };
  }

  async deleteSession(sessionId: string, studentId: number): Promise<boolean> {
    return this.repository.deleteSession(sessionId, studentId);
  }

  async ask(sessionId: string, studentId: number, input: AskInput): Promise<{ answer: string; sessionId: string }> {
    const session = await this.repository.findSessionById(sessionId, studentId);
    if (!session) {
      throw Object.assign(new Error("SESSION_NOT_FOUND"), { statusCode: 404 });
    }

    await this.repository.saveMessage(sessionId, "user", input.question);
    await this.repository.touchSession(sessionId);

    const intents = await this.classifyIntent(input.question);
    const history = await this.repository.getMessages(sessionId);
    const studentInfo = await this.repository.getStudentInfo(studentId);

    const dateContext = await this.computeDateContext();

    const [
      scheduleData,
      curriculumData,
      alertsData,
      announcementsData,
      classmatesData,
      chatSearchResults,
      officialGradesRows,
    ] = await Promise.all([
      intents.includes("schedule") ? this.getScheduleData(studentId, dateContext) : Promise.resolve(null),
      intents.includes("curriculum") ? this.getCurriculumData(studentId) : Promise.resolve(null),
      intents.includes("alerts") ? this.getAlertsData(studentId) : Promise.resolve(null),
      intents.includes("announcements") ? this.getAnnouncementsData(studentId) : Promise.resolve(null),
      intents.includes("classmates") ? this.getClassmatesData(studentId) : Promise.resolve(null),
      this.getChatResults(studentId, input.question),
      // Notas OFICIALES (fuente de la verdad): matrícula real del período activo.
      intents.includes("grades") ? this.repository.getOfficialGrades(studentId) : Promise.resolve(null),
    ]);

    const officialGrades = officialGradesRows ? summarizeOfficialGrades(officialGradesRows) : null;

    const { preamble, message: contextMessage } = buildContext({
      studentName: studentInfo?.fullName ?? "Alumno",
      careerName: studentInfo?.careerName ?? "Desconocida",
      currentLevel: studentInfo?.currentLevel ?? null,
      history,
      intents,
      dateContext,
      scheduleData,
      curriculumData,
      alertsData,
      announcementsData,
      classmatesData,
      chatSearchResults,
      officialGrades,
      localGrades: input.localGrades,
      question: input.question,
    });

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 8000);

    let answer: string;
    try {
      const historyMessages = history.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
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

    await this.repository.saveMessage(sessionId, "assistant", answer);
    await this.repository.touchSession(sessionId);

    const isFirstMessage = history.filter((m) => m.role === "user").length === 1;
    if (isFirstMessage) {
      try {
        const title = await cohereClient.generateTitle(input.question);
        await this.repository.updateSessionTitle(sessionId, title);
      } catch {
        // Keep default title
      }
    }

    return { answer, sessionId };
  }

  private async classifyIntent(question: string): Promise<ChatbotIntent[]> {
    try {
      const result = await Promise.race([
        classifyWithCohere(question, cohereClient),
        new Promise<ChatbotIntent[]>((resolve) =>
          setTimeout(() => resolve(classifyByKeywords(question)), CLASSIFY_TIMEOUT_MS),
        ),
      ]);
      return result;
    } catch {
      return classifyByKeywords(question);
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

  private async getClassmatesData(studentId: number) {
    return this.repository.getClassmates(studentId);
  }

  private async getChatResults(studentId: number, question: string) {
    const sectionDetails = await this.repository.getActiveSectionDetails(studentId);
    if (sectionDetails.length === 0) return null;
    const results = await this.searchChat(question, sectionDetails);
    return results.length > 0 ? results : null;
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
