import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  deriveWeeksFromPeriodDates,
  ScheduleRepository,
} from "../../src/modules/schedule/schedule.repository.js";

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * Alcance por período académico activo (ScheduleRepository)
 * ════════════════════════════════════════════════════════════════════════════
 * Desde que portal-sync importa ciclos, un alumno puede tener matrículas —y un
 * docente secciones— en más de un `academic_period`. Toda consulta del horario
 * que pase por `course_offering` debe acotarse al período activo o superpone
 * dos ciclos en la misma grilla/calendario.
 *
 * `findActiveEnrollmentsWithSessions` ya lo hace; estos casos cubren las tres
 * consultas restantes del repositorio. Se renderiza el SQL real que el método
 * manda a `database.execute` con el mismo dialecto de Drizzle que usa la app
 * (`PgDialect`), sin conexión a Postgres.
 */

const ACTIVE_PERIOD_JOIN =
  "join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true";

/** Corre el método con una `db` falsa que captura la consulta y la renderiza a SQL plano. */
const renderSql = async (run: (repo: ScheduleRepository) => Promise<unknown>): Promise<string> => {
  let captured: SQL | null = null;
  const repository = new ScheduleRepository({
    execute: async (query: SQL) => {
      captured = query;
      return [];
    },
  } as unknown as ConstructorParameters<typeof ScheduleRepository>[0]);

  await run(repository);

  if (captured === null) throw new Error("el método no llegó a llamar database.execute");
  return new PgDialect().sqlToQuery(captured).sql.replace(/\s+/g, " ").trim();
};

describe("ScheduleRepository · alcance al período académico activo", () => {
  test("findActiveSyllabiAndAssessments acota las evaluaciones del alumno al período activo", async () => {
    const query = await renderSql((repo) => repo.findActiveSyllabiAndAssessments(42));
    expect(query).toContain(ACTIVE_PERIOD_JOIN);
  });

  test("findTeacherSessionsWithClasses acota las secciones del docente al período activo", async () => {
    const query = await renderSql((repo) => repo.findTeacherSessionsWithClasses(7));
    expect(query).toContain(ACTIVE_PERIOD_JOIN);
  });

  test("findTeacherSectionsAssessments acota las evaluaciones del docente al período activo", async () => {
    const query = await renderSql((repo) => repo.findTeacherSectionsAssessments(7));
    expect(query).toContain(ACTIVE_PERIOD_JOIN);
  });

  test("el filtro del período es un inner join, no un left join que deje pasar otros ciclos", async () => {
    const queries = await Promise.all([
      renderSql((repo) => repo.findActiveSyllabiAndAssessments(42)),
      renderSql((repo) => repo.findTeacherSessionsWithClasses(7)),
      renderSql((repo) => repo.findTeacherSectionsAssessments(7)),
    ]);
    for (const query of queries) {
      expect(query).not.toContain(`left ${ACTIVE_PERIOD_JOIN}`);
    }
  });

  test("las consultas del docente siguen filtrando por titular o JP con el id recibido", async () => {
    // El join nuevo no debe desplazar el predicado de propiedad de la sección.
    const queries = await Promise.all([
      renderSql((repo) => repo.findTeacherSessionsWithClasses(7)),
      renderSql((repo) => repo.findTeacherSectionsAssessments(7)),
    ]);
    for (const query of queries) {
      expect(query).toContain("where sec.teacher_id = $1 or sec.jp_id = $2");
    }
  });
});
