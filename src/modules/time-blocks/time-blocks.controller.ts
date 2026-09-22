import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  validateJson, validateParams, validateQuery,
} from "../../shared/middleware/validate-dto.js";
import {
  blockIdParamSchema,
  exceptionBodySchema,
  occurrenceParamsSchema,
  timeBlockBodySchema,
  windowQuerySchema,
} from "./time-blocks.schemas.js";
import type { TimeBlocksService } from "./time-blocks.service.js";

/**
 * Adapta HTTP a las reglas de los bloques propios (RS-BE-31, RS-BE-32 y
 * RS-BE-33). No decide nada: valida con Zod, saca al alumno del token y le
 * pasa todo al service.
 *
 * El alumno sale SOLO del token. Ningún handler lee un alumno del path, de la
 * query ni del body: los `:id` de la ruta son ids de BLOQUE, y el service
 * comprueba que el bloque sea del alumno del token (404 si no lo es).
 *
 * Orden en cada handler: alumno → params → body o query → service. Una
 * petición sin alumno útil corta antes de validar nada.
 */
export class TimeBlocksController {
  constructor(readonly service: TimeBlocksService) {}

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

  async listBlocks(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    return c.json(await this.service.listBlocks(studentId));
  }

  async createBlock(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const body = await validateJson(c, timeBlockBodySchema);
    return c.json(await this.service.createBlock(studentId, body), 201);
  }

  async updateBlock(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id } = validateParams(c, blockIdParamSchema);
    const body = await validateJson(c, timeBlockBodySchema);
    return c.json(await this.service.updateBlock(studentId, id, body));
  }

  async deleteBlock(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id } = validateParams(c, blockIdParamSchema);
    return c.json(await this.service.deleteBlock(studentId, id));
  }

  async setException(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id, date } = validateParams(c, occurrenceParamsSchema);
    const body = await validateJson(c, exceptionBodySchema);
    return c.json(await this.service.setException(studentId, id, date, body));
  }

  async clearException(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id, date } = validateParams(c, occurrenceParamsSchema);
    return c.json(await this.service.clearException(studentId, id, date));
  }

  async getOccurrences(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { from, to } = validateQuery(c, windowQuerySchema);
    return c.json(await this.service.occurrences(studentId, from, to));
  }
}
