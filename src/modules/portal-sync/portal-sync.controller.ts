import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import { REFRESH_TRACE_KEY, type RefreshTrace } from "../../shared/middleware/rate-limit.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import { importSchema, refreshSchema } from "./portal-sync.schemas.js";
import type { PortalSyncService } from "./portal-sync.service.js";
import type { PortalRefreshService } from "./refresh/refresh.service.js";

export class PortalSyncController {
  constructor(readonly service: PortalSyncService, readonly refreshService: PortalRefreshService) {}

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

  async refresh(c: Context) {
    // RS-BE-50. El presupuesto cuenta desde que el controlador recibe la petición.
    const recibidaEn = Date.now();
    // El limitador deja el rastro antes de llegar acá. Sin limitador, uno propio.
    const rastro = (c.get(REFRESH_TRACE_KEY) as RefreshTrace | undefined) ?? { portalTocado: false };
    // El cuerpo NUNCA se registra: lleva la contraseña de miUlima del alumno.
    const { credentials } = await validateJson(c, refreshSchema);
    const studentId = this.requireStudentId(c);
    const userId = Number(c.get("userId"));
    const resultado = await this.refreshService.refresh({ userId, studentId, credentials, recibidaEn, rastro });
    c.header("Cache-Control", "no-store");
    return c.json(resultado);
  }
}
