import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { AttendanceRiskService } from "../../src/modules/attendance-risk/attendance-risk.service.js";
import { AttendanceRiskRepository } from "../../src/modules/attendance-risk/attendance-risk.repository.js";
import type { AttendanceRiskRawRow } from "../../src/modules/attendance-risk/attendance-risk.types.js";
import type { EventBus } from "../../src/events/index.js";

/**
 * RS-BE-13: la duración de una sesión sale del horario, no de un 2 hardcodeado.
 *
 * `sessionHours = 2` estaba escrito tres veces en el servicio, sin una sola
 * línea en `src/`, `docs/` ni `specs/` que lo justificara. Ese número convierte
 * horas en "faltas" y viaja LITERAL al mensaje que se le manda al alumno
 * ("estás a N faltas del límite"). En el período activo hay cursos de 5 h/sem
 * con sesiones de 2 h y de 3 h, así que el 2 fijo es falso para la mitad.
 *
 * La duración real ya está en `schedule_session` (`start_time`/`end_time`, ambas
 * NOT NULL con CHECK). Se usa la MODA y no el promedio porque las sesiones que
 * desaparecen del portal nunca se borran (portal-sync, paso 8): una sección que
 * cambió de horario corre el promedio, pero rara vez la moda.
 */

const noopEvents = {} as unknown as EventBus;

const fila = (over: Partial<AttendanceRiskRawRow> = {}): AttendanceRiskRawRow => ({
  code: "20230001",
  full_name: "Garcia Lopez, Maria",
  current_level: 3,
  absent_hours: "14",          // límite 25% de 80 h = 20 h -> margen 6 h
  total_section_hours: "80",
  enrollment_total_hours: "80",
  cycle: 3,
  ...over,
});

const serviceCon = (horasSesion: number | null) =>
  new AttendanceRiskService(
    {
      findStudentsBySectionId: async () => [fila()],
      findModalSessionHours: async () => horasSesion,
    } as unknown as AttendanceRiskRepository,
    noopEvents,
  );

describe("las faltas restantes usan la duracion real de la sesion", () => {
  test("con sesiones de 3 h, 6 h de margen son 2 faltas", async () => {
    const res = await serviceCon(3).getAttendanceRisk(1);
    expect(res.students[0].missingFaltas).toBe(2);
  });

  test("con sesiones de 2 h, las mismas 6 h son 3 faltas", async () => {
    const res = await serviceCon(2).getAttendanceRisk(1);
    expect(res.students[0].missingFaltas).toBe(3);
  });

  test("sin horario cargado cae al 2 heredado, no rompe", async () => {
    const res = await serviceCon(null).getAttendanceRisk(1);
    expect(res.students[0].missingFaltas).toBe(3);
  });

  test("una duracion absurda (0) tampoco divide por cero", async () => {
    const res = await serviceCon(0).getAttendanceRisk(1);
    expect(res.students[0].missingFaltas).toBe(3);
  });
});

describe("findModalSessionHours: la consulta", () => {
  const capturar = async () => {
    const consultas: SQL[] = [];
    const repo = new AttendanceRiskRepository(
      { execute: async (q: SQL) => { consultas.push(q); return []; } } as never,
    );
    await repo.findModalSessionHours(42);
    return new PgDialect().sqlToQuery(consultas[0]).sql.toLowerCase();
  };

  test("usa la moda de la duracion, no el promedio", async () => {
    const sql = await capturar();
    expect(sql).toContain("mode()");
    expect(sql).not.toContain("avg(");
  });

  test("mide sobre schedule_session de la seccion pedida", async () => {
    const sql = await capturar();
    expect(sql).toContain("schedule_session");
    expect(sql).toContain("section_id");
    expect(sql).not.toContain("42");
  });

  test("sin sesiones devuelve null, no 0", async () => {
    const repo = new AttendanceRiskRepository(
      { execute: async () => [] } as never,
    );
    expect(await repo.findModalSessionHours(42)).toBeNull();
  });
});
