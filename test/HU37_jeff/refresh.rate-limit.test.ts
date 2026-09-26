import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { HttpError } from "../../src/shared/errors/http-error.js";
import { errorHandler } from "../../src/shared/middleware/error-handler.js";
import {
  REFRESH_TRACE_KEY, portalRefreshRateLimit, portalSyncRateLimit, type RefreshTrace,
} from "../../src/shared/middleware/rate-limit.js";
import {
  PortalLoginGuard, refreshInProgress, tooManyRejectedLogins,
} from "../../src/modules/portal-sync/portal-login-guard.js";

/**
 * RS-BE-50 · guarda de inicio de sesión en curso y tope de inicios de sesión
 * rechazados. Los dos viven en memoria, por alumno, y los comparten la recarga
 * y la importación con credentials, porque protegen la misma cuenta de miUlima.
 * Ids de alumno inventados.
 */

describe("RS-BE-50 · guarda de inicio de sesión en curso", () => {
  test("una segunda recarga del mismo alumno no entra hasta que la primera termina", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "refresh");
    expect(g.tryStart(42, "refresh")).toBe(true);
  });

  test("una importación con credentials en curso bloquea la recarga, y al revés", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "import")).toBe(true);
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(42, "import")).toBe(false);
  });

  test("entre dos importaciones rige lo de hoy, sin guarda entre ellas", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "import")).toBe(true);
    expect(g.tryStart(42, "import")).toBe(true);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(true);
  });

  test("la guarda es por alumno", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(43, "refresh")).toBe(true);
  });

  test("el 409 lleva el código y el mensaje fijo de la spec", () => {
    expect(refreshInProgress()).toMatchObject({
      statusCode: 409, code: "PORTAL_REFRESH_IN_PROGRESS",
      message: "Ya hay una lectura de miUlima en curso. Espera a que termine.",
    });
  });
});

describe("RS-BE-50 · tope de inicios de sesión rechazados", () => {
  test("tres rechazos en 15 minutos bloquean el cuarto intento por lo que falta de la ventana", () => {
    let t = 0;
    const g = new PortalLoginGuard(() => t);
    for (const minuto of [0, 1, 2]) {
      t = minuto * 60_000;
      expect(g.rejectedLoginsWait(42)).toBeNull();
      g.recordRejectedLogin(42);
    }
    t = 3 * 60_000;
    expect(g.rejectedLoginsWait(42)).toBe(12);
    t = 15 * 60_000 - 1;
    expect(g.rejectedLoginsWait(42)).toBe(1);
    t = 15 * 60_000 + 1;
    expect(g.rejectedLoginsWait(42)).toBeNull();
  });

  test("el contador es uno solo por alumno, lo sume la recarga o la importación", () => {
    const g = new PortalLoginGuard(() => 0);
    g.recordRejectedLogin(42);
    g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(42)).toBeNull();
    g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(42)).toBe(15);
  });

  test("el tope es por alumno", () => {
    const g = new PortalLoginGuard(() => 0);
    for (let i = 0; i < 3; i++) g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(43)).toBeNull();
  });

  test("el 429 lleva kind rejected_logins y el mensaje fijo de la spec", () => {
    expect(tooManyRejectedLogins(12)).toMatchObject({
      statusCode: 429, code: "RATE_LIMITED",
      message: "Demasiados intentos con datos rechazados. Intenta de nuevo en 12 minuto(s).",
      details: { retryAfterMinutes: 12, kind: "rejected_logins" },
    });
  });
});

// ── Cupo propio de la recarga (limitador HTTP) ──────────────────────────────
// Los almacenes de rate-limit.ts son de módulo y los comparte todo el proceso
// de pruebas, así que cada caso usa su propio alumno, del rango 91xx.

type Guion = { tocaPortal: boolean; error?: HttpError };

/** App mínima con el limitador real. El guion dice si la recarga falsa tocó el portal y cómo terminó. */
const appRecarga = (studentId: number, guion: Guion) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("studentId" as never, studentId as never);
    await next();
  });
  app.post("/refresh", portalRefreshRateLimit, (c) => {
    const rastro = c.get(REFRESH_TRACE_KEY as never) as RefreshTrace;
    if (guion.tocaPortal) rastro.portalTocado = true;
    if (guion.error) throw guion.error;
    return c.json({ ok: true });
  });
  return app;
};

const appImportacion = (studentId: number) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("studentId" as never, studentId as never);
    await next();
  });
  app.post("/import", portalSyncRateLimit, (c) => c.json({ ok: true }));
  return app;
};

const post = (app: Hono, ruta = "/refresh") => app.request(ruta, { method: "POST" });

describe("RS-BE-50 · cupo propio de la recarga", () => {
  test("cinco recargas por hora, el sexto intento da 429 quota y cada respuesta lleva X-RateLimit-Remaining", async () => {
    const app = appRecarga(9101, { tocaPortal: true });
    const restantes: Array<string | null> = [];
    for (let i = 0; i < 5; i++) {
      const r = await post(app);
      expect(r.status).toBe(200);
      restantes.push(r.headers.get("X-RateLimit-Remaining"));
    }
    expect(restantes).toEqual(["4", "3", "2", "1", "0"]);
    const sexto = await post(app);
    expect(sexto.status).toBe(429);
    expect(sexto.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(await sexto.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas actualizaciones. Intenta de nuevo en 60 minuto(s).",
        details: { retryAfterMinutes: 60, kind: "quota" },
      },
    });
  });

  test("lo que termina sin tocar el portal devuelve el cupo", async () => {
    const errores = [
      new HttpError(400, "Invalid request body", "INVALID_REQUEST_BODY"),
      new HttpError(409, "Primero carga tus datos del ciclo.", "IMPORT_REQUIRED"),
      new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE"),
      new HttpError(409, "Ya hay una lectura de miUlima en curso. Espera a que termine.", "PORTAL_REFRESH_IN_PROGRESS"),
      new HttpError(429, "Demasiados intentos con datos rechazados. Intenta de nuevo en 12 minuto(s).", "RATE_LIMITED", {
        retryAfterMinutes: 12, kind: "rejected_logins",
      }),
    ];
    for (const [i, error] of errores.entries()) {
      const app = appRecarga(9110 + i, { tocaPortal: false, error });
      for (let k = 0; k < 7; k++) {
        const r = await post(app);
        expect(r.status).toBe(error.statusCode);
        expect(r.headers.get("X-RateLimit-Remaining")).toBe("5");
      }
    }
  });

  test("un rechazo del portal devuelve el cupo aunque la recarga haya iniciado sesión", async () => {
    const error = new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED");
    const app = appRecarga(9120, { tocaPortal: true, error });
    for (let k = 0; k < 7; k++) expect((await post(app)).status).toBe(409);
  });

  test("el 409 IMPORT_REQUIRED por cambio de ciclo no devuelve el cupo", async () => {
    const error = new HttpError(409, "La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.", "IMPORT_REQUIRED");
    const app = appRecarga(9121, { tocaPortal: true, error });
    for (let k = 0; k < 5; k++) expect((await post(app)).status).toBe(409);
    expect((await post(app)).status).toBe(429);
  });

  test("un 502 del portal tampoco devuelve el cupo", async () => {
    const error = new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");
    const app = appRecarga(9122, { tocaPortal: true, error });
    for (let k = 0; k < 5; k++) expect((await post(app)).status).toBe(502);
    expect((await post(app)).status).toBe(429);
  });

  test("el cupo de la recarga es aparte del de la importación", async () => {
    const importacion = appImportacion(9130);
    for (let k = 0; k < 5; k++) expect((await post(importacion, "/import")).status).toBe(200);
    expect((await post(importacion, "/import")).status).toBe(429);
    expect((await post(appRecarga(9130, { tocaPortal: true }))).status).toBe(200);
  });
});
