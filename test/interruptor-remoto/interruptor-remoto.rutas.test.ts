import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

/**
 * RF-IRM-3 y RF-IRM-5 sobre `POST /auth/register` y `/portal-sync`, con las rutas reales y un
 * lector del modo que la prueba cambia entre dos peticiones, sin volver a montar nada. La base es
 * falsa por la misma razón que en `modo-estatico.registro.test.ts`. Los códigos de alumno son
 * sintéticos y distintos de los de las otras suites, porque el limitador del registro guarda su
 * contador en un `Map` de módulo.
 */
mock.module("../../src/db/index.js", () => ({ db: {} }));

const { createAuthRoutes } = await import("../../src/modules/auth/auth.routes.js");
const { protegerRutasPortalSync } = await import("../../src/modules/portal-sync/portal-sync-desactivado.routes.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");

import type { AuthController } from "../../src/modules/auth/auth.controller.js";

const PORTAL_DESACTIVADO = {
  error: { code: "PORTAL_DESACTIVADO", message: "Esta versión de ULima++ no se conecta con la Universidad de Lima." },
};

const montar = () => {
  let estatico = true;
  let lecturas = 0;
  const leerModo = async () => {
    lecturas++;
    return estatico;
  };
  const registros: unknown[] = [];
  const controller = {
    register: async (input: unknown) => {
      registros.push(input);
      return { token: "t", tokenType: "Bearer" };
    },
  } as unknown as AuthController;
  const alcanzadas: string[] = [];
  const activas = new Hono();
  activas.get("/status", (c) => {
    alcanzadas.push("status");
    return c.json({ origen: "activas" });
  });
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/auth", createAuthRoutes(controller, { registroCerrado: leerModo }));
  app.route("/portal-sync", protegerRutasPortalSync(leerModo, activas));
  return {
    app,
    registros,
    alcanzadas,
    lecturas: () => lecturas,
    fijar: (valor: boolean) => {
      estatico = valor;
    },
  };
};

const registrar = (app: Hono, code: string) =>
  app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, portalPassword: "clave-portal-sintetica", passcode: "123456", password: "clave-nueva-sintetica" }),
  });

describe("POST /auth/register consulta el modo en cada petición (RF-IRM-3)", () => {
  test("pasa de cerrado a abierto y de vuelta a cerrado sin volver a montar las rutas", async () => {
    const m = montar();
    const primera = await registrar(m.app, "20238101");
    expect(primera.status).toBe(503);
    expect((await primera.json()).error.code).toBe("REGISTRATION_UNAVAILABLE");
    m.fijar(false);
    expect((await registrar(m.app, "20238102")).status).toBe(201);
    m.fijar(true);
    expect((await registrar(m.app, "20238103")).status).toBe(503);
    expect(m.registros).toHaveLength(1);
    expect(m.lecturas()).toBe(3);
  });
});

describe("/portal-sync consulta el modo en cada petición (RF-IRM-3)", () => {
  test("pasa de 503 a las rutas activas y de vuelta a 503 sin volver a montar", async () => {
    const m = montar();
    const a = await m.app.request("/portal-sync/status");
    expect([a.status, await a.json()]).toEqual([503, PORTAL_DESACTIVADO]);
    m.fijar(false);
    const b = await m.app.request("/portal-sync/status");
    expect([b.status, await b.json()]).toEqual([200, { origen: "activas" }]);
    m.fijar(true);
    const c = await m.app.request("/portal-sync/status");
    expect([c.status, await c.json()]).toEqual([503, PORTAL_DESACTIVADO]);
    expect(m.alcanzadas).toEqual(["status"]);
  });

  test("en modo estático responde 503 con cualquier método y ruta, sin llegar a las rutas activas", async () => {
    const m = montar();
    for (const [metodo, ruta] of [["GET", "/portal-sync"], ["POST", "/portal-sync/import"], ["DELETE", "/portal-sync/lo/que/sea"]]) {
      const res = await m.app.request(ruta!, { method: metodo });
      expect([res.status, await res.json()]).toEqual([503, PORTAL_DESACTIVADO]);
    }
    expect(m.alcanzadas).toEqual([]);
  });
});
