import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-58 · asistenciaLeidaEn en GET /schedule/me/sessions y en
 * GET /course-detail/sections. Solo la base es falsa, y `mock.module` va antes
 * de importar las rutas porque authMiddleware consulta token_version. La parte
 * de la importación, que fija la hora con el instante de la respuesta, está en
 * test/HU31_jeff/service.asistencia.test.ts. Datos inventados.
 */
type Consulta = { sql: string; params: unknown[] };
const consultas: Consulta[] = [];
let filasSecciones: unknown[] = [];
const fakeDb = {
  execute: async (q: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(q);
    const texto = sql.toLowerCase().replace(/\s+/g, " ").trim();
    consultas.push({ sql: texto, params });
    if (texto.includes("token_version")) return [{ token_version: 1 }];
    if (texto.includes("left join enrollment mia")) return filasSecciones;
    return [];
  },
};
mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { ScheduleRepository } = await import("../../src/modules/schedule/schedule.repository.js");
const { ScheduleService } = await import("../../src/modules/schedule/schedule.service.js");
const { createCourseDetailRoutes } = await import("../../src/modules/course-detail/course-detail.routes.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");
const { EventBus } = await import("../../src/events/index.js");

const LEIDA = "2026-09-25T15:42:10.000Z";
const ISO = `'yyyy-mm-dd"t"hh24:mi:ss.ms"z"'`;

describe("GET /schedule/me/sessions", () => {
  const filaSesion = (over: Record<string, unknown> = {}) => ({
    section_id: 81, section_code: "812", teacher_code: "T001", course_id: 1, course_name: "TALLER DE PROTOTIPADO",
    attended_hours: "4.00", absent_hours: "2.00", total_hours: "48.00", session_id: null, day_of_week: null,
    start_time: null, end_time: null, classroom: null, color_hex: null, attendance_read_at: LEIDA, ...over,
  });
  const semanas = { findAcademicWeeksForActivePeriod: async () => [], findActivePeriodDates: async () => null };

  test("el repositorio lee la hora del alumno como texto ISO 8601 UTC", async () => {
    consultas.length = 0;
    await new ScheduleRepository(fakeDb as never).findActiveEnrollmentsWithSessions(42);
    expect(consultas[0]!.sql).toContain(
      `to_char(e.portal_attendance_read_at at time zone 'utc', ${ISO}) as attendance_read_at`,
    );
  });

  test("las filas del docente la traen null desde el SQL", async () => {
    consultas.length = 0;
    await new ScheduleRepository(fakeDb as never).findTeacherSessionsWithClasses(3);
    expect(consultas[0]!.sql).toContain("null as attendance_read_at");
  });

  test("cada sección suma asistenciaLeidaEn, o null sin lectura, sin cambiar los demás campos", async () => {
    const repo = {
      ...semanas,
      findActiveEnrollmentsWithSessions: async () => [
        filaSesion(), filaSesion({ section_id: 82, section_code: "815", attendance_read_at: null }),
      ],
    };
    const res = await new ScheduleService(repo as never, new EventBus()).getSessions(42);
    expect(res.secciones.map((s) => [s.idSeccion, s.asistenciaLeidaEn])).toEqual([["81", LEIDA], ["82", null]]);
    expect(res.secciones[0]).toMatchObject({
      asistido: 4, inasistencia: 2, total: 48, asistenciaDisponible: true, horasTranscurridas: 6,
    });
  });

  test("las filas del docente y de asesoría la emiten siempre null", async () => {
    const repo = {
      ...semanas,
      findTeacherSessionsWithClasses: async () => [filaSesion({ attendance_read_at: null })],
      findTeacherAdvisingSessions: async () => [{
        id: 9, start_time: "10:00:00", end_time: "11:00:00", kind: "extra", course_offering_id: 11,
        course_name: "TALLER DE PROTOTIPADO", day_of_week: 2, classroom: "A-101", session_date: "2026-09-29",
      }],
    };
    const res = await new ScheduleService(repo as never, new EventBus()).getTeacherSessions(3);
    expect(res.secciones.map((s: { asistenciaLeidaEn?: unknown }) => s.asistenciaLeidaEn)).toEqual([null, null]);
  });
});

describe("GET /course-detail/sections", () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/course-detail", createCourseDetailRoutes({} as never));
  const token = jwt.sign({ sub: "7", studentId: 42, role: "student", tokenVersion: 1 }, config.auth.jwtSecret);
  const pedir = (ruta: string) => app.request(ruta, { headers: { Authorization: `Bearer ${token}` } });
  const filaSeccion = (over: Record<string, unknown> = {}) => ({
    section_id: 81, section_code: "812", teacher_code: "T001", course_id: 1, course_name: "TALLER DE PROTOTIPADO",
    promedio: "0", attended_hours: "4.00", absent_hours: "2.00", total_hours: "48.00", asistencia_leida_en: LEIDA, ...over,
  });

  test("cada sección suma asistenciaLeidaEn de la matrícula del alumno", async () => {
    filasSecciones = [filaSeccion(), filaSeccion({ section_id: 82, section_code: "815", asistencia_leida_en: null })];
    consultas.length = 0;
    const res = await pedir("/course-detail/sections");
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { secciones: Array<Record<string, unknown>> };
    expect(cuerpo.secciones.map((s) => [s.idSeccion, s.asistenciaLeidaEn])).toEqual([["81", LEIDA], ["82", null]]);
    expect(cuerpo.secciones[0]).toMatchObject({ asistido: 4, inasistencia: 2, total: 48, horasTranscurridas: 6 });
    const sql = consultas.find((c) => c.sql.includes("left join enrollment mia"))!.sql;
    expect(sql).toContain(`to_char(max(mia.portal_attendance_read_at) at time zone 'utc', ${ISO}) as asistencia_leida_en`);
  });

  test("la sección de GET /course-detail/sections/:sectionId también lo trae", async () => {
    filasSecciones = [filaSeccion()];
    const res = await pedir("/course-detail/sections/81");
    expect(((await res.json()) as { section: Record<string, unknown> }).section.asistenciaLeidaEn).toBe(LEIDA);
  });
});
