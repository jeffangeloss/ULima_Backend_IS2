import { Hono } from "hono";
import type { AttendanceRiskController } from "./attendance-risk.controller.js";
import { authMiddleware, requireRole } from "../../shared/middleware/auth-middleware.js";

export const createAttendanceRiskRoutes = (controller: AttendanceRiskController) => {
  const app = new Hono();

  app.use("*", authMiddleware);
  app.use("*", requireRole("teacher"));
  // RS-BE-11: además del ROL, la sección tiene que ser suya. Va sobre el patrón
  // de ruta (no sobre "*") para que `:sectionId` esté disponible en el param.
  app.use("/sections/:sectionId/*", async (c, next) => {
    await controller.assertOwnership(c);
    await next();
  });

  app.get("/sections/:sectionId/attendance-risk", (c) =>
    controller.getAttendanceRisk(c)
  );

  app.get("/sections/:sectionId/attendance-risk/summary", (c) =>
    controller.getAttendanceRiskSummary(c)
  );

  app.post("/sections/:sectionId/attendance-risk/notify", (c) =>
    controller.notifyStudents(c)
  );

  return app;
};
