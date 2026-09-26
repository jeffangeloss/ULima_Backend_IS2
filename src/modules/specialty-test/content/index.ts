/**
 * RS-BE-37 · Registro de las versiones del contenido del test.
 *
 * Cada versión es un archivo JSON de esta carpeta, con el nombre igual a su
 * campo `version`, que genera `scripts/specialty-test/generar.py` y que nadie
 * edita a mano. Se importan de forma estática, con el atributo `type: "json"`,
 * para que `tsc` los copie a `dist/` y el empaquetado de Vercel los incluya:
 * no se lee el disco en tiempo de ejecución.
 *
 * Agregar una versión es sumar su `import` y su fila en `CONTENT_BY_VERSION`,
 * y mover `CURRENT_VERSION` si pasa a ser la vigente. Retirarla es sacarla del
 * mapa, y desde ahí `POST /specialty-test/me/evaluate` responde
 * `409 SPECIALTY_TEST_VERSION_OUTDATED`.
 */
import type { ContentRegistry, SpecialtyTestContent } from "../specialty-test.types.js";
import v2026_09_25_4 from "./2026-09-25.4.json" with { type: "json" };

export const CURRENT_VERSION = "2026-09-25.4";

export const CONTENT_BY_VERSION: ReadonlyMap<string, SpecialtyTestContent> = new Map([
  ["2026-09-25.4", v2026_09_25_4 as unknown as SpecialtyTestContent],
]);

export const CONTENT_REGISTRY: ContentRegistry = {
  currentVersion: CURRENT_VERSION,
  byVersion: CONTENT_BY_VERSION,
};
