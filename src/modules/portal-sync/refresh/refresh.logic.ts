import { HttpError } from "../../../shared/errors/http-error.js";
import type { FalloPortal } from "./refresh.types.js";

/**
 * Piezas puras de la recarga (recarga-portal.spec.md).
 */

/** RS-BE-50. Nunca más de cinco peticiones simultáneas sobre la misma sesión del portal. */
export const TOPE_EN_VUELO = 5;

/** Corre `tarea(0)` a `tarea(n - 1)` con a lo sumo `tope` en vuelo y devuelve los resultados en orden. */
export const conTope = async <T>(tope: number, n: number, tarea: (i: number) => Promise<T>): Promise<T[]> => {
  const resultados = new Array<T>(n);
  let siguiente = 0;
  const trabajador = async (): Promise<void> => {
    while (siguiente < n) {
      const i = siguiente++;
      resultados[i] = await tarea(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(tope, n) }, trabajador));
  return resultados;
};

/** RS-BE-56. El fallo de una petición que no llegó, según el error del cliente. */
export const falloDe = (e: unknown): FalloPortal => {
  const code = e instanceof HttpError ? e.code : "";
  return code === "PORTAL_SESSION_INVALID" || code === "PORTAL_TIMEOUT" ? code : "PORTAL_UNAVAILABLE";
};
