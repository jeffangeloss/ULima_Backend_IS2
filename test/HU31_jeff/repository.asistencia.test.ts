import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  PortalSyncRepository,
  resolveAttendanceHours,
} from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * RS-BE-15 · la escritura de las tres horas.
 *
 * El CHECK `chk_enrollment_attendance_hours` (attended + absent <= total) se
 * evalúa al final de CADA statement y no admite DEFERRABLE. Como la importación
 * entera corre en UNA transacción, un 23514 acá haría rollback de matrícula,
 * horario, notas y progreso. De ahí las dos capas: la regla pura decide, y el
 * WHERE del UPDATE repite la condición como cinturón.
 */

describe("resolveAttendanceHours: la regla pura", () => {
  test("un triple coherente se convierte a texto con dos decimales", () => {
    const r = resolveAttendanceHours({ totalHours: 64, attendedHours: 8, absentHours: 0 });
    expect(r).toEqual({ ok: true, hours: { total: "64.00", attended: "8.00", absent: "0.00" } });
  });

  test("acepta medias horas sin perderlas", () => {
    const r = resolveAttendanceHours({ totalHours: 80, attendedHours: 4.5, absentHours: 1.5 });
    expect(r.ok && r.hours.attended).toBe("4.50");
    expect(r.ok && r.hours.absent).toBe("1.50");
  });

  test("asistidas + faltas por encima del total se RECHAZA, no se recorta", () => {
    // Es el caso que reventaría el CHECK y abortaría la importación entera.
    const r = resolveAttendanceHours({ totalHours: 64, attendedHours: 50, absentHours: 30 });
    expect(r.ok).toBe(false);
  });

  test("total en 0 no se escribe: es el centinela de 'nunca se midió'", () => {
    // RS-BE-10 usa enrollment.total_hours = 0 como prueba de ausencia de dato.
    expect(resolveAttendanceHours({ totalHours: 0, attendedHours: 0, absentHours: 0 }).ok).toBe(false);
  });

  test("un negativo se rechaza", () => {
    expect(resolveAttendanceHours({ totalHours: 64, attendedHours: -1, absentHours: 0 }).ok).toBe(false);
  });

  test("NaN se rechaza en vez de escribir basura", () => {
    expect(resolveAttendanceHours({ totalHours: NaN, attendedHours: 8, absentHours: 0 }).ok).toBe(false);
  });

  test("un total fuera del rango de numeric(5,2) se rechaza antes de llegar a la BD", () => {
    // 1000 no entra en numeric(5,2): en la BD sería 22003, otra excepción que
    // abortaría la transacción.
    expect(resolveAttendanceHours({ totalHours: 1000, attendedHours: 0, absentHours: 0 }).ok).toBe(false);
  });
});

describe("updateAttendanceHours: el UPDATE", () => {
  const capturar = async (filas: unknown[] = [{ id: 1 }]) => {
    const consultas: SQL[] = [];
    const repo = new PortalSyncRepository({} as never);
    const tx = { execute: async (q: SQL) => { consultas.push(q); return filas; } } as never;
    const ok = await repo.updateAttendanceHours(tx, 42, {
      total: "64.00", attended: "8.00", absent: "0.00",
    });
    return { ok, sql: consultas.length ? new PgDialect().sqlToQuery(consultas[0]).sql.toLowerCase() : "", consultas };
  };

  test("escribe las TRES columnas en una sola sentencia", async () => {
    const { sql } = await capturar();
    expect(sql).toContain("update enrollment");
    for (const col of ["attended_hours", "absent_hours", "total_hours"]) expect(sql).toContain(col);
    // Una sola sentencia: escribir attended solo, con total todavía en 0 por el
    // DEFAULT, violaría el CHECK al cerrar ese statement.
    expect((sql.match(/update enrollment/g) ?? []).length).toBe(1);
  });

  test("repite la condicion del CHECK en el WHERE", async () => {
    const { sql } = await capturar();
    expect(sql).toMatch(/where[\s\S]*<=/);
  });

  test("asigna, no acumula ni usa greatest", async () => {
    // El portal publica el acumulado a la fecha y el docente puede corregir una
    // marca: este es el único upsert del módulo que debe poder BAJAR.
    const { sql } = await capturar();
    expect(sql).not.toContain("greatest");
    expect(sql).not.toMatch(/attended_hours\s*=\s*enrollment\.attended_hours/);
  });

  test("devuelve false si no actualizó ninguna fila, sin lanzar", async () => {
    const { ok } = await capturar([]);
    expect(ok).toBe(false);
  });

  test("devuelve true cuando actualizó", async () => {
    const { ok } = await capturar([{ id: 1 }]);
    expect(ok).toBe(true);
  });

  test("los valores viajan parametrizados, no concatenados", async () => {
    const { sql } = await capturar();
    expect(sql).not.toContain("64.00");
    expect(sql).not.toContain("42");
  });
});
