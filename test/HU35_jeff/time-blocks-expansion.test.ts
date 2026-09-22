import { describe, expect, test } from "bun:test";
import {
  GRID_END,
  GRID_START,
  WINDOW_MAX_DAYS,
  addDays,
  dayOfWeekOf,
  expandOccurrences,
  hoursBetween,
  minutesOf,
  mondayOf,
  weeklyHours,
  withinGrid,
} from "../../src/modules/time-blocks/time-blocks.logic.js";
import type {
  TimeBlockException,
  TimeBlockOccurrence,
  TimeBlockRule,
} from "../../src/modules/time-blocks/time-blocks.types.js";

// RS-BE-33 y RS-BE-34 — Expansión de ocurrencias y horas por semana.
// Reglas inventadas del alumno sintético 20230001: ningún dato real.
//
// Calendario de referencia (2026):
//   lu 21-09  ma 22-09  mi 23-09  ju 24-09  vi 25-09  sa 26-09  do 27-09
//   lu 28-09  ma 29-09  mi 30-09  ju 01-10  vi 02-10  sa 03-10  do 04-10
//   lu 05-10 … lu 12-10 … lu 19-10  ma 20-10  mi 21-10

/** Lunes y miércoles de 14:00 a 18:00, del miércoles 23-09 al martes 20-10. */
const PRACTICAS: TimeBlockRule = {
  id: 12,
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-23",
  endDate: "2026-10-20",
};

/** Solo miércoles, de 08:00 a 10:00: se cruza con PRACTICAS el mismo día. */
const VOLUNTARIADO: TimeBlockRule = {
  id: 7,
  title: "Voluntariado",
  colorHex: "#2E7D32",
  daysOfWeek: [3],
  startTime: "08:00",
  endTime: "10:00",
  startDate: "2026-09-23",
  endDate: "2026-10-20",
};

const cancelado = (blockId: number, date: string): TimeBlockException => ({
  blockId,
  date,
  status: "cancelled",
  startTime: null,
  endTime: null,
});

const movido = (
  blockId: number,
  date: string,
  startTime: string,
  endTime: string,
): TimeBlockException => ({ blockId, date, status: "moved", startTime, endTime });

/** Una ocurrencia en una línea: "2026-09-23 14:00-18:00 #12" (+ " movido"). */
const resumen = (ocurrencias: readonly TimeBlockOccurrence[]): string[] =>
  ocurrencias.map(
    (o) => `${o.date} ${o.startTime}-${o.endTime} #${o.blockId}${o.moved ? " movido" : ""}`,
  );

/** La ventana completa del caso base: lunes 21-09 a domingo 25-10. */
const VENTANA = { from: "2026-09-21", to: "2026-10-25" };

/** Las ocho ocurrencias de PRACTICAS en VENTANA, sin ninguna excepción. */
const OCHO_DIAS = [
  "2026-09-23 14:00-18:00 #12",
  "2026-09-28 14:00-18:00 #12",
  "2026-09-30 14:00-18:00 #12",
  "2026-10-05 14:00-18:00 #12",
  "2026-10-07 14:00-18:00 #12",
  "2026-10-12 14:00-18:00 #12",
  "2026-10-14 14:00-18:00 #12",
  "2026-10-19 14:00-18:00 #12",
];

describe("helpers de fecha y hora", () => {
  test("dayOfWeekOf usa 1 lunes y 7 domingo, y no se corre por el huso", () => {
    // En Lima (UTC-5) `new Date("2026-09-21").getDay()` da 0: el lunes se lee
    // como domingo. Estas cuatro fechas fijan que eso no pase.
    expect(dayOfWeekOf("2026-09-21")).toBe(1);
    expect(dayOfWeekOf("2026-09-26")).toBe(6);
    expect(dayOfWeekOf("2026-09-27")).toBe(7);
    expect(dayOfWeekOf("2026-10-20")).toBe(2);
  });

  test("addDays cruza fin de mes, fin de anio y anio bisiesto", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-09-21", 0)).toBe("2026-09-21");
  });

  test("mondayOf devuelve el lunes y el domingo cae en la semana anterior", () => {
    expect(mondayOf("2026-09-21")).toBe("2026-09-21");
    expect(mondayOf("2026-09-23")).toBe("2026-09-21");
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
    expect(mondayOf("2026-10-02")).toBe("2026-09-28");
  });

  test("minutesOf y hoursBetween no redondean", () => {
    expect(minutesOf("14:30")).toBe(870);
    expect(minutesOf("07:00")).toBe(420);
    expect(minutesOf("22:00")).toBe(1320);
    expect(hoursBetween("14:00", "18:30")).toBe(4.5);
    expect(hoursBetween("08:00", "10:00")).toBe(2);
    expect(hoursBetween("09:15", "10:00")).toBe(0.75);
  });

  test("withinGrid acepta los bordes de la grilla y rechaza lo de afuera", () => {
    expect(GRID_START).toBe("07:00");
    expect(GRID_END).toBe("22:00");
    expect(WINDOW_MAX_DAYS).toBe(120);
    expect(withinGrid("07:00", "22:00")).toBe(true);
    expect(withinGrid("14:00", "18:00")).toBe(true);
    expect(withinGrid("06:59", "10:00")).toBe(false);
    expect(withinGrid("20:00", "22:01")).toBe(false);
  });
});

describe("expandOccurrences", () => {
  test("un bloque que empieza a mitad de semana no genera los dias previos", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to);
    // El lunes 21-09 cae en la ventana y es día del patrón, pero es anterior
    // al startDate: la primera semana solo trae el miércoles.
    expect(resumen(ocurrencias)).toEqual(OCHO_DIAS);
    expect(ocurrencias[0]?.date).toBe("2026-09-23");
    expect(ocurrencias[0]?.dayOfWeek).toBe(3);
    expect(resumen(ocurrencias)).not.toContain("2026-09-21 14:00-18:00 #12");
  });

  test("un rango que termina un martes no genera el miercoles siguiente", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to);
    expect(ocurrencias.at(-1)?.date).toBe("2026-10-19");
    expect(ocurrencias.map((o) => o.date)).not.toContain("2026-10-21");
  });

  test("una ventana que no toca el rango del bloque devuelve lista vacia", () => {
    expect(expandOccurrences([PRACTICAS], [], "2026-11-02", "2026-11-08")).toEqual([]);
    expect(expandOccurrences([PRACTICAS], [], "2026-08-01", "2026-08-31")).toEqual([]);
  });

  test("la ventana recorta el rango del bloque por los dos lados", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], "2026-09-30", "2026-10-07");
    expect(resumen(ocurrencias)).toEqual([
      "2026-09-30 14:00-18:00 #12",
      "2026-10-05 14:00-18:00 #12",
      "2026-10-07 14:00-18:00 #12",
    ]);
  });

  test("un dia cancelado no aparece", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [cancelado(12, "2026-10-07")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(ocurrencias).toHaveLength(7);
    expect(ocurrencias.map((o) => o.date)).not.toContain("2026-10-07");
  });

  test("un dia movido aparece con sus horas nuevas y moved true", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [movido(12, "2026-10-12", "15:00", "19:30")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(ocurrencias).toHaveLength(8);
    expect(ocurrencias.find((o) => o.date === "2026-10-12")).toEqual({
      blockId: 12,
      title: "Practicas preprofesionales",
      colorHex: "#F94B3F",
      date: "2026-10-12",
      dayOfWeek: 1,
      startTime: "15:00",
      endTime: "19:30",
      moved: true,
    });
    // Los demás días siguen con el patrón.
    expect(ocurrencias.filter((o) => o.moved)).toHaveLength(1);
    expect(ocurrencias.find((o) => o.date === "2026-10-14")?.startTime).toBe("14:00");
  });

  test("una excepcion sobre una fecha que el patron no genera se ignora", () => {
    const sinExcepciones = resumen(expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to));
    const excepciones = [
      cancelado(12, "2026-10-06"), // martes: no es día del patrón
      movido(12, "2026-09-21", "09:00", "11:00"), // lunes anterior al startDate
      cancelado(12, "2026-10-26"), // lunes posterior al endDate
    ];
    const conExcepciones = expandOccurrences([PRACTICAS], excepciones, VENTANA.from, VENTANA.to);
    expect(resumen(conExcepciones)).toEqual(sinExcepciones);
  });

  test("la excepcion de otro bloque en la misma fecha no toca este", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [cancelado(99, "2026-10-07"), movido(99, "2026-10-12", "20:00", "21:00")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(resumen(ocurrencias)).toEqual(OCHO_DIAS);
  });

  test("dos reglas el mismo dia salen ordenadas por hora de inicio", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS, VOLUNTARIADO],
      [],
      "2026-09-28",
      "2026-10-02",
    );
    expect(resumen(ocurrencias)).toEqual([
      "2026-09-28 14:00-18:00 #12",
      "2026-09-30 08:00-10:00 #7",
      "2026-09-30 14:00-18:00 #12",
    ]);
  });

  test("dos reglas a la misma hora el mismo dia se ordenan por bloque", () => {
    const aLaMismaHora: TimeBlockRule = { ...VOLUNTARIADO, startTime: "14:00", endTime: "16:00" };
    const ocurrencias = expandOccurrences(
      [PRACTICAS, aLaMismaHora],
      [],
      "2026-09-30",
      "2026-09-30",
    );
    expect(resumen(ocurrencias)).toEqual([
      "2026-09-30 14:00-16:00 #7",
      "2026-09-30 14:00-18:00 #12",
    ]);
  });

  test("sin reglas no hay ocurrencias", () => {
    expect(expandOccurrences([], [cancelado(12, "2026-10-07")], VENTANA.from, VENTANA.to)).toEqual([]);
  });

  test("el recorrido termina aunque el rango llegue al 9999-12-31", () => {
    // Un dia despues del 9999-12-31, addDays imprime "+010000-01", que como
    // texto es MENOR que "9999-12-31": un bucle que avanzara sobre la cadena
    // no terminaria nunca. Entre el 9999-09-03 y el 9999-12-31 hay 17 lunes.
    const hastaElFinal: TimeBlockRule = {
      ...PRACTICAS,
      daysOfWeek: [1],
      startDate: "9999-09-03",
      endDate: "9999-12-31",
    };
    const ocurrencias = expandOccurrences([hastaElFinal], [], "9999-09-03", "9999-12-31");
    expect(ocurrencias).toHaveLength(17);
    expect(ocurrencias.every((o) => o.date >= "9999-09-03" && o.date <= "9999-12-31")).toBe(true);
  });
});

describe("weeklyHours", () => {
  test("agrupa por lunes y suma las horas de cada semana", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to);
    expect(weeklyHours(ocurrencias, VENTANA.from, VENTANA.to)).toEqual([
      { weekStart: "2026-09-21", hours: 4 },
      { weekStart: "2026-09-28", hours: 8 },
      { weekStart: "2026-10-05", hours: 8 },
      { weekStart: "2026-10-12", hours: 8 },
      { weekStart: "2026-10-19", hours: 4 },
    ]);
  });

  test("un dia cancelado no suma", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [cancelado(12, "2026-10-07")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(weeklyHours(ocurrencias, VENTANA.from, VENTANA.to)).toContainEqual({
      weekStart: "2026-10-05",
      hours: 4,
    });
  });

  test("un dia movido suma su duracion nueva, no la del patron", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [movido(12, "2026-10-12", "15:00", "19:30")],
      VENTANA.from,
      VENTANA.to,
    );
    // 4.5 del lunes movido + 4 del miércoles, sin redondear.
    expect(weeklyHours(ocurrencias, VENTANA.from, VENTANA.to)).toContainEqual({
      weekStart: "2026-10-12",
      hours: 8.5,
    });
  });

  test("una semana partida entre dos meses queda en una sola entrada", () => {
    const miercolesYViernes: TimeBlockRule = {
      id: 3,
      title: "Taller",
      colorHex: "#1565C0",
      daysOfWeek: [3, 5],
      startTime: "09:00",
      endTime: "12:00",
      startDate: "2026-09-28",
      endDate: "2026-10-04",
    };
    const ocurrencias = expandOccurrences([miercolesYViernes], [], "2026-09-28", "2026-10-04");
    expect(ocurrencias.map((o) => o.date)).toEqual(["2026-09-30", "2026-10-02"]);
    expect(weeklyHours(ocurrencias, "2026-09-28", "2026-10-04")).toEqual([
      { weekStart: "2026-09-28", hours: 6 },
    ]);
  });

  test("una semana que la ventana toca sin ocurrencias sale con cero horas", () => {
    const unLunes = (id: number, date: string): TimeBlockRule => ({
      id,
      title: "Charla",
      colorHex: "#6A1B9A",
      daysOfWeek: [1],
      startTime: "18:00",
      endTime: "20:00",
      startDate: date,
      endDate: date,
    });
    const ocurrencias = expandOccurrences(
      [unLunes(1, "2026-09-21"), unLunes(2, "2026-10-05")],
      [],
      "2026-09-21",
      "2026-10-11",
    );
    // RS-BE-34: una entrada por CADA semana entre los lunes de from y de to. La del 28-09 no
    // tiene ninguna ocurrencia y sale igual, con 0: es un total conocido, no
    // un dato que falta (la regla del null de la spec es para lo segundo).
    expect(weeklyHours(ocurrencias, "2026-09-21", "2026-10-11")).toEqual([
      { weekStart: "2026-09-21", hours: 2 },
      { weekStart: "2026-09-28", hours: 0 },
      { weekStart: "2026-10-05", hours: 2 },
    ]);
  });

  test("sin ocurrencias cada semana de la ventana sale en cero, desde la del lunes de from", () => {
    expect(weeklyHours([], "2026-09-21", "2026-10-04")).toEqual([
      { weekStart: "2026-09-21", hours: 0 },
      { weekStart: "2026-09-28", hours: 0 },
    ]);
    // Una ventana de un miercoles: su semana empieza el lunes anterior a from.
    expect(weeklyHours([], "2026-09-23", "2026-09-23")).toEqual([
      { weekStart: "2026-09-21", hours: 0 },
    ]);
  });

  test("suma minutos y divide una sola vez: sin ruido de coma flotante", () => {
    // Sumar minutos/60 ocurrencia por ocurrencia da 7.000000000000001 para
    // seis de 70 minutos, 1.9999999999999998 para seis de 20 y
    // 0.9999999999999999 para seis de 10. La app muestra el numero tal cual.
    const seisDias = (startTime: string, endTime: string): TimeBlockRule => ({
      id: 5,
      title: "Turno",
      colorHex: "#00838F",
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      startTime,
      endTime,
      startDate: "2026-09-21",
      endDate: "2026-09-26",
    });
    const semana = (regla: TimeBlockRule) =>
      weeklyHours(expandOccurrences([regla], [], "2026-09-21", "2026-09-27"), "2026-09-21", "2026-09-27");
    expect(semana(seisDias("14:00", "15:10"))).toEqual([{ weekStart: "2026-09-21", hours: 7 }]);
    expect(semana(seisDias("14:00", "14:20"))).toEqual([{ weekStart: "2026-09-21", hours: 2 }]);
    expect(semana(seisDias("14:00", "14:10"))).toEqual([{ weekStart: "2026-09-21", hours: 1 }]);
  });
});
