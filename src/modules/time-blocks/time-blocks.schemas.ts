/**
 * Zod de los bloques propios (RS-BE-31, RS-BE-32 y RS-BE-33). Zod v3
 * (`package.json:40`).
 *
 * Acá vive solo lo que se decide mirando la petición: el formato de cada campo
 * y las reglas que cruzan campos de la misma petición (horas, fechas, días
 * repetidos, días que caen en el rango, orden de la ventana), que la spec pone
 * bajo "Validación con Zod" sin código propio. Las reglas de negocio —grilla,
 * tope de bloques, pertenencia, patrón y ancho de la ventana— viven en el
 * service, con los códigos de error que fija la spec.
 *
 * El regex de la hora se declara una vez, en `HORA`, y lo usan los cuatro
 * campos de hora. Sale de `teacher.schemas.ts:6-7`, el esquema de escritura
 * que ya existe en el repo, sin los segundos opcionales: en este módulo la hora
 * es "HH:MM" y nada más, porque así viaja en el contrato y así la guarda el
 * repository.
 */
import { z } from "zod";
import { addDays, dayOfWeekOf } from "./time-blocks.logic.js";

/** Forma "YYYY-MM-DD". Solo la forma: si la fecha existe lo mira `fecha`. */
const FORMA_DE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Hora "HH:MM" de 00:00 a 23:59, siempre con dos dígitos. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Rango de fechas del módulo. Un horario de prácticas no necesita otro siglo. */
const PRIMERA_FECHA = "2000-01-01";
const ULTIMA_FECHA = "2099-12-31";

/** Tope de un `integer` de Postgres, el tipo de `student_time_block.id`. */
const MAX_ID = 2147483647;

/**
 * Una fecha plana que además existe en el calendario y cae entre 2000 y 2099.
 * El regex solo no basta: "2026-02-30" lo cumple, y llegaría como
 * `${fecha}::date` al repository (Tarea 3), donde Postgres responde 22008 y el
 * `errorHandler` lo vuelve un 500 por un error del formulario.
 * `addDays(valor, 0)` rearma la fecha con `Date.UTC` y la reimprime
 * —"2026-02-30" vuelve como "2026-03-02"—, así que una fecha que no existe no
 * coincide consigo misma.
 *
 * El rango cierra otra puerta: Postgres acepta el 9999-12-31, y un día después
 * `addDays` imprime "+010000-01"; con un bloque hasta ahí, la expansión de las
 * semanas completas (Tarea 4, `occurrences`) pasaría de ese día.
 *
 * El `test` del regex va primero y corta: a `addDays` nunca le llega una cadena
 * sin dígitos, que `toISOString()` no sabe imprimir (RangeError) y haría
 * explotar el `safeParse` en vez de devolver `success: false`. Con la forma ya
 * comprobada, comparar el texto contra el rango es comparar fechas.
 */
const esFecha = (valor: string): boolean =>
  FORMA_DE_FECHA.test(valor) &&
  valor >= PRIMERA_FECHA &&
  valor <= ULTIMA_FECHA &&
  addDays(valor, 0) === valor;

const fecha = z.string().refine(esFecha, "Fecha inválida (YYYY-MM-DD).");

/** De 1 (lunes) a 7 (domingo), entre uno y siete. Que no se repitan lo mira un
 *  `refine` del cuerpo, con su propio mensaje. */
const diasDeLaSemana = z.array(z.number().int().min(1).max(7)).min(1).max(7);

/**
 * Entre `desde` y `hasta`, bordes incluidos, cae al menos una fecha de alguno
 * de los días marcados (RS-BE-31). Si no, el bloque se guardaría y nunca
 * ocurriría: `expandOccurrences` no generaría ninguna fecha y la grilla no lo
 * pintaría. La cuenta es la de la expansión —`dayOfWeekOf` sobre cada fecha
 * contra el `Set` de los días—, así que "válido" es "tiene al menos una
 * ocurrencia".
 *
 * Siete días seguidos pasan por los siete días de la semana, así que un rango
 * así siempre cumple; uno más corto se recorre, con seis fechas como mucho.
 * Quien llama le pasa fechas que ya cumplen `esFecha` (2000–2099) y en orden,
 * así que comparar el texto es comparar fechas.
 */
const caeAlgunDiaMarcado = (dias: readonly number[], desde: string, hasta: string): boolean => {
  if (addDays(desde, 6) <= hasta) return true;
  const marcados = new Set(dias);
  for (let dia = desde; dia <= hasta; dia = addDays(dia, 1)) {
    if (marcados.has(dayOfWeekOf(dia))) return true;
  }
  return false;
};

export const timeBlockBodySchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color inválido."),
    daysOfWeek: diasDeLaSemana,
    startTime: z.string().regex(HORA, "Hora de inicio inválida (HH:MM)."),
    endTime: z.string().regex(HORA, "Hora de fin inválida (HH:MM)."),
    startDate: fecha,
    endDate: fecha,
  })
  // Las reglas de RS-BE-31 que cruzan campos del mismo body. Van acá
  // y no en el service porque la spec las pone bajo "Validación con Zod" sin
  // código propio: su error es del formulario —400 INVALID_REQUEST_BODY, el que
  // ya lanza `validateJson`—. TIME_BLOCK_OUT_OF_GRID es solo de la grilla.
  // Las horas "HH:MM" del regex van siempre en dos dígitos, así que el orden
  // alfabético es el del reloj.
  .refine((body) => body.endTime > body.startTime, {
    message: "La hora de fin tiene que ser mayor que la de inicio.",
    path: ["endTime"],
  })
  .refine((body) => body.endDate >= body.startDate, {
    message: "La fecha de fin no puede ser anterior a la de inicio.",
    path: ["endDate"],
  })
  .refine((body) => new Set(body.daysOfWeek).size === body.daysOfWeek.length, {
    message: "Los días de la semana no se pueden repetir.",
    path: ["daysOfWeek"],
  })
  // La cuarta regla que cruza campos: el rango tiene que traer alguno de los
  // días marcados. Solo se mira cuando lo que lee ya pasó su forma y las fechas
  // están en orden, y eso lo comprueba ella misma: en Zod 3 un campo que falla
  // un chequeo deja el objeto "dirty", no "aborted", y los `refine` del objeto
  // corren igual. Sin la guarda, una fecha que no existe o unos días fuera de
  // 1–7 sumarían un error falso, una fecha sin dígitos haría lanzar a `addDays`
  // (RangeError, un 500) y con las fechas al revés saldrían dos errores en vez
  // de uno. El error va en `endDate`, junto al de las fechas al revés: lo que
  // corrige al alumno es estirar "Hasta". Los días repetidos no la frenan, a
  // propósito (RS-BE-31): la cuenta usa un `Set`, [2, 2] cuenta como [2], y los
  // dos errores son ciertos.
  .refine(
    (body) =>
      !esFecha(body.startDate) ||
      !esFecha(body.endDate) ||
      !diasDeLaSemana.safeParse(body.daysOfWeek).success ||
      body.endDate < body.startDate ||
      caeAlgunDiaMarcado(body.daysOfWeek, body.startDate, body.endDate),
    {
      message: "Entre esas fechas no cae ninguno de los días que marcaste.",
      path: ["endDate"],
    },
  );

/** El cuerpo ya validado. Es estructuralmente `TimeBlockInput`, así que el
 *  controller (Tarea 5) se lo pasa al service tal cual; `tsc` lo comprueba ahí,
 *  en la llamada. */
export type TimeBlockBody = z.infer<typeof timeBlockBodySchema>;

export const exceptionBodySchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }),
    z.object({
      status: z.literal("moved"),
      startTime: z.string().regex(HORA, "Hora de inicio inválida (HH:MM)."),
      endTime: z.string().regex(HORA, "Hora de fin inválida (HH:MM)."),
    }),
  ])
  // El orden de las horas del `moved` (RS-BE-32 remite a las validaciones de
  // RS-BE-31). Va sobre la unión entera y no con `.refine` en el miembro: en
  // Zod 3 `discriminatedUnion` solo acepta `ZodObject`, y un miembro con
  // `.refine` es `ZodEffects`.
  .superRefine((body, ctx) => {
    if (body.status === "moved" && body.endTime <= body.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La hora de fin tiene que ser mayor que la de inicio.",
        path: ["endTime"],
      });
    }
  });

export type ExceptionInput = z.infer<typeof exceptionBodySchema>;

/** El `:id` es un id de BLOQUE y tiene que caber en el `integer` de la
 *  columna: un "3000000000" pasaría `.positive()` y Postgres respondería 22003
 *  (un 500) al compararlo en el `where`. */
export const blockIdParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_ID),
});

/** `:date` también pasa por `fecha`: el `DELETE` de una excepción no exige que
 *  la fecha esté en el patrón, así que sin esto "2026-02-30" llegaría a
 *  `deleteException` y a Postgres. */
export const occurrenceParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_ID),
  date: fecha,
});

/** La ventana es obligatoria (RS-BE-33): sin `from` o sin `to`, 400. Las dos
 *  pasan por `fecha` porque la expansión arranca en `from`: un "2026-02-30"
 *  saldría como ocurrencia y se comería el lunes 2026-03-02. Una ventana al
 *  revés es una query mal armada (400 INVALID_QUERY_PARAMS): la spec reserva
 *  TIME_BLOCK_WINDOW_TOO_WIDE para los 120 días, que mira el service. */
export const windowQuerySchema = z
  .object({
    from: fecha,
    to: fecha,
  })
  .refine((ventana) => ventana.to >= ventana.from, {
    message: "La ventana no puede terminar antes de empezar.",
    path: ["to"],
  });
