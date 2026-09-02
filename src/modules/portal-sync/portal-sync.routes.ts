import { Hono } from "hono";
import { authMiddleware, requireRole, STUDENT_ROLES } from "../../shared/middleware/auth-middleware.js";
import { portalSyncRateLimit } from "../../shared/middleware/rate-limit.js";
import type { PortalSyncController } from "./portal-sync.controller.js";

export const createPortalSyncRoutes = (controller: PortalSyncController) => {
  const app = new Hono<{ Variables: { userId: number; studentId: number; role: string } }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/status", (c) => controller.getStatus(c));
  app.post("/import", portalSyncRateLimit, (c) => controller.importFromPortal(c));

  return app;
};
