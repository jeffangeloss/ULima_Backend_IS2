import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

/**
 * RF-EST-3, RF-EST-6 y RF-IRM-3 sobre `/portal-sync`. La guarda consulta el lector del modo en
 * cada petición; aquí el lector es fijo, porque el cambio entre peticiones lo prueba
 * `test/interruptor-remoto/interruptor-remoto.rutas.test.ts`. La base es falsa porque el router
 * activo importa el middleware de sesión, que abre un cliente de Postgres al evaluarse.
 */
mock.module("../../src/db/index.js", () => ({ db: {} }));

const { protegerRutasPortalSync } = await import(
  "../../src/modules/portal-sync/portal-sync-desactivado.routes.js"
);
const { modoFijo } = await import("../../src/modules/app-setting/modo-estatico.lector.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");

const CUERPO_EXACTO = {
  error: {
    code: "PORTAL_DESACTIVADO",
    message: "Esta versión de ULima++ no se conecta con la Universidad de Lima.",
  },
};

/** Rutas activas de prueba que anotan cada petición que les llega. */
const activas = () => {
  const alcanzadas: string[] = [];
  const rutas = new Hono();
  rutas.all("*", (c) => {
    alcanzadas.push(`${c.req.method} ${c.req.path}`);
    return c.json({ origen: "activas" });
  });
  return { rutas, alcanzadas };
};

const montar = (rutas: Hono) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/portal-sync", rutas);
  return app;
};

describe("/portal-sync en modo estático (RF-EST-3)", () => {
  const { rutas: rutasActivas, alcanzadas } = activas();
  const app = montar(protegerRutasPortalSync(modoFijo(true), rutasActivas));

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

  test("ninguna de esas peticiones llega a las rutas activas", () => {
    expect(alcanzadas).toEqual([]);
  });
});

describe("protegerRutasPortalSync (RF-EST-6 y RF-IRM-3)", () => {
  test("con true responde 503 y no llega a las rutas activas", async () => {
    const { rutas, alcanzadas } = activas();
    const app = montar(protegerRutasPortalSync(modoFijo(true), rutas));
    const res = await app.request("/portal-sync/status");
    expect([res.status, await res.json()]).toEqual([503, CUERPO_EXACTO]);
    expect(alcanzadas).toEqual([]);
  });

  test("con false sirve el router activo tal cual", async () => {
    const { rutas, alcanzadas } = activas();
    const app = montar(protegerRutasPortalSync(modoFijo(false), rutas));
    const res = await app.request("/portal-sync/status");
    expect([res.status, await res.json()]).toEqual([200, { origen: "activas" }]);
    expect(alcanzadas).toEqual(["GET /portal-sync/status"]);
  });
});
