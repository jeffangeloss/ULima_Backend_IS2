import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../../shared/middleware/auth-middleware.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { ChatController } from "./chat.controller.js";
import { chatTokenSchema } from "./chat.schemas.js";

export const deleteParamsSchema = z.object({
  sectionId: z.coerce.number().int().positive(),
  messageId: z.string().min(1).max(200),
});

export const createChatRoutes = (controller: ChatController) => {
  const app = new Hono<{
    Variables: {
      userId: number;
      studentId?: number;
      teacherId?: number;
      role: string;
    };
  }>();

  app.use("*", authMiddleware);

  app.post("/token", async (c) => {
    const body = await validateJson(c, chatTokenSchema);

    return c.json(await controller.createFirebaseToken({
      sectionId: body.sectionId,
      userId: c.get("userId"),
      studentId: c.get("studentId"),
      teacherId: c.get("teacherId"),
      role: c.get("role"),
    }));
  });

  // HU23 / R-CHAT-4: eliminar (borrado suave) un mensaje. Entra cualquier rol
  // autenticado; el controller resuelve al participante desde el JWT (igual que
  // /token) y solo deja borrar lo propio, salvo al profesor titular.
  app.delete("/sections/:sectionId/messages/:messageId", async (c) => {
    const parsed = deleteParamsSchema.safeParse({
      sectionId: c.req.param("sectionId"),
      messageId: c.req.param("messageId"),
    });
    if (!parsed.success) {
      throw new HttpError(400, "Parámetros inválidos.", "INVALID_ROUTE_PARAMS", parsed.error.flatten());
    }

    return c.json(await controller.deleteMessage({
      sectionId: parsed.data.sectionId,
      messageId: parsed.data.messageId,
      userId: c.get("userId"),
      studentId: c.get("studentId"),
      teacherId: c.get("teacherId"),
      role: c.get("role"),
    }));
  });

  return app;
};
