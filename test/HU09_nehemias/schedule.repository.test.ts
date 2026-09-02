import { describe, expect, test } from "bun:test";
import { deriveWeeksFromPeriodDates } from "../../src/modules/schedule/schedule.repository.js";

/**
 * schedule.repository.test.ts — deriveWeeksFromPeriodDates
 * ════════════════════════════════════════════════════════════════════════════
 * Cubre el 2º escalón del fallback de semanas académicas de ScheduleService
 * (ver `specs/features/schedule/schedule.spec.md`): cuando `academic_week` no
 * tiene filas para el período activo, las semanas se derivan de las fechas
 * propias del período (`academic_period.start_date`/`end_date`), de 7 días
 * cada una, sin que la última empiece después de `end_date`. Misma fórmula
 * que `academicWeekCount` en `portal-sync.repository.ts` (ceil del span entre
 * fechas / 7, mínimo 1); función pura, sin BD, testeada en aislamiento.
 */

describe("deriveWeeksFromPeriodDates", () => {
  test("calendario publicado de 2026-2 (24-ago a 14-dic, span exacto de 16 semanas) produce 16 semanas de 7 días", () => {
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-12-14");
    expect(weeks).toHaveLength(16);
    expect(weeks[0]).toEqual({ week_number: 1, start_date: "2026-08-24", end_date: "2026-08-30" });
    expect(weeks[15]).toEqual({ week_number: 16, start_date: "2026-12-07", end_date: "2026-12-13" });
  });

  test("la numeración de semana es consecutiva desde 1", () => {
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-12-14");
    expect(weeks.map((w) => w.week_number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  test("cada semana dura exactamente 7 días (start_date a end_date inclusive)", () => {
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-12-14");
    for (const week of weeks) {
      const start = new Date(`${week.start_date}T00:00:00Z`);
      const end = new Date(`${week.end_date}T00:00:00Z`);
      expect((end.getTime() - start.getTime()) / 86_400_000).toBe(6);
    }
  });

  test("la última semana no empieza después de end_date", () => {
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-12-14");
    const last = weeks[weeks.length - 1];
    expect(last.start_date <= "2026-12-14").toBe(true);
  });

  test("un período de un solo día (start_date = end_date) produce igual 1 semana (piso mínimo)", () => {
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-08-24");
    expect(weeks).toEqual([{ week_number: 1, start_date: "2026-08-24", end_date: "2026-08-30" }]);
  });

  test("un span de 14 días (2 semanas exactas) produce 2 semanas", () => {
    // academicWeekCount usaría el mismo cálculo: ceil(14/7) = 2.
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-09-07");
    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toEqual({ week_number: 2, start_date: "2026-08-31", end_date: "2026-09-06" });
  });

  test("un span de 15 días (excede 2 semanas exactas por 1 día) redondea hacia arriba a 3 semanas", () => {
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-09-08");
    expect(weeks).toHaveLength(3);
  });

  test("hoy (2026-09-02) cae en la semana 2 del ciclo 2026-2 publicado (24-ago a 14-dic)", () => {
    // Caso motivador del bug: con el calendario hardcodeado (6-abr-2026) hoy
    // caía en la semana 22, fuera de rango. Con las fechas reales del período
    // activo, hoy cae dentro del ciclo, en su semana 2.
    const weeks = deriveWeeksFromPeriodDates("2026-08-24", "2026-12-14");
    const today = "2026-09-02";
    const week = weeks.find((w) => w.start_date <= today && today <= w.end_date);
    expect(week?.week_number).toBe(2);
  });
});
