import type { Context, Next } from "hono";
import { config } from "../../config/app-config.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<number, RateLimitEntry>();

const WINDOW_MS = 60 * 60 * 1000;

export async function chatbotRateLimit(c: Context, next: Next) {
  const maxRequests = config.chatbot.rateLimit;
  const studentId = c.get("studentId") as number | undefined;

  if (!studentId) {
    return next();
  }

  const now = Date.now();
  const entry = store.get(studentId);

  if (!entry || now > entry.resetAt) {
    store.set(studentId, { count: 1, resetAt: now + WINDOW_MS });
    c.header("X-RateLimit-Remaining", String(maxRequests - 1));
    c.header("X-RateLimit-Reset", String(Math.ceil((now + WINDOW_MS) / 1000)));
    return next();
  }

  if (entry.count >= maxRequests) {
    const resetInMs = entry.resetAt - now;
    const minutesLeft = Math.ceil(resetInMs / 60000);
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: `Demasiadas preguntas. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        details: { retryAfterMinutes: minutesLeft },
      },
    }, 429);
  }

  entry.count++;
  c.header("X-RateLimit-Remaining", String(maxRequests - entry.count));
  c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
  return next();
}

const portalStore = new Map<number, RateLimitEntry>();
const PORTAL_MAX_PER_HOUR = 5;

/**
 * Devuelve el cupo consumido por una importación que no llegó a hacer trabajo.
 *
 * El contador se descuenta ANTES de trabajar, que es lo correcto para no dejar
 * que 5 importaciones simultáneas pasen el límite. Pero con la variante de
 * credenciales el alumno tipea un código de 6 dígitos que caduca cada 30 s:
 * equivocarse es lo normal, y sin esto cinco tipeos lo dejarían bloqueado una
 * hora sin haber importado jamás.
 *
 * Solo se devuelve por login rechazado. Un 502 del portal NO devuelve cupo:
 * ahí sí se gastaron peticiones salientes contra la Universidad.
 */
const refundPortalQuota = (studentId: number): void => {
  const entry = portalStore.get(studentId);
  if (entry && entry.count > 0) entry.count--;
};

/** Cada importación dispara ~9-11 peticiones salientes al portal de la Universidad. */
export async function portalSyncRateLimit(c: Context, next: Next) {
  const studentId = c.get("studentId") as number | undefined;
  if (!studentId) return next();

  const now = Date.now();
  const entry = portalStore.get(studentId);
  if (!entry || now > entry.resetAt) {
    portalStore.set(studentId, { count: 1, resetAt: now + WINDOW_MS });
  } else if (entry.count >= PORTAL_MAX_PER_HOUR) {
    const minutesLeft = Math.ceil((entry.resetAt - now) / 60000);
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: `Demasiadas sincronizaciones. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        details: { retryAfterMinutes: minutesLeft },
      },
    }, 429);
  } else {
    entry.count++;
  }

  await next();

  // El errorHandler global ya convirtió la excepción en respuesta, así que acá
  // se lee el código del cuerpo y no un throw.
  if (c.res.status === 409) {
    try {
      const cuerpo = await c.res.clone().json() as { error?: { code?: string } };
      if (cuerpo?.error?.code === "PORTAL_LOGIN_REJECTED") refundPortalQuota(studentId);
    } catch {
      /* cuerpo no JSON: no se devuelve cupo, que es el lado seguro */
    }
  }
}
