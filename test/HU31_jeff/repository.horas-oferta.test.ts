import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * RS-BE-9, cableado. `resolveOfferingTotalHours` decide; el repositorio solo
 * escribe lo que le pasan y, en el paso 8.b, recalcula con el horario real.
 */

const repoQueCaptura = (filas: unknown[] = [{ id: 1, created: true }]) => {
  const consultas: SQL[] = [];
  const tx = { execute: async (q: SQL) => { consultas.push(q); return filas; } } as never;
  const sqlDe = (i = 0) => new PgDialect().sqlToQuery(consultas[i]).sql.toLowerCase();
  return { repo: new PortalSyncRepository({} as never), tx, consultas, sqlDe };
};

describe("upsertCourse trae las horas semanales de la malla", () => {
  test("devuelve weekly_hours junto con el id", async () => {
    const { repo, tx } = repoQueCaptura([{ id: 7, created: false, weekly_hours: 5 }]);
    const r = await repo.upsertCourse(tx, "650070", "PARADIGMAS", 3);
    expect(r.weeklyHours).toBe(5);
  });

  test("un curso fuera de la malla devuelve null, no 0", async () => {
    const { repo, tx } = repoQueCaptura([{ id: 7, created: false, weekly_hours: null }]);
    expect((await repo.upsertCourse(tx, "999", "X", 3)).weeklyHours).toBeNull();
  });

  test("la consulta pide weekly_hours en el returning", async () => {
    const { repo, tx, sqlDe } = repoQueCaptura([{ id: 7, created: true, weekly_hours: null }]);
    await repo.upsertCourse(tx, "650070", "PARADIGMAS", 3);
    expect(sqlDe()).toContain("weekly_hours");
  });
});

describe("upsertOffering escribe las horas que le dan", () => {
  test("no recalcula: escribe exactamente el total que le pasan", async () => {
    const { repo, tx, consultas } = repoQueCaptura();
    await repo.upsertOffering(tx, 1, 7, 80);
    const { params } = new PgDialect().sqlToQuery(consultas[0]);
    // El "créditos x 16" vivía acá dentro. Si volviera, el parámetro sería 1280.
    expect(params).toContain(80);
    expect(params).not.toContain(1280);
  });
});

describe("recomputeOfferingHoursFromSchedule (paso 8.b)", () => {
  test("recalcula desde schedule_session multiplicando por las semanas", async () => {
    const { repo, tx, sqlDe } = repoQueCaptura([]);
    await repo.recomputeOfferingHoursFromSchedule(tx, [1, 2], 16);
    const sql = sqlDe();
    expect(sql).toContain("schedule_session");
    expect(sql).toContain("update course_offering");
  });

  test("pisa el valor en vez de usar greatest: el horario es mas confiable", async () => {
    const { repo, tx, sqlDe } = repoQueCaptura([]);
    await repo.recomputeOfferingHoursFromSchedule(tx, [1], 16);
    expect(sqlDe()).not.toContain("greatest");
  });

  test("sin ofertas no consulta nada", async () => {
    const { repo, tx, consultas } = repoQueCaptura([]);
    await repo.recomputeOfferingHoursFromSchedule(tx, [], 16);
    expect(consultas).toHaveLength(0);
  });

  test("los ids viajan como arreglo parametrizado, no concatenados", async () => {
    const { repo, tx, sqlDe } = repoQueCaptura([]);
    await repo.recomputeOfferingHoursFromSchedule(tx, [1234], 16);
    expect(sqlDe()).not.toContain("1234");
  });
});
