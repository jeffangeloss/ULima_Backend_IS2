import { Hono } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";

/**
 * RF-EST-3. Router de `/portal-sync` para el modo estático: toda ruta, con cualquier
 * método y con o sin sesión, responde 503 PORTAL_DESACTIVADO sin ejecutar lógica alguna.
 * No importa servicios, repositorios ni el cliente del portal, así que no puede llegar a la
 * Universidad de Lima.
 */
export const createPortalSyncDesactivadoRoutes = () => {
  const app = new Hono();
  app.all("*", () => {
    throw new HttpError(
      503,
      "Esta versión de ULima++ no se conecta con la Universidad de Lima.",
      "PORTAL_DESACTIVADO",
    );
  });
  return app;
};

/**
 * Elige el router de `/portal-sync` según el interruptor. Con `true` devuelve el
 * desactivado y no invoca `rutasActivas`, de modo que no se construye ningún servicio del
 * portal. Con `false` devuelve el router activo tal cual.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rutas = Hono<any, any, any>;

export const elegirRutasPortalSync = (modoEstatico: boolean, rutasActivas: () => Rutas): Rutas =>
  modoEstatico ? createPortalSyncDesactivadoRoutes() : rutasActivas();
