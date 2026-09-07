import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import { confirmarAvatarSchema, userIdParamSchema } from "./avatar.schemas.js";
import type { AvatarService } from "./avatar.service.js";

export class AvatarController {
  constructor(private readonly service: AvatarService) {}

  firmar(c: Context) {
    return c.json(this.service.firmarSubida(Number(c.get("userId"))));
  }

  async confirmar(c: Context) {
    const parsed = confirmarAvatarSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new HttpError(400, "Datos inválidos.", "INVALID_BODY", parsed.error.flatten());
    }
    await this.service.confirmar(Number(c.get("userId")), parsed.data.version);
    return c.json({ ok: true });
  }

  async quitarPropia(c: Context) {
    const userId = Number(c.get("userId"));
    await this.service.quitar(userId, userId);
    return c.json({ ok: true });
  }

  async quitarDeOtro(c: Context) {
    const parsed = userIdParamSchema.safeParse({ userId: c.req.param("userId") });
    if (!parsed.success) {
      throw new HttpError(400, "Parámetros inválidos.", "INVALID_ROUTE_PARAMS", parsed.error.flatten());
    }
    await this.service.quitar(Number(c.get("userId")), parsed.data.userId);
    return c.json({ ok: true });
  }
}
