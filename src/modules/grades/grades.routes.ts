import { Hono } from "hono";
import type { GradesController } from "./grades.controller.js";
import { authMiddleware, requireRole, STUDENT_ROLES } from "../../shared/middleware/auth-middleware.js";

export const createGradesRoutes = (controller: GradesController) => {
  const app = new Hono();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/me/courses", (c) => controller.getMeCourses(c));
  app.post("/me/calculate", (c) => controller.calculateAverage(c));
  app.get("/me/notes", (c) => controller.loadNotas(c));
  // RS-BE-57. Notas parciales que publica la ULima, tal como las guarda la recarga.
  app.get("/me/ulima", (c) => controller.getUlimaGrades(c));
  app.post("/me/notes", (c) => controller.saveNotas(c));
  app.delete("/me/notes/:sectionId/:assessmentId", (c) => controller.deleteNota(c));

  return app;
};
