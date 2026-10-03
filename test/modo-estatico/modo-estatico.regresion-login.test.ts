import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

/**
 * RF-EST-5. El interruptor del registro no toca el login con código, el login con Google ni
 * la recuperación de contraseña: con `registroCerrado` en `true` y en `false` responden lo
 * mismo, estado y cuerpo, y cada ruta llega al método del controlador que le corresponde.
 */
mock.module("../../src/db/index.js", () => ({ db: {} }));

const { createAuthRoutes } = await import("../../src/modules/auth/auth.routes.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { modoFijo } = await import("../../src/modules/app-setting/modo-estatico.lector.js");

import type { AuthController } from "../../src/modules/auth/auth.controller.js";

const llamadas: string[] = [];
const registrar = (nombre: string, salida: unknown) => async () => {
  llamadas.push(nombre);
  return salida;
};
const controller = {
  login: registrar("login", { token: "t-login", tokenType: "Bearer" }),
  loginWithGoogle: registrar("google", { token: "t-google", tokenType: "Bearer" }),
  requestPasswordReset: registrar("reset-request", { message: "enviado" }),
  verifyPasswordResetCode: registrar("reset-verify", { resetToken: "r" }),
  confirmPasswordReset: registrar("reset-confirm", { message: "ok" }),
} as unknown as AuthController;

const pedir = async (cerrado: boolean) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/auth", createAuthRoutes(controller, { registroCerrado: modoFijo(cerrado) }));
  const post = async (ruta: string, cuerpo: unknown) => {
    const res = await app.request(ruta, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    return { ruta, estado: res.status, cuerpo: await res.json() };
  };
  const sinSesion = await app.request("/auth/me");
  return [
    await post("/auth/login", { code: "20239001", password: "clave-sintetica" }),
    await post("/auth/login", {}),
    await post("/auth/google", { idToken: "token-sintetico" }),
    await post("/auth/password-reset/request", { identifier: "20239001" }),
    await post("/auth/password-reset/verify", { identifier: "20239001", code: "123456" }),
    await post("/auth/password-reset/confirm", { identifier: "20239001", code: "123456", newPassword: "clave-nueva-sintetica" }),
    { ruta: "/auth/me", estado: sinSesion.status, cuerpo: await sinSesion.json() },
  ];
};

describe("login, Google y recuperación de contraseña no cambian con el registro cerrado (RF-EST-5)", () => {
  test("responden lo mismo con el registro cerrado y abierto", async () => {
    const cerrado = await pedir(true);
    const abierto = await pedir(false);
    expect(cerrado).toEqual(abierto);
  });

  test("las rutas llegan a su método del controlador y no son 503", async () => {
    llamadas.length = 0;
    const resultados = await pedir(true);
    const porRuta = Object.fromEntries(resultados.map((r) => [`${r.ruta}#${r.estado}`, true]));
    expect(porRuta["/auth/login#200"]).toBe(true);
    expect(porRuta["/auth/login#400"]).toBe(true);
    expect(porRuta["/auth/google#200"]).toBe(true);
    expect(porRuta["/auth/me#401"]).toBe(true);
    expect(resultados.some((r) => r.estado === 503)).toBe(false);
    expect(llamadas).toEqual(["login", "google", "reset-request", "reset-verify", "reset-confirm"]);
  });
});
