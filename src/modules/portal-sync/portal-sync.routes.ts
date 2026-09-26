import { Hono } from "hono";
import { authMiddleware, requireRole, STUDENT_ROLES } from "../../shared/middleware/auth-middleware.js";
import { portalRefreshRateLimit, portalSyncRateLimit } from "../../shared/middleware/rate-limit.js";
import type { PortalSyncController } from "./portal-sync.controller.js";

export const createPortalSyncRoutes = (controller: PortalSyncController) => {
  const app = new Hono<{ Variables: { userId: number; studentId: number; role: string } }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/status", (c) => controller.getStatus(c));
  app.post("/import", portalSyncRateLimit, (c) => controller.importFromPortal(c));
  // RS-BE-49. Recarga de asistencia y notas parciales con un solo inicio de sesión.
  app.post("/refresh", portalRefreshRateLimit, (c) => controller.refresh(c));

  return app;
};
