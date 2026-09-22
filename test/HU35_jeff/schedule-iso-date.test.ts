import { describe, expect, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import type { ScheduleRepository } from "../../src/modules/schedule/schedule.repository.js";
import { ScheduleService } from "../../src/modules/schedule/schedule.service.js";

/**
 * RS-BE-36 (specs/features/time-blocks/time-blocks.spec.md) · La fecha exacta
 * de cada día del horario.
 *
 * `GET /schedule/me/sessions` manda en `days` siete días por cada semana del
 * ciclo, con `dateText` en español y sin año ("24 de Agosto"). La app necesita
 * la fecha exacta de cada día para pedir los bloques propios del ciclo visible
 * y para ubicar cada ocurrencia en su día; sacarla de `dateText` obligaba a
 * adivinar el año y a leer los meses en español. `isoDate` es esa misma fecha
 * en "YYYY-MM-DD", o `null` cuando el ciclo no tiene semanas (el mismo caso en
 * que `dateText` llega vacío). Es un campo más: ninguno de los de antes cambia.
 *
 * El repositorio es un objeto en memoria: nada de esto toca la base.
 *
 * Calendario: 2026-08-24 es lunes (semana 1 del ciclo 2026-2 publicado), el
 * 2026-08-30 domingo, el 2026-08-31 lunes, el 2026-12-13 domingo, el
 * 2026-12-28 lunes y el 2027-01-01 viernes.
 */

type Semana = { week_number: number; start_date: string; end_date: string };
type Periodo = { start_date: string; end_date: string };

const armar = (semanas: Semana[], periodo: Periodo | null = null) => {
  const repositorio = {
    findActiveEnrollmentsWithSessions: async () => [],
    findAcademicWeeksForActivePeriod: async () => semanas,
    findActivePeriodDates: async () => periodo,
    findTeacherSessionsWithClasses: async () => [],
    findTeacherAdvisingSessions: async () => [],
  } as unknown as ScheduleRepository;
  return new ScheduleService(repositorio, new EventBus());
};

const DOS_SEMANAS: Semana[] = [
  { week_number: 1, start_date: "2026-08-24", end_date: "2026-08-30" },
  { week_number: 2, start_date: "2026-08-31", end_date: "2026-09-06" },
];

describe("RS-BE-36: isoDate en los dias de GET /schedule/me/sessions", () => {
  test("cada dia trae la fecha de la que sale su dateText", async () => {
    const { days } = await armar(DOS_SEMANAS).getSessions(42);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({
      dayName: "Lunes",
      dateText: "24 de Agosto",
      weekText: "Semana 1 del ciclo",
      isoDate: "2026-08-24",
    });
    expect(days[6]).toEqual({
      dayName: "Domingo",
      dateText: "30 de Agosto",
      weekText: "Semana 1 del ciclo",
      isoDate: "2026-08-30",
    });
    expect(days[13]).toEqual({
      dayName: "Domingo",
      dateText: "6 de Septiembre",
      weekText: "Semana 2 del ciclo",
      isoDate: "2026-09-06",
    });
    expect(days.map((d) => d.isoDate)).toEqual([
      "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30",
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
  });

  test("una semana que cruza de diciembre a enero lleva el anio de cada dia", async () => {
    // Es el caso que rompía leer la fecha desde dateText: "1 de Enero" no dice
    // de qué año es.
    const { days } = await armar([
      { week_number: 19, start_date: "2026-12-28", end_date: "2027-01-03" },
    ]).getSessions(42);
    expect(days.map((d) => d.isoDate)).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(days[4]).toMatchObject({ dayName: "Viernes", dateText: "1 de Enero", isoDate: "2027-01-01" });
  });

  test("con las semanas derivadas de las fechas del periodo tambien llega", async () => {
    // BR-SCH-04, segundo escalón: sin filas en academic_week, las semanas salen
    // de academic_period. 2026-08-24 a 2026-12-14 son 16 semanas exactas.
    const { days } = await armar([], { start_date: "2026-08-24", end_date: "2026-12-14" }).getSessions(42);
    expect(days).toHaveLength(112);
    expect(days[0]?.isoDate).toBe("2026-08-24");
    expect(days[111]?.isoDate).toBe("2026-12-13");
    expect(days.every((d) => d.isoDate !== null)).toBe(true);
  });

  test("sin semanas los siete dias llegan con isoDate null, igual que dateText vacio", async () => {
    const { days } = await armar([], null).getSessions(42);
    const nombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    expect(days).toEqual(
      nombres.map((dayName) => ({ dayName, dateText: "", weekText: "Semana actual", isoDate: null })),
    );
  });

  test("es un campo mas: los de antes siguen ahi y en el mismo orden", async () => {
    const { days } = await armar(DOS_SEMANAS).getSessions(42);
    for (const dia of days) {
      expect(Object.keys(dia)).toEqual(["dayName", "dateText", "weekText", "isoDate"]);
    }
  });

  test("el horario docente, que usa el mismo DayInfo, tambien la trae", async () => {
    const { days } = await armar(DOS_SEMANAS).getTeacherSessions(7);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({
      dayName: "Lunes",
      dateText: "24 de Agosto",
      weekText: "Semana 1 del ciclo",
      isoDate: "2026-08-24",
    });
    expect(days[13]?.isoDate).toBe("2026-09-06");
  });
});
