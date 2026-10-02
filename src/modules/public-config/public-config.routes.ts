import { Hono } from "hono";
import type { LectorDelModo } from "../app-setting/modo-estatico.lector.js";

/**
 * RF-IRM-4. `GET /config`, pública y sin token, responde `{"modoEstatico":<bool>}` con el valor
 * del mismo lector que aplican las rutas, así que siempre informa el modo que el backend aplica.
 * Lleva `Cache-Control: no-store` porque un interruptor tiene que verse en cuanto cambia. Solo
 * declara GET, y como Hono atiende HEAD con este mismo handler, lo corta con un 404 para que
 * ningún otro método responda 200.
 */
export const createPublicConfigRoutes = (leerModo: LectorDelModo) => {
  const app = new Hono();

  app.get("/", async (c) => {
    if (c.req.method === "HEAD") return c.notFound();
    const modoEstatico = await leerModo();
    c.header("Cache-Control", "no-store");
    return c.json({ modoEstatico });
  });

  return app;
};
