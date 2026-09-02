import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import { importCookiesSchema } from "./portal-sync.schemas.js";
import type { PortalSyncService } from "./portal-sync.service.js";

export class PortalSyncController {
  constructor(readonly service: PortalSyncService) {}

  private requireStudentId(c: Context): number {
    const studentId = c.get("studentId");
    if (!studentId) throw new HttpError(403, "Solo alumnos pueden sincronizar.", "FORBIDDEN");
    return Number(studentId);
  }

  async getStatus(c: Context) {
    return c.json(await this.service.getStatus(this.requireStudentId(c)));
  }

  async importFromPortal(c: Context) {
    // El body NUNCA se registra en logs: lleva cookies de sesión del portal.
    const { cookies } = await validateJson(c, importCookiesSchema);
    const studentId = this.requireStudentId(c);
    const userId = Number(c.get("userId"));
    return c.json(await this.service.importFromPortal(userId, studentId, cookies));
  }
}
