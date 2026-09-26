import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import { specialtyTestRateLimit } from "../../shared/middleware/rate-limit.js";
import type { SpecialtyTestController } from "./specialty-test.controller.js";

/** Tope del cuerpo de la evaluación. Un cuerpo legítimo mide menos de 1 KiB. */
export const EVALUATE_MAX_BYTES = 4 * 1024;

/** El resultado y la evaluación son del alumno: no se guardan en cachés intermedias. */
const noStore: MiddlewareHandler = async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
};

/**
 * Test de especialidad (RS-BE-46).
 *
 * Todo el módulo lleva `authMiddleware` y `requireRole(...STUDENT_ROLES)`:
 * un token docente recibe 403 y el alumno sale solo del token.
 *
 * ORDEN en `POST /me/evaluate`, que es el de RS-BE-39: autorización (los dos
 * `use` de arriba), `no-store` (antes que nada que pueda cortar, para que
 * también lo lleven el 413 y el 429), tamaño del cuerpo (413), límite de tasa
 * (429) y recién después el handler, que valida la forma con Zod (400).
 * `bodyLimit` lee el cuerpo entero antes de seguir, así que el contador no se
 * gasta con un cuerpo de más de 4 KiB. Es el primer 413 de la API, y su
 * `onError` lanza un `HttpError` para que la respuesta tenga la forma de
 * error de siempre.
 */
export const createSpecialtyTestRoutes = (controller: SpecialtyTestController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/content", (c) => controller.getContent(c));
  app.post(
    "/me/evaluate",
    noStore,
    bodyLimit({
      maxSize: EVALUATE_MAX_BYTES,
      onError: () => {
        throw new HttpError(413, "La petición es demasiado grande.", "PAYLOAD_TOO_LARGE");
      },
    }),
    specialtyTestRateLimit,
    (c) => controller.evaluate(c),
  );
  app.get("/me/result", noStore, (c) => controller.getResult(c));

  return app;
};
