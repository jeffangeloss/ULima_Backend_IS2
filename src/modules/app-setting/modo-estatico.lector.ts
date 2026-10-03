/**
 * RF-IRM-2. Lector único del modo estático.
 *
 * Resuelve el modo en este orden. Primero la fila de `app_setting`, que lee la consulta
 * inyectada; si la consulta falla, tarda más que el tope o la fila no existe, el último valor
 * leído en el proceso; si no hay ninguno, el respaldo, que es la variable `MODO_ESTATICO`.
 * Recuerda el valor resuelto durante la vigencia, comparte una sola consulta entre peticiones
 * simultáneas y nunca lanza. No importa la base ni la configuración, así que las pruebas lo
 * construyen con dobles.
 */

/** Lee el modo que el backend aplica en esta petición. Nunca lanza. */
export type LectorDelModo = () => Promise<boolean>;

/** Devuelve `static_mode` de la fila de `app_setting`, o null si la fila no existe. Puede lanzar. */
export type ConsultaDelModo = () => Promise<boolean | null>;

export type OpcionesDelLector = {
  consultar: ConsultaDelModo;
  /** Valor de la variable `MODO_ESTATICO`, que rige si nunca se leyó la fila. */
  respaldo: boolean;
  /** Reloj en milisegundos. Las pruebas lo inyectan. */
  ahora?: () => number;
  /** Cuánto rige un valor resuelto antes de volver a consultar. */
  vigenciaMs?: number;
  /** Cuánto espera la consulta antes de darse por fallida. */
  topeMs?: number;
};

/** RF-IRM-2 y RF-IRM-5. Un cambio de la fila rige a más tardar 10 s después. */
export const VIGENCIA_DEL_MODO_MS = 10_000;

/** El mismo tope de la consulta de la app, para que una base colgada no retenga las peticiones. */
export const TOPE_DE_LA_CONSULTA_MS = 5_000;

const conTope = <T>(promesa: Promise<T>, topeMs: number): Promise<T> => {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_resolver, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error("La consulta del modo superó su tope.")), topeMs);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
};

export const crearLectorDelModo = ({
  consultar,
  respaldo,
  ahora = Date.now,
  vigenciaMs = VIGENCIA_DEL_MODO_MS,
  topeMs = TOPE_DE_LA_CONSULTA_MS,
}: OpcionesDelLector): LectorDelModo => {
  let ultimoLeido: boolean | null = null;
  let vigente: { valor: boolean; hasta: number } | null = null;
  let enCurso: Promise<boolean> | null = null;

  const resolver = async (): Promise<boolean> => {
    try {
      const fila = await conTope(Promise.resolve().then(consultar), topeMs);
      if (typeof fila === "boolean") {
        ultimoLeido = fila;
        return fila;
      }
    } catch {
      // La base no respondió. Rige el último valor leído o, si no hay, el respaldo.
    }
    return ultimoLeido ?? respaldo;
  };

  return () => {
    if (vigente !== null && ahora() < vigente.hasta) return Promise.resolve(vigente.valor);
    enCurso ??= resolver().then((valor) => {
      vigente = { valor, hasta: ahora() + vigenciaMs };
      enCurso = null;
      return valor;
    });
    return enCurso;
  };
};

/** Lector con un valor fijo, para las pruebas que montan las rutas en un solo modo. */
export const modoFijo = (valor: boolean): LectorDelModo => () => Promise.resolve(valor);
