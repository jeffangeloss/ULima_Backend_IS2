import { describe, expect, test } from "bun:test";
import { defaultPeriodDates, periodCodeIsNewer } from "../../src/modules/portal-sync/portal-sync.repository.js";

describe("defaultPeriodDates", () => {
  test("ciclo 1 va de marzo a julio", () => {
    expect(defaultPeriodDates("2026-1")).toEqual({ start: "2026-03-15", end: "2026-07-31" });
  });
  test("ciclo 2 va de agosto a diciembre", () => {
    expect(defaultPeriodDates("2026-2")).toEqual({ start: "2026-08-01", end: "2026-12-20" });
  });
  test("ciclo 0 es el de verano", () => {
    expect(defaultPeriodDates("2026-0")).toEqual({ start: "2026-01-05", end: "2026-02-28" });
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
