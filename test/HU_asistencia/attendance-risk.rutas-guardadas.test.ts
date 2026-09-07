import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-11, cableado end-to-end.
 *
 * `attendance-risk.routes.ts` solo exigía `requireRole("teacher")`: cualquier
 * token de docente leía el riesgo de CUALQUIER sección y podía disparar
 * `POST /notify`, que inserta filas en `alert` — correo académico a alumnos de
 * una sección ajena.
 *
 * De nada sirve `assertTeacherOwnsSection` si una ruta se olvida de llamarla,
 * así que se comprueba sobre las rutas REALES y las tres a la vez.
 */

let esDueño = true;
const consultas: string[] = [];

const fakeDb = {
  execute: async (q: SQL) => {
    const sql = new PgDialect().sqlToQuery(q).sql;
    consultas.push(sql);
    // authMiddleware: Single Active Session.
    if (sql.includes("token_version")) return [{ token_version: 1 }];
    // La guarda de propiedad.
    if (sql.includes("jp_id")) return esDueño ? [{ "?column?": 1 }] : [];
    return [];
  },
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { attendanceRiskRoutes } = await import("../../src/modules/attendance-risk/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

const app = new Hono();
app.onError(errorHandler);
app.route("/", attendanceRiskRoutes);

const tokenDocente = (teacherId: number) =>
  jwt.sign(
    { sub: "1", teacherId, role: "teacher", tokenVersion: 1 },
    config.auth.jwtSecret,
  );

const RUTAS = [
  { metodo: "GET", path: "/sections/42/attendance-risk" },
  { metodo: "GET", path: "/sections/42/attendance-risk/summary" },
  { metodo: "POST", path: "/sections/42/attendance-risk/notify" },
];

const pedir = (metodo: string, path: string) =>
  app.request(path, {
    method: metodo,
    headers: { Authorization: `Bearer ${tokenDocente(7)}` },
  });

describe("un docente ajeno no toca la seccion (IDOR)", () => {
  for (const { metodo, path } of RUTAS) {
    test(`${metodo} ${path} responde 403 NOT_SECTION_TEACHER`, async () => {
      esDueño = false;
      const res = await pedir(metodo, path);
      expect(res.status).toBe(403);
      expect((await res.json() as { error?: { code?: string } }).error?.code).toBe("NOT_SECTION_TEACHER");
    });
  }

  test("POST /notify de un ajeno no llega a insertar ninguna alerta", async () => {
    esDueño = false;
    consultas.length = 0;
    await pedir("POST", "/sections/42/attendance-risk/notify");
    expect(consultas.some((q) => q.toLowerCase().includes("insert into alert"))).toBe(false);
  });
});

describe("el docente de la seccion si pasa", () => {
  for (const { metodo, path } of RUTAS) {
    test(`${metodo} ${path} no responde 403`, async () => {
      esDueño = true;
      const res = await pedir(metodo, path);
      expect(res.status).not.toBe(403);
    });
  }
});
