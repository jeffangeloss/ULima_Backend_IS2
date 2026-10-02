import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import jwt from "jsonwebtoken";

/**
 * RF-EST-4. Con el modo estático activo ninguna petición llega a un método de
 * `PortalClient`. El cliente es el real, envuelto en un espía que cuenta cada método
 * invocado, y su `fetch` es otro espía que contaría cualquier salida a la red. El
 * montaje repite el de producción con el interruptor en `true`: el registrador no se
 * instala en `AuthService` y `/portal-sync` pasa por `elegirRutasPortalSync`. La base es
 * falsa y solo contesta `token_version`, que es lo único que pregunta el middleware de
 * sesión.
 */
mock.module("../../src/db/index.js", () => ({ db: { execute: async () => [{ token_version: 1 }] } }));

const { PortalClient } = await import("../../src/services/portal.client.js");
const { AuthService } = await import("../../src/modules/auth/auth.service.js");
const { AuthController } = await import("../../src/modules/auth/auth.controller.js");
const { createAuthRoutes } = await import("../../src/modules/auth/auth.routes.js");
const { PortalSyncService } = await import("../../src/modules/portal-sync/portal-sync.service.js");
const { PortalSyncController } = await import("../../src/modules/portal-sync/portal-sync.controller.js");
const { createPortalSyncRoutes } = await import("../../src/modules/portal-sync/portal-sync.routes.js");
const { elegirRutasPortalSync } = await import("../../src/modules/portal-sync/portal-sync-desactivado.routes.js");
const { PortalRefreshService } = await import("../../src/modules/portal-sync/refresh/refresh.service.js");
const { PortalLoginGuard } = await import("../../src/modules/portal-sync/portal-login-guard.js");
const { EventBus } = await import("../../src/events/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

type Registro = { metodo: string }[];

const fabricarEspia = () => {
  const metodos: Registro = [];
  const fetchEspia = mock(async () => new Response("", { status: 500 }));
  const real = new PortalClient("https://webaloe.ulima.edu.pe", 1000, fetchEspia as unknown as typeof fetch);
  const cliente = new Proxy(real, {
    get(destino, nombre, receptor) {
      const valor = Reflect.get(destino, nombre, receptor);
      if (typeof valor !== "function") return valor;
      return (...args: unknown[]) => {
        metodos.push({ metodo: String(nombre) });
        return valor.apply(destino, args);
      };
    },
  });
  return { cliente, metodos, fetchEspia };
};

/** Dependencia que falla en voz alta si alguien la usa: en modo estático no se construye nada. */
const prohibida = (nombre: string) =>
  new Proxy({}, { get: () => { throw new Error(`${nombre} no debía usarse en modo estático`); } });

const montarComoEnProduccion = (modoEstatico: boolean) => {
  const { cliente, metodos, fetchEspia } = fabricarEspia();
  const authService = new AuthService(
    prohibida("AuthRepository") as never,
    new EventBus(),
    undefined,
    prohibida("PortalSyncRepository") as never,
    cliente,
  );
  let serviciosConstruidos = 0;
  const rutasActivas = () => {
    serviciosConstruidos++;
    const repo = prohibida("PortalSyncRepository") as never;
    const sync = new PortalSyncService(repo, cliente, authService, new PortalLoginGuard());
    const recarga = new PortalRefreshService({
      repository: prohibida("PortalRefreshRepository") as never,
      client: cliente,
      guard: new PortalLoginGuard(),
      leerVista: async () => ({ lastReadAt: null, courses: [] }),
      budgetMs: 60_000,
    });
    authService.setRegistrar(sync);
    return createPortalSyncRoutes(new PortalSyncController(sync, recarga));
  };

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/auth", createAuthRoutes(new AuthController(authService), { registroCerrado: modoEstatico }));
  app.route("/portal-sync", elegirRutasPortalSync(modoEstatico, rutasActivas));
  return { app, metodos, fetchEspia, construidos: () => serviciosConstruidos };
};

const token = jwt.sign({ sub: "7", studentId: 9401, role: "student", tokenVersion: 1 }, config.auth.jwtSecret);
const conSesion = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const credenciales = { credentials: { password: "clave-sintetica", passcode: "123456" }, consent: true };

describe("modo estático y PortalClient (RF-EST-4)", () => {
  test("el espía cuenta de verdad: una llamada directa al cliente queda registrada", async () => {
    const { cliente, metodos, fetchEspia } = fabricarEspia();
    await cliente.login("20230000", "clave-sintetica", "123456").catch(() => undefined);
    expect(metodos.length).toBeGreaterThan(0);
    expect(fetchEspia).toHaveBeenCalled();
  });

  test("ninguna ruta afectada toca el cliente ni la red, con y sin sesión", async () => {
    const { app, metodos, fetchEspia, construidos } = montarComoEnProduccion(true);

    const peticiones: Array<[string, string, Record<string, string>, unknown]> = [
      ["POST", "/auth/register", { "Content-Type": "application/json" },
        { code: "20239901", portalPassword: "clave-portal-sintetica", passcode: "123456", password: "clave-nueva-sintetica" }],
      ["POST", "/auth/register", { "Content-Type": "application/json" }, { code: "20239902" }],
      ["POST", "/portal-sync/import", conSesion, credenciales],
      ["POST", "/portal-sync/import", { "Content-Type": "application/json" }, credenciales],
      ["POST", "/portal-sync/refresh", conSesion, credenciales],
      ["GET", "/portal-sync/status", conSesion, undefined],
      ["GET", "/portal-sync/otra-ruta", conSesion, undefined],
    ];
    const estados: number[] = [];
    for (const [metodo, ruta, headers, cuerpo] of peticiones) {
      const res = await app.request(ruta, {
        method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      estados.push(res.status);
    }

    expect(estados).toEqual(Array(peticiones.length).fill(503));
    expect(metodos).toEqual([]);
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(construidos()).toBe(0);
  });

  test("sin el registrador, AuthService.register cierra por su cuenta con REGISTRATION_UNAVAILABLE", async () => {
    const { cliente, metodos } = fabricarEspia();
    const servicio = new AuthService(prohibida("AuthRepository") as never, new EventBus(), undefined, prohibida("PortalSyncRepository") as never, cliente);
    const controlador = new AuthController(servicio);
    const app = new Hono();
    app.onError(errorHandler);
    app.route("/auth", createAuthRoutes(controlador));
    const res = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "20239903", portalPassword: "clave-portal-sintetica", passcode: "123456", password: "clave-nueva-sintetica" }),
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("REGISTRATION_UNAVAILABLE");
    expect(metodos).toEqual([]);
  });

  test("con el modo apagado se construye el router activo (el montaje de contraste)", () => {
    const { construidos } = montarComoEnProduccion(false);
    expect(construidos()).toBe(1);
  });
});
