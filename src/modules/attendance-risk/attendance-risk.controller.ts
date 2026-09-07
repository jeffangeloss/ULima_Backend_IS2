import type { Context } from "hono";
import { validateParams } from "../../shared/middleware/validate-dto.js";
import type { AttendanceRiskService } from "./attendance-risk.service.js";
import { sectionIdParamSchema } from "./attendance-risk.schemas.js";
import { HttpError } from "../../shared/errors/http-error.js";

export class AttendanceRiskController {
  constructor(readonly service: AttendanceRiskService) {}

  /**
   * Guarda de propiedad (RS-BE-11). La montan las rutas como middleware sobre
   * TODAS las rutas del módulo, no cada handler: así un endpoint nuevo nace
   * protegido en vez de depender de que alguien se acuerde de llamarla.
   */
  async assertOwnership(c: Context) {
    const { sectionId } = validateParams(c, sectionIdParamSchema);
    const teacherId = Number(c.get("teacherId"));
    if (!Number.isInteger(teacherId)) {
      throw new HttpError(401, "No autorizado. Docente no encontrado.", "TEACHER_NOT_FOUND");
    }
    await this.service.assertTeacherOwnsSection(teacherId, sectionId);
  }

  async getAttendanceRisk(c: Context) {
    const { sectionId } = validateParams(c, sectionIdParamSchema);
    return c.json(await this.service.getAttendanceRisk(sectionId));
  }

  async getAttendanceRiskSummary(c: Context) {
    const { sectionId } = validateParams(c, sectionIdParamSchema);
    return c.json(await this.service.getAttendanceRiskSummary(sectionId));
  }

  async notifyStudents(c: Context) {
    const { sectionId } = validateParams(c, sectionIdParamSchema);
    return c.json(await this.service.notifyStudents(sectionId));
  }
}
