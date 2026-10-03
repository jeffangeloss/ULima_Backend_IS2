import { Hono } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import type { LectorDelModo } from "../app-setting/modo-estatico.lector.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rutas = Hono<any, any, any>;

/**
 * RF-EST-3 y RF-IRM-3. Router de `/portal-sync` con una guarda que consulta el lector del modo
 * en cada petición. En modo estático toda ruta, con cualquier método y con o sin sesión,
 * responde 503 PORTAL_DESACTIVADO antes del middleware de sesión, de los limitadores y de
 * cualquier lógica, así que ninguna petición llega a `PortalClient` (RF-EST-4). En modo dinámico
 * la petición sigue a `rutasActivas` tal cual.
 */
export const protegerRutasPortalSync = (leerModo: LectorDelModo, rutasActivas: Rutas): Rutas => {
  const app = new Hono();
  app.use("*", async (_c, next) => {
    if (await leerModo()) {
      throw new HttpError(
        503,
        "Esta versión de ULima++ no se conecta con la Universidad de Lima.",
        "PORTAL_DESACTIVADO",
      );
    }
    await next();
  });
  app.route("/", rutasActivas);
  return app;
};
