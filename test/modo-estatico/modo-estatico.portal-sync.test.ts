import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

/**
 * RF-EST-3 y RF-EST-6 sobre `/portal-sync`. La base es falsa porque el router activo
 * importa el middleware de sesión, que abre un cliente de Postgres al evaluarse.
 */
mock.module("../../src/db/index.js", () => ({ db: {} }));

const { createPortalSyncDesactivadoRoutes, elegirRutasPortalSync } = await import(
  "../../src/modules/portal-sync/portal-sync-desactivado.routes.js"
);
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");

const CUERPO_EXACTO = {
  error: {
    code: "PORTAL_DESACTIVADO",
    message: "Esta versión de ULima++ no se conecta con la Universidad de Lima.",
  },
};

const montar = (rutas: Hono) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/portal-sync", rutas);
  return app;
};

describe("router desactivado de /portal-sync (RF-EST-3)", () => {
  const app = montar(createPortalSyncDesactivadoRoutes());

  const rutas: Array<[string, string]> = [
    ["GET", "/portal-sync/status"],
    ["POST", "/portal-sync/import"],
    ["POST", "/portal-sync/refresh"],
    ["GET", "/portal-sync"],
    ["GET", "/portal-sync/"],
    ["PUT", "/portal-sync/import"],
    ["DELETE", "/portal-sync/lo/que/sea"],
    ["PATCH", "/portal-sync/ruta-que-no-existe"],
  ];

  test.each(rutas)("%s %s responde 503 con el cuerpo exacto", async (metodo, ruta) => {
    const res = await app.request(ruta, { method: metodo });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(CUERPO_EXACTO);
  });

  test("responde igual con un token y con un cuerpo válido de importación", async () => {
    const res = await app.request("/portal-sync/import", {
      method: "POST",
      headers: { Authorization: "Bearer cualquiera", "Content-Type": "application/json" },
      body: JSON.stringify({ credentials: { password: "clave-sintetica", passcode: "123456" } }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual(CUERPO_EXACTO);
  });

  test("el cuerpo serializado no trae más campos que code y message", async () => {
    const res = await app.request("/portal-sync/status");
    expect(await res.text()).toBe(JSON.stringify(CUERPO_EXACTO));
  });
});

describe("elegirRutasPortalSync (RF-EST-3 y RF-EST-6)", () => {
  const activas = () => {
    const r = new Hono();
    r.get("/status", (c) => c.json({ origen: "activas" }));
    return r;
  };

  test("con true sirve el router desactivado y no construye el activo", async () => {
    const construir = mock(activas);
    const app = montar(elegirRutasPortalSync(true, construir));
    const res = await app.request("/portal-sync/status");
    expect([res.status, await res.json()]).toEqual([503, CUERPO_EXACTO]);
    expect(construir).not.toHaveBeenCalled();
  });

  test("con false sirve el router activo tal cual", async () => {
    const construir = mock(activas);
    const app = montar(elegirRutasPortalSync(false, construir));
    const res = await app.request("/portal-sync/status");
    expect([res.status, await res.json()]).toEqual([200, { origen: "activas" }]);
    expect(construir).toHaveBeenCalledTimes(1);
  });
});
