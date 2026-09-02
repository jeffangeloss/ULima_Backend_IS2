import { describe, expect, test } from "bun:test";
import {
  academicWeekCount, defaultPeriodDates, hasPublishedCalendar, periodCodeIsNewer, periodHasStarted,
  shouldActivatePeriod, snapToNextMonday,
} from "../../src/modules/portal-sync/portal-sync.repository.js";

/** getUTCDay(): 0 = domingo … 6 = sábado. Solo lunes (1) es válido como inicio de semana. */
const isMonday = (dateStr: string): boolean => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
};

describe("snapToNextMonday", () => {
  test("domingo avanza 1 dia al lunes", () => {
    expect(snapToNextMonday("2026-03-15")).toBe("2026-03-16");
  });
  test("sabado avanza 2 dias al lunes", () => {
    expect(snapToNextMonday("2026-08-01")).toBe("2026-08-03");
  });
  test("un lunes se deja igual", () => {
    expect(snapToNextMonday("2026-01-05")).toBe("2026-01-05");
  });
  test("mitad de semana avanza al lunes siguiente", () => {
    expect(snapToNextMonday("2026-01-07")).toBe("2026-01-12"); // miercoles -> lunes
  });
});

describe("defaultPeriodDates", () => {
  test("ciclo 1 va de marzo (lunes) a julio", () => {
    const { start, end } = defaultPeriodDates("2026-1");
    expect(isMonday(start)).toBe(true);
    expect({ start, end }).toEqual({ start: "2026-03-16", end: "2026-07-31" });
  });
  test("ciclo 2 SIN calendario publicado (ej. 2027-2) sigue usando el calculo aproximado", () => {
    const { start, end } = defaultPeriodDates("2027-2");
    expect(isMonday(start)).toBe(true);
    expect({ start, end }).toEqual({ start: "2027-08-02", end: "2027-12-20" });
  });
  test("ciclo 0 es el de verano y ya cae en lunes", () => {
    const { start, end } = defaultPeriodDates("2026-0");
    expect(isMonday(start)).toBe(true);
    expect({ start, end }).toEqual({ start: "2026-01-05", end: "2026-02-28" });
  });
  test("2026-2 tiene calendario publicado: se usa tal cual, sin snap a lunes", () => {
    // Calendario oficial de la Universidad para 2026-2 (owner, 2026-09-02):
    // inicio lunes 24-ago-2026, fin lunes 14-dic-2026. Ambas fechas ya caen
    // en lunes, así que esta prueba no distingue snap-de-no-op de snap-real;
    // lo que importa es que sean EXACTAMENTE las fechas publicadas, no las
    // que produciría el cálculo aproximado (03-ago / 20-dic).
    const { start, end } = defaultPeriodDates("2026-2");
    expect({ start, end }).toEqual({ start: "2026-08-24", end: "2026-12-14" });
  });
});

describe("hasPublishedCalendar", () => {
  test("true para un ciclo con calendario publicado", () => {
    expect(hasPublishedCalendar("2026-2")).toBe(true);
  });
  test("false para un ciclo sin calendario publicado", () => {
    expect(hasPublishedCalendar("2027-2")).toBe(false);
  });
});

describe("academicWeekCount", () => {
  test("el span publicado de 2026-2 (24-ago a 14-dic) son 16 semanas", () => {
    expect(academicWeekCount("2026-08-24", "2026-12-14")).toBe(16);
  });
  test("un span de un solo dia son igual 1 semana (piso minimo)", () => {
    expect(academicWeekCount("2026-08-24", "2026-08-24")).toBe(1);
  });
  test("la ultima semana generada no empieza despues del fin del periodo", () => {
    const start = "2026-08-24";
    const end = "2026-12-14";
    const weeks = academicWeekCount(start, end);
    const [y, m, d] = start.split("-").map(Number);
    const lastWeekStart = new Date(Date.UTC(y, m - 1, d));
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() + (weeks - 1) * 7);
    expect(lastWeekStart.toISOString().slice(0, 10) <= end).toBe(true);
  });
});

describe("periodCodeIsNewer", () => {
  test("2026-2 avanza sobre 2026-1", () => {
    expect(periodCodeIsNewer("2026-2", "2026-1")).toBe(true);
  });
  test("2025-2 NO retrocede sobre 2026-1", () => {
    expect(periodCodeIsNewer("2025-2", "2026-1")).toBe(false);
  });
  test("el mismo codigo cuenta como activable", () => {
    expect(periodCodeIsNewer("2026-1", "2026-1")).toBe(true);
  });
  test("sin periodo activo previo siempre activa", () => {
    expect(periodCodeIsNewer("2026-2", null)).toBe(true);
  });
});

describe("periodHasStarted", () => {
  test("fecha de inicio en el pasado ya empezo", () => {
    expect(periodHasStarted("2026-08-24", new Date(Date.UTC(2026, 8, 2)))).toBe(true); // 2026-09-02
  });
  test("fecha de inicio HOY (mismo dia UTC) cuenta como ya empezada", () => {
    expect(periodHasStarted("2026-08-24", new Date(Date.UTC(2026, 7, 24, 23, 59, 59)))).toBe(true);
  });
  test("fecha de inicio en el futuro NO ha empezado", () => {
    expect(periodHasStarted("2026-08-24", new Date(Date.UTC(2026, 7, 23)))).toBe(false);
  });
  test("compara solo la fecha de calendario en UTC, no la hora", () => {
    // "now" es 23:00 UTC del dia anterior al inicio: sigue sin haber empezado.
    expect(periodHasStarted("2026-08-24", new Date(Date.UTC(2026, 7, 23, 23, 0, 0)))).toBe(false);
    // "now" es 00:01 UTC del dia de inicio: ya empezo.
    expect(periodHasStarted("2026-08-24", new Date(Date.UTC(2026, 7, 24, 0, 1, 0)))).toBe(true);
  });
});

describe("shouldActivatePeriod", () => {
  // Calendario publicado real de 2026-2 (owner, 2026-09-02): inicio 24-ago-2026.
  const START_2026_2 = "2026-08-24";

  test("codigo mas nuevo pero fecha de inicio en el futuro: NO activa", () => {
    const now = new Date(Date.UTC(2026, 7, 23)); // 2026-08-23, un dia antes del inicio
    expect(shouldActivatePeriod("2026-2", "2026-1", START_2026_2, now)).toBe(false);
  });

  test("codigo mas nuevo y fecha de inicio ya llegada: activa", () => {
    const now = new Date(Date.UTC(2026, 8, 2)); // 2026-09-02, hoy segun el enunciado del bug
    expect(shouldActivatePeriod("2026-2", "2026-1", START_2026_2, now)).toBe(true);
  });

  test("codigo mas viejo nunca activa, aunque su fecha de inicio ya haya llegado", () => {
    const now = new Date(Date.UTC(2026, 8, 2));
    expect(shouldActivatePeriod("2025-2", "2026-1", "2025-08-01", now)).toBe(false);
  });

  test("sin periodo activo previo, con fecha de inicio en el futuro: NO activa", () => {
    // Un alumno que importa ANTES de que empiece el primer ciclo que carga el
    // sistema tampoco debe activarlo: la guarda de fecha aplica igual cuando
    // no hay currentCode previo.
    const now = new Date(Date.UTC(2026, 7, 23));
    expect(shouldActivatePeriod("2026-2", null, START_2026_2, now)).toBe(false);
  });

  test("sin periodo activo previo, con fecha de inicio ya llegada: activa", () => {
    const now = new Date(Date.UTC(2026, 8, 2));
    expect(shouldActivatePeriod("2026-2", null, START_2026_2, now)).toBe(true);
  });
});
