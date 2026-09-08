import { Hono } from "hono";
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
import type { AppRole } from "./auth.types.js";

export const createAuthRoutes = (controller: AuthController) => {
  const app = new Hono<{ Variables: { userId: number; role: AppRole } }>();

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
  app.post("/register", async (c) => {
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
