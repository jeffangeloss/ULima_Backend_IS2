import { describe, expect, test } from "bun:test";
import {
  defaultPeriodDates, periodCodeIsNewer, snapToNextMonday,
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
  test("ciclo 2 va de agosto (lunes) a diciembre", () => {
    const { start, end } = defaultPeriodDates("2026-2");
    expect(isMonday(start)).toBe(true);
    expect({ start, end }).toEqual({ start: "2026-08-03", end: "2026-12-20" });
  });
  test("ciclo 0 es el de verano y ya cae en lunes", () => {
    const { start, end } = defaultPeriodDates("2026-0");
    expect(isMonday(start)).toBe(true);
    expect({ start, end }).toEqual({ start: "2026-01-05", end: "2026-02-28" });
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
