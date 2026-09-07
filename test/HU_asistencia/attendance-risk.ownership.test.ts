import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { AttendanceRiskService } from "../../src/modules/attendance-risk/attendance-risk.service.js";
import { AttendanceRiskRepository } from "../../src/modules/attendance-risk/attendance-risk.repository.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import type { EventBus } from "../../src/events/index.js";

/**
 * RS-BE-11: el riesgo por inasistencias es de la sección del docente, no de
 * cualquier sección.
 *
 * `attendance-risk.routes.ts` solo exigía `requireRole("teacher")`: cualquier
 * token de docente podía LEER el riesgo de cualquier sección y, peor, disparar
 * `POST /notify`, que inserta filas en `alert` — correo académico a alumnos de
 * otra sección. `official-grades` ya comprobaba propiedad; este módulo no.
 */

const noopEvents = {} as unknown as EventBus;

const serviceWith = (pertenece: boolean) =>
  new AttendanceRiskService(
    { teacherBelongsToSection: async () => pertenece } as unknown as AttendanceRiskRepository,
    noopEvents,
  );

describe("assertTeacherOwnsSection", () => {
  test("el docente de la seccion pasa", async () => {
    await serviceWith(true).assertTeacherOwnsSection(7, 42);
  });

  test("un docente ajeno recibe 403, no 404 ni 500", async () => {
    const p = serviceWith(false).assertTeacherOwnsSection(7, 42);
    await expect(p).rejects.toBeInstanceOf(HttpError);
    await p.catch((e: HttpError) => {
      expect(e.statusCode).toBe(403);
      expect(e.code).toBe("NOT_SECTION_TEACHER");
    });
  });

  test("el mensaje no revela si la seccion existe", async () => {
    // Un mensaje distinto para "no existe" y "no es tuya" convierte el endpoint
    // en un oraculo para enumerar secciones.
    await serviceWith(false).assertTeacherOwnsSection(7, 42).catch((e: HttpError) => {
      expect(e.message.toLowerCase()).not.toContain("no existe");
      expect(e.message.toLowerCase()).not.toContain("encontrad");
    });
  });
});

describe("teacherBelongsToSection: la consulta", () => {
  const capturar = async () => {
    const consultas: SQL[] = [];
    const repo = new AttendanceRiskRepository(
      { execute: async (q: SQL) => { consultas.push(q); return []; } } as never,
    );
    await repo.teacherBelongsToSection(7, 42);
    return new PgDialect().sqlToQuery(consultas[0]).sql;
  };

  test("acepta al profesor titular y tambien al JP de la seccion", async () => {
    const sql = await capturar();
    expect(sql).toContain("teacher_id");
    expect(sql).toContain("jp_id");
  });

  test("filtra por la seccion pedida", async () => {
    expect(await capturar()).toContain("id =");
  });

  test("los ids viajan parametrizados, no concatenados en el SQL", async () => {
    const sql = await capturar();
    expect(sql).not.toContain("42");
    expect(sql).not.toContain("7");
  });
});
