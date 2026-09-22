/**
 * time-blocks.logic.ts — Lógica pura de los bloques propios (RS-BE-33 y RS-BE-34).
 *
 * Sin base de datos, sin HTTP y sin `Date` con zona: todo son cadenas planas
 * "YYYY-MM-DD" y "HH:MM" en hora de Lima, horas de pared y no instantes. Las
 * cuentas de calendario van en UTC con `Date.UTC`, que es la única forma de
 * que el día no se corra según el huso del proceso: en Vercel es UTC y en la
 * Mac del equipo es Lima (UTC-5), donde `new Date("2026-09-21").getDay()`
 * devuelve 0 (domingo) para un lunes.
 */
import type {
  TimeBlockException,
  TimeBlockOccurrence,
  TimeBlockRule,
  TimeBlockWeekHours,
} from "./time-blocks.types.js";

/** Tope de la ventana de ocurrencias, en días (RS-BE-33). Lo hace cumplir el
 *  service; el número vive acá para que haya una sola fuente de verdad. */
export const WINDOW_MAX_DAYS = 120;

/** Extremos de la grilla que la app puede pintar (RS-BE-31, decisión 7). */
export const GRID_START = "07:00";
export const GRID_END = "22:00";

const MS_POR_DIA = 86_400_000;

/** "YYYY-MM-DD" → el instante UTC de esa medianoche. Se parte la cadena a
 *  mano en vez de `new Date(texto)` para no depender del parser del runtime. */
const utcDe = (date: string): number =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** Instante UTC → "YYYY-MM-DD". */
const textoDe = (utc: number): string => new Date(utc).toISOString().slice(0, 10);

/** Día de la semana con la convención del repo: 1 = lunes … 7 = domingo, la
 *  misma de `schedule_session.day_of_week`. `getUTCDay()` da 0 el domingo. */
export const dayOfWeekOf = (date: string): number =>
  ((new Date(utcDe(date)).getUTCDay() + 6) % 7) + 1;

/** Suma `n` días (puede ser negativo) sobre la fecha plana. */
export const addDays = (date: string, n: number): string => textoDe(utcDe(date) + n * MS_POR_DIA);

/** Lunes de la semana de `date`. El domingo pertenece a la semana que empezó
 *  el lunes anterior (RS-BE-34: las semanas van de lunes a domingo). */
export const mondayOf = (date: string): string => addDays(date, 1 - dayOfWeekOf(date));

/** "14:30" → 870. */
export const minutesOf = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Duración en horas decimales, sin redondear: "14:00"–"18:30" → 4.5. */
export const hoursBetween = (start: string, end: string): number =>
  (minutesOf(end) - minutesOf(start)) / 60;

/** Las dos horas entran en la grilla 07:00–22:00, bordes incluidos. */
export const withinGrid = (start: string, end: string): boolean =>
  minutesOf(start) >= minutesOf(GRID_START) && minutesOf(end) <= minutesOf(GRID_END);

/** Clave de una excepción: pertenece a un bloque y a una fecha concretos, así
 *  que dos bloques con excepción el mismo día no se pisan. */
const claveExcepcion = (blockId: number, date: string): string => `${blockId}|${date}`;

/**
 * RS-BE-33 — Expande las reglas a las ocurrencias concretas de [from, to].
 *
 * Recorre día a día desde max(from, rule.startDate) hasta min(to, rule.endDate)
 * —las cadenas "YYYY-MM-DD" se comparan bien en orden lexicográfico— e incluye
 * el día si `daysOfWeek` lo contiene. Después aplica la excepción de esa fecha:
 * `cancelled` omite el día y `moved` cambia las horas y marca `moved: true`.
 * Una excepción sobre una fecha que el patrón no genera nunca se consulta, así
 * que se ignora sola. El tope de la ventana lo hace cumplir el service antes
 * de llamar acá.
 *
 * El bucle avanza sobre el instante UTC y no sobre la cadena: un día después
 * del 9999-12-31, `addDays` imprime "+010000-01", que como texto es MENOR que
 * "9999-12-31", y un `for` que comparara cadenas no terminaría nunca.
 */
export const expandOccurrences = (
  rules: readonly TimeBlockRule[],
  exceptions: readonly TimeBlockException[],
  from: string,
  to: string,
): TimeBlockOccurrence[] => {
  const porBloqueYFecha = new Map<string, TimeBlockException>();
  for (const excepcion of exceptions) {
    porBloqueYFecha.set(claveExcepcion(excepcion.blockId, excepcion.date), excepcion);
  }

  const ocurrencias: TimeBlockOccurrence[] = [];
  for (const rule of rules) {
    const dias = new Set(rule.daysOfWeek);
    const primero = rule.startDate > from ? rule.startDate : from;
    const ultimo = rule.endDate < to ? rule.endDate : to;
    const fin = utcDe(ultimo);
    for (let instante = utcDe(primero); instante <= fin; instante += MS_POR_DIA) {
      const fecha = textoDe(instante);
      const dayOfWeek = dayOfWeekOf(fecha);
      if (!dias.has(dayOfWeek)) continue;

      const excepcion = porBloqueYFecha.get(claveExcepcion(rule.id, fecha));
      if (excepcion?.status === "cancelled") continue;

      let startTime = rule.startTime;
      let endTime = rule.endTime;
      let moved = false;
      // Una fila `moved` sin horas es imposible por `chk_time_block_exc_movido`;
      // si alguna llegara, el día se queda con el patrón en vez de romperse.
      if (
        excepcion !== undefined &&
        excepcion.status === "moved" &&
        excepcion.startTime !== null &&
        excepcion.endTime !== null
      ) {
        startTime = excepcion.startTime;
        endTime = excepcion.endTime;
        moved = true;
      }

      ocurrencias.push({
        blockId: rule.id,
        title: rule.title,
        colorHex: rule.colorHex,
        date: fecha,
        dayOfWeek,
        startTime,
        endTime,
        moved,
      });
    }
  }

  // Por fecha, por hora de inicio y, si empatan, por bloque: así el orden no
  // depende de en qué orden llegaron las reglas.
  return ocurrencias.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.blockId - b.blockId,
  );
};

/**
 * RS-BE-34 — Horas por semana, sumadas sobre las ocurrencias ya expandidas: un
 * día cancelado no está en la lista y no suma, y uno movido suma su duración
 * nueva. Las semanas van de lunes a domingo.
 *
 * Sale UNA entrada por cada semana que toca la ventana [from, to] —del lunes
 * de `from` al lunes de `to`, en orden—, también las que no tienen ninguna
 * ocurrencia, con `hours: 0`: la spec pide "una entrada por cada semana entre
 * el lunes de `from` y el lunes de `to`", y 0 es un total conocido, no un dato
 * que falta.
 *
 * Suma TODO lo que recibe de cada una de esas semanas (lo de fuera se ignora).
 * El total de la semana entera, que es lo que pide la spec, sale si quien
 * llama le pasa las semanas completas: el service expande del lunes de `from`
 * al domingo de la semana de `to` y recién después recorta las ocurrencias.
 *
 * Se acumulan minutos enteros y se divide una sola vez: sumar minutos/60 de a
 * uno da 7.000000000000001 para seis bloques de 70 minutos, y la app muestra
 * el número tal cual.
 */
export const weeklyHours = (
  occurrences: readonly TimeBlockOccurrence[],
  from: string,
  to: string,
): TimeBlockWeekHours[] => {
  const minutosPorSemana = new Map<string, number>();
  const ultimoLunes = utcDe(mondayOf(to));
  // Sobre el instante UTC y no sobre la cadena, por la misma razón que en
  // `expandOccurrences`. El Map conserva el orden de inserción: sale por lunes.
  for (let lunes = utcDe(mondayOf(from)); lunes <= ultimoLunes; lunes += 7 * MS_POR_DIA) {
    minutosPorSemana.set(textoDe(lunes), 0);
  }
  for (const ocurrencia of occurrences) {
    const weekStart = mondayOf(ocurrencia.date);
    const acumulado = minutosPorSemana.get(weekStart);
    if (acumulado === undefined) continue;
    minutosPorSemana.set(
      weekStart,
      acumulado + minutesOf(ocurrencia.endTime) - minutesOf(ocurrencia.startTime),
    );
  }
  return [...minutosPorSemana].map(([weekStart, minutos]) => ({ weekStart, hours: minutos / 60 }));
};
