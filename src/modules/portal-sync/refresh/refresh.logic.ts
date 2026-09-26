import { HttpError } from "../../../shared/errors/http-error.js";
import type {
  AgregadoUlima, AsistenciaIdentificada, AulaMenu, EvaluacionUlima,
} from "../portal-sync.types.js";
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

const PRECEDENCIA: readonly FalloPortal[] = [
  "PORTAL_SESSION_INVALID", "PORTAL_TIMEOUT", "PORTAL_UNAVAILABLE", "PORTAL_UNREADABLE",
];

const ERRORES: Record<FalloPortal, () => HttpError> = {
  PORTAL_SESSION_INVALID: () => new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID"),
  PORTAL_TIMEOUT: () => new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT"),
  PORTAL_UNAVAILABLE: () => new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"),
  PORTAL_UNREADABLE: () => new HttpError(502, "miUlima responde con páginas que ULima++ no sabe leer.", "PORTAL_UNREADABLE"),
};

/** RS-BE-56. El error HTTP de un fallo, con su mensaje fijo. */
export const errorDeFallo = (fallo: FalloPortal): HttpError => ERRORES[fallo]();

/** RS-BE-56. El error de una recarga sin ningún curso leído, por precedencia. */
export const errorSinCursos = (fallos: FalloPortal[]): HttpError =>
  errorDeFallo(PRECEDENCIA.find((f) => fallos.includes(f)) ?? "PORTAL_UNREADABLE");

/**
 * RS-BE-48, atribución. El curso y la sección de un aula salen, en este orden,
 * de los arreglos del menú, de la identificación verificada de su propia página
 * o de la de la misma aula en el otro panel. null si ninguna la da.
 */
export const parDeAula = (
  a: AulaMenu, propio: Map<string, AsistenciaIdentificada>, otro: Map<string, AsistenciaIdentificada>,
): AsistenciaIdentificada | null => {
  if (a.courseCode !== null && a.sectionCode !== null) return { courseCode: a.courseCode, sectionCode: a.sectionCode };
  return propio.get(a.aula) ?? otro.get(a.aula) ?? null;
};

/** Clave de un curso y su sección, para cruzar con las matrículas. */
export const clavePar = (p: { courseCode: string; sectionCode: string }): string => `${p.courseCode}|${p.sectionCode}`;

/** «de 690417/812» con curso conocido y «del aula 900101» sin él. Nunca `null`. */
export const deAula = (a: AulaMenu, par: AsistenciaIdentificada | null): string =>
  (par ? `de ${par.courseCode}/${par.sectionCode}` : `del aula ${a.aula}`);

/**
 * RS-BE-50, registro. Por fase, la duración en milisegundos, el número de
 * peticiones y sus estados HTTP. Nunca cuerpos, cookies, contraseña, código,
 * notas, nombres ni códigos de alumno: solo nombres de fase y números.
 */
export class RegistroFases {
  private readonly fases = new Map<string, { inicio: number; peticiones: number; estados: Record<string, number> }>();

  constructor(private readonly now: () => number, private readonly log: (linea: string) => void) {}

  empezar(fase: string): void {
    this.fases.set(fase, { inicio: this.now(), peticiones: 0, estados: {} });
  }

  anotar(fase: string, estado: string): void {
    const f = this.fases.get(fase);
    if (!f) return;
    f.peticiones++;
    f.estados[estado] = (f.estados[estado] ?? 0) + 1;
  }

  terminar(fase: string): void {
    const f = this.fases.get(fase);
    if (!f) return;
    this.log(`[portal-refresh] ${JSON.stringify({
      fase, ms: this.now() - f.inicio, peticiones: f.peticiones, estados: f.estados,
    })}`);
  }
}
