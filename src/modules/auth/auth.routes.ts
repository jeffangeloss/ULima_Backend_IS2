import { Hono, type Context, type Next } from "hono";
import type { AuthController } from "./auth.controller.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import {
  loginSchema,
  googleLoginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  passwordResetVerifySchema,
  registerSchema,
} from "./auth.schemas.js";
import { authMiddleware } from "../../shared/middleware/auth-middleware.js";
import { registerConcurrencyLimit, registerRateLimit } from "../../shared/middleware/rate-limit.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { modoFijo, type LectorDelModo } from "../app-setting/modo-estatico.lector.js";
import type { AppRole } from "./auth.types.js";

export type AuthRoutesOptions = {
  /** RF-EST-2 y RF-IRM-3. Lector del modo, que `POST /auth/register` consulta en cada petición.
   *  Con true la ruta responde 503 REGISTRATION_UNAVAILABLE antes de validar el cuerpo y antes de
   *  los limitadores, sin llegar al controlador. Sin lector, el registro queda abierto. */
  registroCerrado?: LectorDelModo;
};

export const createAuthRoutes = (controller: AuthController, opciones: AuthRoutesOptions = {}) => {
  const app = new Hono<{ Variables: { userId: number; role: AppRole } }>();
  const registroCerrado = opciones.registroCerrado ?? modoFijo(false);

  app.post("/login", async (c) => {
    const body = await validateJson(c, loginSchema);
    return c.json(await controller.login(body));
  });

  app.post("/google", async (c) => {
    const body = await validateJson(c, googleLoginSchema);
    return c.json(await controller.loginWithGoogle(body));
  });

  // RS-BE-17: pública, sin token — el portal de miUlima es quien certifica la
  // identidad, no un JWT que todavía no existe para quien se está registrando.
  //
  // Los dos limitadores van en este orden a propósito:
  //   1. `registerRateLimit` (por `code`) rechaza barato, sin tocar el portal.
  //      Va primero para que un bucle contra un mismo código no consuma
  //      además el cupo de concurrencia.
  //   2. `registerConcurrencyLimit` (global, sin clave) acota cuántas
  //      secuencias de login contra miUlima quedan colgadas a la vez, que es
  //      lo que un contador por clave no puede acotar.
  //
  // RF-EST-2 y RF-IRM-3. Antes de los dos limitadores va la guarda del modo, que consulta el
  // lector en cada petición. En modo estático quien insista sigue viendo el mismo 503 y no un
  // 400 o un 429, porque ni los limitadores ni la validación llegan a correr.
  const guardaDelRegistro = async (_c: Context, next: Next) => {
    if (await registroCerrado()) {
      throw new HttpError(503, "El registro no está disponible.", "REGISTRATION_UNAVAILABLE");
    }
    await next();
  };
  app.post("/register", guardaDelRegistro, registerRateLimit, registerConcurrencyLimit, async (c) => {
    const body = await validateJson(c, registerSchema);
    return c.json(await controller.register(body), 201);
  });

  app.post("/password-reset/request", async (c) => {
    const body = await validateJson(c, passwordResetRequestSchema);
    return c.json(await controller.requestPasswordReset(body));
  });

  app.post("/password-reset/verify", async (c) => {
    const body = await validateJson(c, passwordResetVerifySchema);
    return c.json(await controller.verifyPasswordResetCode(body));
  });

  app.post("/password-reset/confirm", async (c) => {
    const body = await validateJson(c, passwordResetConfirmSchema);
    return c.json(await controller.confirmPasswordReset(body));
  });

  app.post("/password-reset/request-me", authMiddleware, async (c) => {
    return c.json(await controller.requestPasswordResetForCurrentUser(Number(c.get("userId"))));
  });

  app.get("/me", authMiddleware, async (c) => {
    return c.json(await controller.me(Number(c.get("userId")), c.get("role") as AppRole));
  });

  app.post("/logout", authMiddleware, async (c) => {
    await controller.logout(Number(c.get("userId")));
    return c.json({ message: "Session closed" });
  });

  return app;
};
