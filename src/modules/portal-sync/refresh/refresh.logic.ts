import { HttpError } from "../../../shared/errors/http-error.js";
import type { AgregadoUlima, EvaluacionUlima } from "../portal-sync.types.js";
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

/** RS-BE-53, punto 7. Suma ponderada de las notas, con los pesos absolutos de la ULima. */
export const sumaPonderada = (evs: EvaluacionUlima[]): number =>
  evs.reduce((suma, e) => suma + (e.value ?? 0) * e.weight / 100, 0);

/**
 * RS-BE-53, punto 7. Cuando todas las hojas tienen nota y el agregado PROM vale
 * más que 0, la suma ponderada no puede diferir de él en más de 0,5. Si
 * difiere, el servicio avisa PORTAL_AVERAGE_MISMATCH y guarda igual.
 */
export const promedioNoCuadra = (evs: EvaluacionUlima[], agregados: AgregadoUlima[]): boolean => {
  const promedio = agregados.find((a) => a.clave === "PROM")?.valor ?? null;
  if (promedio === null || promedio <= 0) return false;
  if (!evs.length || !evs.every((e) => e.mark === "graded")) return false;
  return Math.abs(sumaPonderada(evs) - promedio) > 0.5;
};
