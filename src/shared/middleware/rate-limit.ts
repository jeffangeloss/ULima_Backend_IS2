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

/** Cada importación dispara ~5 peticiones salientes al portal de la Universidad. */
export async function portalSyncRateLimit(c: Context, next: Next) {
  const studentId = c.get("studentId") as number | undefined;
  if (!studentId) return next();

  const now = Date.now();
  const entry = portalStore.get(studentId);
  if (!entry || now > entry.resetAt) {
    portalStore.set(studentId, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (entry.count >= PORTAL_MAX_PER_HOUR) {
    const minutesLeft = Math.ceil((entry.resetAt - now) / 60000);
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: `Demasiadas sincronizaciones. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        details: { retryAfterMinutes: minutesLeft },
      },
    }, 429);
  }
  entry.count++;
  return next();
}
