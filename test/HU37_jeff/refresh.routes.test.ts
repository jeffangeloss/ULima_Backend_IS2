import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import jwt from "jsonwebtoken";

/**
 * RS-BE-49 y RS-BE-56 · POST /portal-sync/refresh visto desde HTTP, con las
 * rutas, el controlador y el limitador reales y un servicio falso. La base es
 * falsa y solo contesta token_version, y `mock.module` va antes de importar las
 * rutas. Alumnos del rango 93xx, porque el almacén del limitador es de módulo.
 */
mock.module("../../src/db/index.js", () => ({ db: { execute: async () => [{ token_version: 1 }] } }));

const { createPortalSyncRoutes } = await import("../../src/modules/portal-sync/portal-sync.routes.js");
const { PortalSyncController } = await import("../../src/modules/portal-sync/portal-sync.controller.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");
const { HttpError } = await import("../../src/shared/errors/http-error.js");

type Llamada = {
  userId: number; studentId: number; credentials: unknown; recibidaEn: number; rastro: { portalTocado: boolean };
};
const RESULTADO = {
  readAt: "2026-09-25T15:42:10.000Z",
  attendance: { updated: 5, skipped: 0, failed: 0, unavailable: 0 },
  grades: { read: 5, failed: 0, unavailable: 0, withValue: 0 },
  courses: [],
  view: { lastReadAt: null, courses: [] },
  warnings: [],
};
const llamadas: Llamada[] = [];
let respuesta: (e: Llamada) => Promise<unknown> = async () => RESULTADO;
const recarga = {
  refresh: async (e: Llamada) => {
    llamadas.push(e);
    return respuesta(e);
  },
};

const app = new Hono();
app.onError(errorHandler);
app.route("/portal-sync", createPortalSyncRoutes(new PortalSyncController({} as never, recarga as never)));

const VALIDO = { credentials: { password: "clave-sintetica", passcode: "123456" }, consent: true };
const token = (studentId: number) =>
  jwt.sign({ sub: "7", studentId, role: "student", tokenVersion: 1 }, config.auth.jwtSecret);
const post = (tok: string, cuerpo: unknown) => app.request("/portal-sync/refresh", {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
});

describe("POST /portal-sync/refresh", () => {
  test("200 con el resultado del servicio, Cache-Control no-store y el cupo que queda", async () => {
    respuesta = async () => RESULTADO;
    const res = await post(token(9301), VALIDO);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULTADO);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  test("la cuenta y el alumno salen del token, y el presupuesto cuenta desde que llega la petición", async () => {
    respuesta = async () => RESULTADO;
    const antes = Date.now();
    await post(token(9302), VALIDO);
    const despues = Date.now();
    const e = llamadas.at(-1)!;
    expect([e.userId, e.studentId]).toEqual([7, 9302]);
    expect(e.credentials).toEqual(VALIDO.credentials);
    expect(e.recibidaEn).toBeGreaterThanOrEqual(antes);
    expect(e.recibidaEn).toBeLessThanOrEqual(despues);
    expect(e.rastro).toEqual({ portalTocado: false });
  });

  test("un cuerpo inválido responde 400 sin llamar al servicio y devuelve el cupo", async () => {
    const previas = llamadas.length;
    const res = await post(token(9303), { ...VALIDO, consent: false });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_REQUEST_BODY");
    expect(llamadas.length).toBe(previas);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("5");
  });

  test("un JSON ilegible responde 400 INVALID_JSON_BODY", async () => {
    const res = await post(token(9304), "{no es json");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_JSON_BODY");
  });

  test("un token docente recibe 403", async () => {
    const docente = jwt.sign({ sub: "9", teacherId: 3, role: "teacher", tokenVersion: 1 }, config.auth.jwtSecret);
    expect((await post(docente, VALIDO)).status).toBe(403);
  });

  test("un rechazo del portal sale como 409, nunca 401, y devuelve el cupo", async () => {
    respuesta = async (e) => {
      e.rastro.portalTocado = true;
      throw new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED");
    };
    const res = await post(token(9305), VALIDO);
    expect(res.status).toBe(409);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("5");
  });

  test("el servicio marca el mismo rastro del limitador, y un 409 por cambio de ciclo no devuelve el cupo", async () => {
    respuesta = async (e) => {
      e.rastro.portalTocado = true;
      throw new HttpError(409, "La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.", "IMPORT_REQUIRED");
    };
    const res = await post(token(9307), VALIDO);
    expect(res.status).toBe(409);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  test("la respuesta nunca repite las credenciales", async () => {
    respuesta = async () => RESULTADO;
    const res = await post(token(9306), VALIDO);
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto).not.toContain("clave-sintetica");
    expect(texto).not.toContain("123456");
  });
});
