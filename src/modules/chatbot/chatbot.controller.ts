import type { Context } from "hono";
import type { ChatbotService } from "./chatbot.service.js";
import { askSchema } from "./chatbot.schemas.js";

const PROMPT_INJECTION_PATTERNS = [
  /<context>/i,
  /\[CONTEXTO\]/i,
  /\[DATOS_/i,
  /^system:/im,
  /^assistant:/im,
  // BR-CB-10, decisión 13: las dos líneas que enmarcan el mensaje de datos (BR-CB-24).
  /^\s*datos del alumno/im,
  /^\s*fin de los datos\s*$/im,
];

export class ChatbotController {
  constructor(private readonly service: ChatbotService) {}

  async createSession(c: Context) {
    const studentId = c.get("studentId") as number;
    const session = await this.service.createSession(studentId);
    return c.json({ session }, 201);
  }

  async listSessions(c: Context) {
    const studentId = c.get("studentId") as number;
    const sessions = await this.service.listSessions(studentId);
    return c.json({ sessions });
  }

  async getSession(c: Context) {
    const studentId = c.get("studentId") as number;
    const sessionId = c.req.param("id") ?? "";
    const result = await this.service.getSession(sessionId, studentId);
    if (!result) {
      return c.json({ error: { code: "SESSION_NOT_FOUND", message: "Sesion no encontrada." } }, 404);
    }
    return c.json({ session: result.session, messages: result.messages });
  }

  async deleteSession(c: Context) {
    const studentId = c.get("studentId") as number;
    const sessionId = c.req.param("id") ?? "";
    const deleted = await this.service.deleteSession(sessionId, studentId);
    if (!deleted) {
      return c.json({ error: { code: "SESSION_NOT_FOUND", message: "Sesion no encontrada." } }, 404);
    }
    return c.json({ message: "Sesion eliminada correctamente." });
  }

  async ask(c: Context) {
    const studentId = c.get("studentId") as number;
    const sessionId = c.req.param("id") ?? "";

    const body = await c.req.json();
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({
        error: {
          code: "INVALID_QUESTION",
          message: parsed.error.errors[0]?.message ?? "Pregunta invalida.",
          details: parsed.error.flatten(),
        },
      }, 400);
    }

    const input = parsed.data;

    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(input.question)) {
        return c.json({
          error: {
            code: "INVALID_QUESTION",
            message: "La pregunta contiene caracteres no permitidos.",
          },
        }, 400);
      }
    }

    try {
      const result = await this.service.ask(sessionId, studentId, input);
      return c.json(result);
    } catch (error) {
      const err = error as Error & { statusCode?: number };
      if (err.message === "SESSION_NOT_FOUND") {
        return c.json({ error: { code: "SESSION_NOT_FOUND", message: "Sesion no encontrada." } }, 404);
      }
      if (err.message === "CHATBOT_UNAVAILABLE" || err.statusCode === 503) {
        return c.json({
          error: {
            code: "CHATBOT_UNAVAILABLE",
            message: "Estoy teniendo dificultades tecnicas en este momento. Por favor intenta de nuevo en unos segundos.",
          },
        }, 503);
      }
      console.error("Chatbot ask error:", error);
      return c.json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Error interno del servidor.",
        },
      }, 500);
    }
  }
}
