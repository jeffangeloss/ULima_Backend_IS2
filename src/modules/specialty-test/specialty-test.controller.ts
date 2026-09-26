import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import { evaluateBodySchema } from "./specialty-test.schemas.js";
import type { SpecialtyTestService } from "./specialty-test.service.js";

/**
 * Adapta HTTP al test de especialidad (RS-BE-38, RS-BE-39 y RS-BE-45). No
 * decide nada: saca al alumno del token, valida la forma del cuerpo con Zod y
 * le pasa todo al service. Ningún handler lee un alumno del cuerpo, de la ruta
 * ni de la query; un `studentId` en el cuerpo se descarta con las demás claves
 * desconocidas de la raíz.
 */
export class SpecialtyTestController {
  constructor(readonly service: SpecialtyTestService) {}

  /**
   * Misma guarda que `academic-record.controller.ts:15-21`: `authMiddleware`
   * acepta un `studentId` 0 (es entero), así que esta guarda sí se alcanza y
   * corta antes de consultar nada, con el código y el texto de `requireRole`.
   */
  private requireStudentId(c: Context): number {
    const studentId = c.get("studentId");
    if (!studentId) {
      throw new HttpError(403, "No tiene permisos para acceder a este recurso.", "FORBIDDEN");
    }
    return Number(studentId);
  }

  async getContent(c: Context): Promise<Response> {
    return c.json(await this.service.getContent(this.requireStudentId(c)));
  }

  async evaluate(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const body = await validateJson(c, evaluateBodySchema);
    return c.json(await this.service.evaluate(studentId, body));
  }

  async getResult(c: Context): Promise<Response> {
    return c.json(await this.service.getResult(this.requireStudentId(c)));
  }
}
