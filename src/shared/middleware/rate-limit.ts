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
 * Se devuelve por login rechazado y, desde RS-BE-50, cuando la importación
 * con credentials termina antes de llamar al portal. Un 502 del portal NO
 * devuelve cupo: ahí sí se gastaron peticiones salientes contra la Universidad.
 */
const refundPortalQuota = (studentId: number): void => {
  const entry = portalStore.get(studentId);
  if (entry && entry.count > 0) entry.count--;
};

/** Código y `details.kind` del error de una respuesta que ya armó el errorHandler. */
const errorDeRespuesta = async (res: Response): Promise<{ code?: string; kind?: string }> => {
  try {
    const cuerpo = await res.clone().json() as { error?: { code?: string; details?: { kind?: string } } };
    return { code: cuerpo?.error?.code, kind: cuerpo?.error?.details?.kind };
  } catch {
    // Cuerpo no JSON: no se devuelve cupo, que es el lado seguro.
    return {};
  }
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
        details: { retryAfterMinutes: minutesLeft, kind: "quota" },
      },
    }, 429);
  } else {
    entry.count++;
  }

  await next();

  // El errorHandler global ya convirtió la excepción en respuesta, así que acá
  // se lee el código del cuerpo y no un throw. RS-BE-50. Se devuelve también
  // cuando la importación con credentials termina antes de llamar al portal,
  // por una recarga del mismo alumno en curso o por el tope de rechazos.
  if (c.res.status === 409 || c.res.status === 429) {
    const { code, kind } = await errorDeRespuesta(c.res);
    if (
      code === "PORTAL_LOGIN_REJECTED"
      || code === "PORTAL_REFRESH_IN_PROGRESS"
      || (code === "RATE_LIMITED" && kind === "rejected_logins")
    ) {
      refundPortalQuota(studentId);
    }
  }
}

// ── POST /portal-sync/refresh (RS-BE-50) ────────────────────────────────────
//
// Cupo PROPIO de 5 recargas por alumno por hora, separado del de la
// importación. Se descuenta antes de trabajar, igual que el de la importación,
// y se devuelve cuando la recarga termina sin haber enviado ninguna petición al
// portal, o ante un PORTAL_LOGIN_REJECTED, porque quien se equivoca al tipear
// su propio código no tiene por qué perder el cupo.
//
// Para saber si la recarga tocó el portal, el limitador deja en el contexto un
// rastro que el servicio marca justo antes de iniciar sesión. El código de
// error no alcanza, porque el 409 IMPORT_REQUIRED sale antes del portal (sin
// matrícula) y también después (cambio de ciclo), y solo el primero devuelve.
//
// Mismo límite del mecanismo que los de arriba: vive en la memoria de cada
// instancia y no es un límite global.

const refreshStore = new Map<number, RateLimitEntry>();
const REFRESH_MAX_PER_HOUR = 5;

/** Clave del rastro que el limitador de la recarga deja en el contexto. */
export const REFRESH_TRACE_KEY = "portalRefreshTrace";

/** Rastro de una recarga. `portalTocado` pasa a true justo antes de iniciar sesión. */
export type RefreshTrace = { portalTocado: boolean };

export async function portalRefreshRateLimit(c: Context, next: Next) {
  const studentId = c.get("studentId") as number | undefined;
  if (!studentId) return next();

  const now = Date.now();
  let cupo = refreshStore.get(studentId);
  if (!cupo || now > cupo.resetAt) {
    cupo = { count: 0, resetAt: now + WINDOW_MS };
    refreshStore.set(studentId, cupo);
  }
  if (cupo.count >= REFRESH_MAX_PER_HOUR) {
    const minutesLeft = Math.ceil((cupo.resetAt - now) / 60000);
    c.header("X-RateLimit-Remaining", "0");
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: `Demasiadas actualizaciones. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        details: { retryAfterMinutes: minutesLeft, kind: "quota" },
      },
    }, 429);
  }
  // Se descuenta ANTES de trabajar, para que cinco recargas simultáneas no
  // pasen todas el chequeo antes de que ninguna sume.
  cupo.count++;
  const rastro: RefreshTrace = { portalTocado: false };
  c.set(REFRESH_TRACE_KEY, rastro);

  await next();

  if (c.res.status >= 400) {
    const { code } = await errorDeRespuesta(c.res);
    if ((!rastro.portalTocado || code === "PORTAL_LOGIN_REJECTED") && cupo.count > 0) cupo.count--;
  }
  // Después de la devolución, para que el número diga el cupo que de verdad queda.
  c.header("X-RateLimit-Remaining", String(Math.max(0, REFRESH_MAX_PER_HOUR - cupo.count)));
  return;
}

// ── POST /auth/register (RS-BE-17) ──────────────────────────────────────────
//
// El registro es PÚBLICO: no hay JWT, así que no hay `studentId` con el que
// llavear el contador como hacen los dos limitadores de arriba. La clave es el
// `code` del cuerpo, y el tope global de peticiones en vuelo no lleva clave.
//
// Lo que se está atajando NO es solo el gasto propio: cada petición dispara
// una secuencia real de login contra miUlima con credenciales que elige quien
// llama. Sin contador, cualquiera puede pedir el registro del código de una
// persona real con contraseñas basura, en bucle, hasta que el portal de la
// Universidad le BLOQUEE la cuenta a esa persona. Es una denegación de
// servicio contra la cuenta universitaria de un tercero, ejecutada a través
// de este backend.
//
// LÍMITE DEL MECANISMO, escrito para que nadie lo lea como más de lo que es:
// el contador vive en memoria del proceso. En Vercel hay varias instancias y
// cada una lleva la suya, así que el techo real es
// `REGISTER_MAX_PER_HOUR x instancias vivas`. Sube el costo de un ataque y
// tapa el bucle trivial desde una sola conexión; no es un límite distribuido.
// Lo mismo vale para `portalSyncRateLimit`, que ya vivía con esa misma
// limitación.

const registerStore = new Map<string, RateLimitEntry>();
const REGISTER_MAX_PER_HOUR = 5;

/**
 * Tope de códigos distintos vigilados a la vez.
 *
 * La clave la elige quien llama, así que sin techo el mapa crece sin límite
 * con códigos inventados. Al pasarse se barren los vencidos; si aun así sigue
 * lleno, se responde 429 en vez de seguir creciendo — bajo esa presión,
 * descartar es lo correcto y es el lado seguro.
 */
const REGISTER_MAX_TRACKED_CODES = 10_000;

/** Misma forma que acepta `registerSchema`. Se comprueba ANTES de usar el
 *  valor como clave para no guardar basura arbitraria en el mapa. */
const CODE_SHAPE = /^\d{6,10}$/;

const tooManyRegistrations = (c: Context, minutesLeft: number) =>
  c.json({
    error: {
      code: "RATE_LIMITED",
      message: `Demasiados intentos de registro con ese código. Intenta de nuevo en ${minutesLeft} minuto(s).`,
      details: { retryAfterMinutes: minutesLeft },
    },
  }, 429);

/** Clave con la que `registerRateLimit` le deja a `registerConcurrencyLimit` la
 *  devolución del cupo que esta petición acaba de descontar. */
const REGISTER_REFUND_KEY = "registerQuotaRefund";

/**
 * Deja preparada la devolución del cupo por código que esta petición consumió.
 *
 * Se captura la ENTRADA, no la clave: si la ventana venció y otra petición ya
 * creó una entrada nueva para el mismo código, se descuenta de la vieja
 * —huérfana e inofensiva— y nunca del contador vigente. Por lo mismo no se
 * borra la entrada al llegar a 0: puede ser la que está contando a otra
 * petición del mismo código.
 */
const prepareRegisterRefund = (c: Context, entry: RateLimitEntry): void => {
  c.set(REGISTER_REFUND_KEY, () => {
    if (entry.count > 0) entry.count--;
  });
};

const refundRegisterQuota = (c: Context): void => {
  (c.get(REGISTER_REFUND_KEY) as (() => void) | undefined)?.();
};

/**
 * Máximo `REGISTER_MAX_PER_HOUR` intentos de registro por `code` y por hora.
 *
 * A diferencia de `portalSyncRateLimit` NO hay devolución de cupo por login
 * rechazado: ahí el cupo se devolvía porque quien se equivoca tipeando su
 * propio passcode es el dueño de la cuenta y no tiene por qué quedar
 * bloqueado. Acá el login rechazado es justamente la señal del abuso que este
 * contador existe para frenar, así que devolver cupo lo anularía por completo.
 *
 * Sí se devuelve cuando `registerConcurrencyLimit` no deja entrar la petición:
 * ahí no hubo login que rechazar ni petición saliente a miUlima. Es el mismo
 * criterio de `refundPortalQuota` —se devuelve el cupo que no compró trabajo—
 * y por eso el descuento se prepara con `prepareRegisterRefund`.
 */
export async function registerRateLimit(c: Context, next: Next) {
  let code: string | null = null;
  try {
    // Hono cachea el texto del cuerpo (`HonoRequest#cachedBody`), así que
    // leerlo acá no se lo quita al `validateJson` de la ruta.
    const body = await c.req.json() as { code?: unknown } | null;
    if (typeof body?.code === "string" && CODE_SHAPE.test(body.code.trim())) {
      code = body.code.trim();
    }
  } catch {
    /* cuerpo ilegible: sigue y lo rechaza el validador con 400 */
  }

  // Sin código utilizable no hay contador que llevar. No es un agujero: un
  // cuerpo así no llega a tocar el portal — `validateJson` corta con 400
  // antes de que el service haga nada— y el tope de peticiones en vuelo, que
  // no necesita clave, sigue aplicando.
  if (!code) return next();

  const now = Date.now();
  const entry = registerStore.get(code);

  if (entry && now <= entry.resetAt) {
    if (entry.count >= REGISTER_MAX_PER_HOUR) {
      return tooManyRegistrations(c, Math.ceil((entry.resetAt - now) / 60000));
    }
    // Se descuenta ANTES de trabajar: si se contara al terminar, N peticiones
    // simultáneas pasarían todas el chequeo antes de que ninguna sumara.
    entry.count++;
    prepareRegisterRefund(c, entry);
    return next();
  }

  if (!entry && registerStore.size >= REGISTER_MAX_TRACKED_CODES) {
    for (const [k, v] of registerStore) {
      if (now > v.resetAt) registerStore.delete(k);
    }
    if (registerStore.size >= REGISTER_MAX_TRACKED_CODES) {
      return tooManyRegistrations(c, Math.ceil(WINDOW_MS / 60000));
    }
  }

  const fresh: RateLimitEntry = { count: 1, resetAt: now + WINDOW_MS };
  registerStore.set(code, fresh);
  prepareRegisterRefund(c, fresh);
  return next();
}

/**
 * Tope global de registros EN VUELO, sin clave.
 *
 * El contador por código no acota la concurrencia: mil códigos distintos son
 * mil peticiones simultáneas, cada una colgando una función serverless
 * durante ~5 saltos HTTP contra miUlima. Con este tope, el backend nunca
 * mantiene más de `REGISTER_MAX_IN_FLIGHT` secuencias de login abiertas
 * contra la Universidad por instancia.
 */
const REGISTER_MAX_IN_FLIGHT = 4;
let registerInFlight = 0;

export async function registerConcurrencyLimit(c: Context, next: Next) {
  if (registerInFlight >= REGISTER_MAX_IN_FLIGHT) {
    // Este rechazo es previo al service: la petición no tocó miUlima, así que
    // no puede cobrarle uno de los 5 intentos por hora al código. El mensaje
    // invita a reintentar en segundos, y sin esto el reintento llegaría con
    // menos cupo del que gastó: un salón registrándose a la vez dejaría a
    // varios bloqueados una hora sin haber intentado ni un login.
    refundRegisterQuota(c);
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: "Hay demasiados registros en curso. Intenta de nuevo en unos segundos.",
        details: { retryAfterSeconds: 30 },
      },
    }, 429);
  }

  registerInFlight++;
  try {
    await next();
  } finally {
    // En `finally` y no después de `next()`: si el handler lanza, el
    // `errorHandler` global convierte la excepción en respuesta más arriba y
    // sin esto el cupo quedaría consumido para siempre.
    registerInFlight--;
  }
  // Explícito: el `finally` deja a TS sin poder ver que este camino no
  // devuelve nada (`noImplicitReturns`).
  return;
}
