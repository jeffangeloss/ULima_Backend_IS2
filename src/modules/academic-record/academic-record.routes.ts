import { Hono } from "hono";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import type { AcademicRecordController } from "./academic-record.controller.js";

/**
 * Récord académico del alumno (RS-BE-26 y RS-BE-27).
 *
 * Solo el dueño de los datos: `requireRole(...STUDENT_ROLES)` deja fuera a los
 * docentes y el `studentId` sale del token, así que no hay forma de pedir el
 * récord de otra persona.
 *
 * `Cache-Control: no-store` va en un middleware propio para cubrir el GET y el
 * DELETE a la vez: son las notas del alumno y no se guardan en ninguna caché
 * intermedia. Va después de la autenticación, igual que el header que pone
 * `rate-limit.ts:26-28` antes de `next()`.
 */
export const createAcademicRecordRoutes = (controller: AcademicRecordController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/me", (c) => controller.getMine(c));
  app.delete("/me", (c) => controller.deleteMine(c));

  return app;
};
