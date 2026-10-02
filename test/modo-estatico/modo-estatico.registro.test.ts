import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

/**
 * RF-EST-2 y RF-EST-6 sobre `POST /auth/register`, con las rutas reales y un controlador
 * espía. La base es falsa por la misma razón que en `HU33_jeff/registro.endpoint.test.ts`.
 * Los códigos de alumno son sintéticos y cada caso usa uno distinto, porque el limitador
 * del registro guarda su contador en un `Map` de módulo.
 */
mock.module("../../src/db/index.js", () => ({ db: {} }));

const { createAuthRoutes } = await import("../../src/modules/auth/auth.routes.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { modoFijo } = await import("../../src/modules/app-setting/modo-estatico.lector.js");

import type { AuthController } from "../../src/modules/auth/auth.controller.js";

const montar = (opciones?: { registroCerrado?: boolean }) => {
  const llamadas: unknown[] = [];
  const controller = {
    register: async (input: unknown) => {
      llamadas.push(input);
      return { token: "t", tokenType: "Bearer" };
    },
  } as unknown as AuthController;
  const app = new Hono();
  app.onError(errorHandler);
  // RF-IRM-5. La ruta recibe un lector del modo, y esta suite fija su valor al montar.
  const registroCerrado = opciones?.registroCerrado;
  app.route(
    "/auth",
    createAuthRoutes(controller, registroCerrado === undefined ? undefined : { registroCerrado: modoFijo(registroCerrado) }),
  );
  return { app, llamadas };
};

const post = (app: Hono, cuerpo: unknown) =>
  app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

const valido = (code: string) => ({
  code, portalPassword: "clave-portal-sintetica", passcode: "123456", password: "clave-nueva-sintetica",
});

describe("POST /auth/register con el registro cerrado (RF-EST-2)", () => {
  test("responde 503 REGISTRATION_UNAVAILABLE y no llega al controlador", async () => {
    const { app, llamadas } = montar({ registroCerrado: true });
    const res = await post(app, valido("20238001"));
    expect(res.status).toBe(503);
    const cuerpo = await res.json();
    expect(cuerpo.error.code).toBe("REGISTRATION_UNAVAILABLE");
    expect(llamadas).toHaveLength(0);
  });

  test("responde 503 aun con un cuerpo inválido o vacío", async () => {
    const { app } = montar({ registroCerrado: true });
    for (const cuerpo of [{}, { code: 1 }, "no-es-objeto"]) {
      const res = await post(app, cuerpo);
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("REGISTRATION_UNAVAILABLE");
    }
  });

  test("sigue en 503 después de agotar el límite de tasa por código", async () => {
    const { app } = montar({ registroCerrado: true });
    const estados: number[] = [];
    for (let i = 0; i < 8; i++) estados.push((await post(app, valido("20238002"))).status);
    expect(estados).toEqual(Array(8).fill(503));
  });
});

describe("POST /auth/register con el registro abierto (RF-EST-6)", () => {
  test.each([undefined, { registroCerrado: false }])("con %p llega al controlador y responde 201", async (opciones) => {
    const { app, llamadas } = montar(opciones);
    const res = await post(app, valido(opciones ? "20238003" : "20238004"));
    expect(res.status).toBe(201);
    expect(llamadas).toHaveLength(1);
  });

  test("un cuerpo inválido sigue dando 400 y no llega al controlador", async () => {
    const { app, llamadas } = montar({ registroCerrado: false });
    const res = await post(app, {});
    expect(res.status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });
});
