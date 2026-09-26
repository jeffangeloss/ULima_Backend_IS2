import type { Context } from "hono";
import { validateJson, validateParams } from "../../shared/middleware/validate-dto.js";
import type { GradesService } from "./grades.service.js";
import { calculateAverageSchema, saveNotasSchema, deleteNotaParamsSchema } from "./grades.schemas.js";

// Ningún handler atrapa para devolver un fallback: los fallos (validación → los
// HttpError de validateJson/validateParams; BD/servicio → error inesperado) se
// propagan al errorHandler global, que responde el 500 estándar
// {error:{code,message}}. Antes se devolvían listas vacías con 200 (ocultando
// endpoints rotos como "pantalla sin cursos") o un 500 con forma divergente.
// Ver docs/AUDITORIA_TECNICA.md §6.1.
export class GradesController {
  constructor(readonly service: GradesService) {}

  async getMeCourses(c: Context) {
    const code = c.req.query("code");
    const result = await this.service.getCoursesAndSyllabi(code);
    return c.json(result);
  }

  async calculateAverage(c: Context) {
    const body = await validateJson(c, calculateAverageSchema);
    const result = this.service.calculateAverage(body.notas);
    return c.json(result);
  }

  async saveNotas(c: Context) {
    const body = await validateJson(c, saveNotasSchema);
    const studentId = c.get("studentId") as number;
    await this.service.saveNotas(studentId, body);
    return c.json({ message: "Notas guardadas correctamente" });
  }

  async loadNotas(c: Context) {
    const studentId = c.get("studentId") as number;
    const result = await this.service.loadNotas(studentId);
    return c.json(result);
  }

  async deleteNota(c: Context) {
    const { sectionId, assessmentId } = validateParams(c, deleteNotaParamsSchema);
    const studentId = c.get("studentId") as number;
    await this.service.deleteNota(studentId, sectionId, assessmentId);
    return c.json({ message: "Nota eliminada correctamente" });
  }

  /** RS-BE-57. Solo el propio alumno, que sale del JWT. Sin parámetros. */
  async getUlimaGrades(c: Context) {
    const studentId = c.get("studentId") as number;
    const vista = await this.service.getUlimaGrades(studentId);
    c.header("Cache-Control", "no-store");
    return c.json(vista);
  }
}
