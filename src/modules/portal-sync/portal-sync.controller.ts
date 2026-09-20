import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import { importSchema } from "./portal-sync.schemas.js";
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
    // El body NUNCA se registra en logs: lleva cookies de sesión del portal o,
    // en la variante con credenciales, la contraseña de miUlima del alumno.
    //
    // `consent` (RS-BE-29) viaja en el body y no en un header ni en la query:
    // es parte de la petición que el alumno acaba de autorizar en la pantalla de
    // consentimiento, y así queda validado por el mismo esquema que el resto.
    // Se normaliza a booleano acá: `undefined` (apps viejas) y `false` son lo
    // mismo para el service, que solo entiende "aceptó" o "no aceptó".
    const { cookies, credentials, consent } = await validateJson(c, importSchema);
    const studentId = this.requireStudentId(c);
    const userId = Number(c.get("userId"));
    return c.json(await this.service.importFromPortal(
      userId, studentId, { cookies, credentials, consent: consent === true },
    ));
  }
}
