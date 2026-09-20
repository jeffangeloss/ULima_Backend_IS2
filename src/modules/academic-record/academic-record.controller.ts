import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import type { AcademicRecordService } from "./academic-record.service.js";

export class AcademicRecordController {
  constructor(readonly service: AcademicRecordService) {}

  /**
   * RS-BE-26: el alumno sale SOLO del token. No hay parámetro ni ruta para
   * leer el récord de otro, ni para docentes o delegados. `authMiddleware`
   * acepta un `studentId` 0 (es entero), así que esta guarda sí se alcanza y
   * corta antes de consultar nada. El código y el texto son los mismos que ya
   * devuelve `requireRole`, para no inventar un mensaje nuevo.
   */
  private requireStudentId(c: Context): number {
    const studentId = c.get("studentId");
    if (!studentId) {
      throw new HttpError(403, "No tiene permisos para acceder a este recurso.", "FORBIDDEN");
    }
    return Number(studentId);
  }

  async getMine(c: Context): Promise<Response> {
    return c.json(await this.service.getMine(this.requireStudentId(c)));
  }

  async deleteMine(c: Context): Promise<Response> {
    return c.json(await this.service.deleteMine(this.requireStudentId(c)));
  }
}
