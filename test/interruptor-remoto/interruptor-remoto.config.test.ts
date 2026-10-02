import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { modoFijo, type LectorDelModo } from "../../src/modules/app-setting/modo-estatico.lector.js";
import { createPublicConfigRoutes } from "../../src/modules/public-config/public-config.routes.js";
import { errorHandler } from "../../src/shared/middleware/error-handler.js";

/**
 * RF-IRM-4. `GET /config` responde sin token el modo que da el lector, con `no-store`, y ningún
 * otro método responde 200, ni siquiera `HEAD`, que Hono atiende con el handler de `GET`. Las
 * rutas no importan la base, así que no hace falta simularla.
 */
const montar = (leerModo: LectorDelModo) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/config", createPublicConfigRoutes(leerModo));
  return app;
};

describe("GET /config (RF-IRM-4)", () => {
  test.each([true, false])("con el modo en %p responde 200, el cuerpo exacto y no-store", async (valor) => {
    const res = await montar(modoFijo(valor)).request("/config");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(JSON.stringify({ modoEstatico: valor }));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("no pide token y responde igual con una cabecera Authorization", async () => {
    const app = montar(modoFijo(true));
    const sinToken = await app.request("/config");
    const conToken = await app.request("/config", { headers: { Authorization: "Bearer cualquiera" } });
    expect([sinToken.status, await sinToken.text()]).toEqual([200, '{"modoEstatico":true}']);
    expect([conToken.status, await conToken.text()]).toEqual([200, '{"modoEstatico":true}']);
  });

  test.each(["HEAD", "POST", "PUT", "PATCH", "DELETE"])("%s /config responde 404", async (metodo) => {
    const res = await montar(modoFijo(true)).request("/config", { method: metodo });
    expect(res.status).toBe(404);
  });

  test("consulta el lector en cada petición y sigue un cambio sin volver a montar", async () => {
    let estatico = true;
    let lecturas = 0;
    const app = montar(async () => {
      lecturas++;
      return estatico;
    });
    expect(await (await app.request("/config")).json()).toEqual({ modoEstatico: true });
    estatico = false;
    expect(await (await app.request("/config")).json()).toEqual({ modoEstatico: false });
    expect(lecturas).toBe(2);
  });
});

describe("cableado de /config (RF-IRM-4)", () => {
  test("src/modules/index.ts monta el módulo en /config", async () => {
    const texto = await Bun.file("src/modules/index.ts").text();
    expect(texto).toContain('import { publicConfigRoutes } from "./public-config/index.js";');
    expect(texto).toContain('app.route("/config", publicConfigRoutes);');
  });

  test("el módulo solo depende del lector, nunca de la base ni de la configuración", async () => {
    for (const archivo of ["src/modules/public-config/index.ts", "src/modules/public-config/public-config.routes.ts"]) {
      const texto = await Bun.file(archivo).text();
      expect([archivo, texto.includes("db/index"), texto.includes("app-config")]).toEqual([archivo, false, false]);
    }
    expect(await Bun.file("src/modules/public-config/index.ts").text()).toContain(
      'import { modoEstatico } from "../app-setting/index.js";',
    );
  });
});
