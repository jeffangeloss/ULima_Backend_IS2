import { describe, expect, test } from "bun:test";
import {
  academicWeekCount, defaultPeriodDates, hasPublishedCalendar, periodCodeIsNewer, snapToNextMonday,
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
