import { Hono } from "hono";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import type { AvatarController } from "./avatar.controller.js";

/**
 * Fotos de perfil.
 *
 * No hay ningún endpoint para PEDIR la foto de un usuario: eso convertiría la
 * app en un directorio de caras. La foto viaja donde ya viaja la persona —
 * contactos de la sección, participantes del chat y /auth/me—, apoyada en la
 * guarda de pertenencia que esos endpoints ya tienen.
 */
export const createAvatarRoutes = (controller: AvatarController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES, "teacher"));

  app.post("/signature", (c) => controller.firmar(c));
  app.post("/", (c) => controller.confirmar(c));
  app.delete("/", (c) => controller.quitarPropia(c));
  // Moderación: delegado, subdelegado, docente o JP de una sección compartida.
  app.delete("/:userId", (c) => controller.quitarDeOtro(c));

  return app;
};
