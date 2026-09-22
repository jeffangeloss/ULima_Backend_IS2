import { Hono } from "hono";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import type { TimeBlocksController } from "./time-blocks.controller.js";

/**
 * Bloques de horario propios del alumno (RS-BE-31, RS-BE-32 y RS-BE-33).
 *
 * Solo alumnos: `requireRole(...STUDENT_ROLES)` deja fuera a los docentes, y el
 * `studentId` sale del token, así que no hay forma de nombrar a otro alumno.
 * Los `:id` de estas rutas son ids de BLOQUE, nunca de alumno.
 *
 * ORDEN: Hono prueba las rutas en el orden en que se registran.
 * `GET /me/occurrences` va primera a propósito. Hoy no choca con nada, porque
 * `/me/:id` solo existe con PATCH y DELETE; pero si algún día se agrega un
 * `GET /me/:id`, tiene que ir DEBAJO de esta línea: encima, Hono le pasaría
 * "occurrences" como id y la ventana respondería 400 INVALID_ROUTE_PARAMS.
 */
export const createTimeBlocksRoutes = (controller: TimeBlocksController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/me/occurrences", (c) => controller.getOccurrences(c));
  app.get("/me", (c) => controller.listBlocks(c));
  app.post("/me", (c) => controller.createBlock(c));
  app.patch("/me/:id", (c) => controller.updateBlock(c));
  app.delete("/me/:id", (c) => controller.deleteBlock(c));
  app.put("/me/:id/occurrences/:date", (c) => controller.setException(c));
  app.delete("/me/:id/occurrences/:date", (c) => controller.clearException(c));

  return app;
};
