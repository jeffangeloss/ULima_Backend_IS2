import { describe, expect, test } from "bun:test";
import { resolveOfferingTotalHours } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * RS-BE-9. Precedencia de `course_offering.total_hours`:
 *   horario real > malla (plan de estudios) > créditos (proxy heredado).
 *
 * El bug que originó esto: `créditos x 16` subestimaba las horas entre 20% y 40%
 * (PARADIGMAS son 5 h/sem = 80 h, no 3 créditos x 16 = 48 h), y ese denominador
 * chico infla el % de inasistencia y adelanta el umbral de impedido.
 */
describe("resolveOfferingTotalHours", () => {
  test("el horario real manda sobre la malla y sobre los creditos", () => {
    const r = resolveOfferingTotalHours(
      { scheduleWeeklyHours: 5, curriculumWeeklyHours: 4, credits: 3 }, 16,
    );
    expect(r).toEqual({ hours: 80, source: "schedule" });
  });

  test("sin horario, la malla manda sobre los creditos", () => {
    const r = resolveOfferingTotalHours(
      { scheduleWeeklyHours: null, curriculumWeeklyHours: 5, credits: 3 }, 16,
    );
    expect(r).toEqual({ hours: 80, source: "curriculum" });
  });

  test("sin horario ni malla cae a creditos como proxy de horas semanales", () => {
    const r = resolveOfferingTotalHours(
      { scheduleWeeklyHours: null, curriculumWeeklyHours: null, credits: 3 }, 16,
    );
    expect(r).toEqual({ hours: 48, source: "credits" });
  });
});

describe("resolveOfferingTotalHours: casos borde", () => {
  test("una seccion sin sesiones cargadas (0 h/sem) cae a la malla, no fija el total en 0", () => {
    const r = resolveOfferingTotalHours(
      { scheduleWeeklyHours: 0, curriculumWeeklyHours: 4, credits: 3 }, 16,
    );
    expect(r).toEqual({ hours: 64, source: "curriculum" });
  });

  test("respeta horas semanales fraccionarias (sesiones de 1.5 h)", () => {
    const r = resolveOfferingTotalHours({ scheduleWeeklyHours: 4.5, credits: 3 }, 16);
    expect(r).toEqual({ hours: 72, source: "schedule" });
  });

  test("usa las semanas reales del periodo, no un 16 fijo (2026-1 dura 17)", () => {
    const r = resolveOfferingTotalHours({ curriculumWeeklyHours: 5, credits: 3 }, 17);
    expect(r).toEqual({ hours: 85, source: "curriculum" });
  });

  test("creditos en 0 usa el piso de 1 credito, igual que upsertCourse", () => {
    const r = resolveOfferingTotalHours({ credits: 0 }, 16);
    expect(r).toEqual({ hours: 16, source: "credits" });
  });
});
