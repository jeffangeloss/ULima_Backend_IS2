import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-31, RS-BE-32 y RS-BE-33 vistos desde HTTP: las siete rutas de
 * /time-blocks, quién puede entrar y de dónde sale el alumno.
 *
 * La cadena es la real (routes → controller → service → repository) y solo la
 * base es falsa: contesta con filas inventadas y anota `{ sql, params }` de
 * cada consulta, para poder exigir que el `studentId` del token —y ningún
 * otro— llegue al SQL. `mock.module` va ANTES de cualquier `await import(...)`
 * porque `authMiddleware` consulta `token_version` en cada petición y el `.env`
 * del worktree apunta a producción.
 *
 * Datos INVENTADOS (el repo es público). El alumno sintético 20230001 tiene
 * `student.id` 42 en estas pruebas; el 43 es "otro alumno".
 *
 * Calendario 2026: 21-09, 28-09, 05-10, 12-10 y 19-10 son lunes; 23-09, 30-09,
 * 07-10 y 14-10, miércoles; 08-10 es jueves.
 */

type Consulta = { sql: string; params: unknown[] };

/** `student_time_block` como la devuelve Postgres tras los `::text` del
 *  repository: horas con segundos y fechas como texto. */
type FilaBloque = {
  id: number; student_id: number; title: string; color_hex: string;
  days_of_week: number[]; start_time: string; end_time: string;
  start_date: string; end_date: string;
};

type FilaExcepcion = {
  block_id: number; occurrence_date: string; status: string;
  start_time: string | null; end_time: string | null;
};

type Datos = { bloques: FilaBloque[]; excepciones: FilaExcepcion[]; total: number | null };

const ALUMNO = 42;
const OTRO_ALUMNO = 43;

/** Prácticas los lunes y miércoles de 14:00 a 18:00, del 2026-09-01 al 2026-12-15. */
const BLOQUE: FilaBloque = {
  id: 12, student_id: ALUMNO, title: "Practicas preprofesionales", color_hex: "#F94B3F",
  days_of_week: [1, 3], start_time: "14:00:00", end_time: "18:00:00",
  start_date: "2026-09-01", end_date: "2026-12-15",
};

const CANCELADO: FilaExcepcion = {
  block_id: 12, occurrence_date: "2026-10-07", status: "cancelled", start_time: null, end_time: null,
};

const MOVIDO: FilaExcepcion = {
  block_id: 12, occurrence_date: "2026-10-14", status: "moved",
  start_time: "15:00:00", end_time: "19:30:00",
};

const consultas: Consulta[] = [];
let datos: Datos = { bloques: [], excepciones: [], total: null };

const conSegundos = (hora: unknown) => (hora == null ? null : `${String(hora)}:00`);

/**
 * Base falsa. Contesta según la sentencia que arma el repository de la
 * Tarea 3 y según sus parámetros, sin guardar nada entre peticiones: los
 * `returning` se arman con lo que llegó. La tabla de excepciones se mira
 * primero porque su nombre contiene el de la tabla de bloques.
 */
const ejecutar = async (q: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(q);
  consultas.push({ sql, params });
  const texto = sql.toLowerCase().replace(/\s+/g, " ").trim();
  const p = params;

  if (texto.includes("token_version")) return [{ token_version: 1 }];

  if (texto.includes("student_time_block_exception")) {
    if (texto.startsWith("insert")) {
      // upsertException: select b.id, $1..$4 = (fecha, estado, inicio, fin)
      // from student_time_block b where b.id = $5 and b.student_id = $6
      const propio = datos.bloques.some((b) => b.id === p[4] && b.student_id === p[5]);
      if (!propio) return [];
      return [{
        block_id: p[4], occurrence_date: p[0], status: p[1],
        start_time: conSegundos(p[2]), end_time: conSegundos(p[3]),
      }];
    }
    if (texto.startsWith("delete")) {
      // deleteException: b.student_id = $1 and e.block_id = $2 and e.occurrence_date = $3::date
      const propio = datos.bloques.some((b) => b.id === p[1] && b.student_id === p[0]);
      return datos.excepciones
        .filter((e) => propio && e.block_id === p[1] && e.occurrence_date === p[2])
        .map((e) => ({ block_id: e.block_id }));
    }
    // findExceptions: where b.student_id = $1 and e.block_id = any($2 → int[])
    const ids = String(p[1]).split(",").map(Number);
    const propios = datos.bloques
      .filter((b) => b.student_id === p[0] && ids.includes(b.id))
      .map((b) => b.id);
    return datos.excepciones.filter((e) => propios.includes(e.block_id));
  }

  if (texto.includes("count(*)")) {
    return [{ total: datos.total ?? datos.bloques.filter((b) => b.student_id === p[0]).length }];
  }
  if (texto.startsWith("insert")) {
    // insertBlock: (student_id, title, color_hex, días JSON, inicio, fin, desde, hasta)
    return [{
      id: 31, student_id: p[0], title: p[1], color_hex: p[2],
      days_of_week: JSON.parse(String(p[3])),
      start_time: conSegundos(p[4]), end_time: conSegundos(p[5]),
      start_date: p[6], end_date: p[7],
    }];
  }
  if (texto.startsWith("update")) {
    // updateBlock: set … = $1..$7 where id = $8 and student_id = $9
    const propio = datos.bloques.find((b) => b.id === p[7] && b.student_id === p[8]);
    if (!propio) return [];
    return [{
      ...propio, title: p[0], color_hex: p[1], days_of_week: JSON.parse(String(p[2])),
      start_time: conSegundos(p[3]), end_time: conSegundos(p[4]),
      start_date: p[5], end_date: p[6],
    }];
  }
  if (texto.startsWith("delete")) {
    // deleteBlock: where id = $1 and student_id = $2
    return datos.bloques
      .filter((b) => b.id === p[0] && b.student_id === p[1])
      .map((b) => ({ id: b.id }));
  }
  if (p.length === 2) {
    // findBlockOwnedBy: where student_id = $1 and id = $2
    return datos.bloques.filter((b) => b.student_id === p[0] && b.id === p[1]);
  }
  // findBlocks: where student_id = $1
  return datos.bloques.filter((b) => b.student_id === p[0]);
};

const fakeDb = {
  execute: ejecutar,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { TimeBlocksController } = await import(
  "../../src/modules/time-blocks/time-blocks.controller.js"
);
const { TimeBlocksRepository } = await import(
  "../../src/modules/time-blocks/time-blocks.repository.js"
);
const { TimeBlocksService } = await import(
  "../../src/modules/time-blocks/time-blocks.service.js"
);
const { createTimeBlocksRoutes } = await import(
  "../../src/modules/time-blocks/time-blocks.routes.js"
);
const { EventBus } = await import("../../src/events/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

// La cadena se arma a mano, sin pasar por `time-blocks/index.js`: esa instancia
// quedaría atada a la base que se evaluó primero. El composition root se prueba
// aparte, al final, con una petición que no llega a la base.
const app = new Hono();
app.onError(errorHandler);
app.route(
  "/time-blocks",
  createTimeBlocksRoutes(
    new TimeBlocksController(
      new TimeBlocksService(new TimeBlocksRepository(fakeDb as never), new EventBus()),
    ),
  ),
);

const tokenDe = (role: string, studentId = ALUMNO) =>
  jwt.sign({ sub: "1", studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);

const tokenDocente = jwt.sign(
  { sub: "2", teacherId: 7, role: "teacher", tokenVersion: 1 },
  config.auth.jwtSecret,
);

const pedir = async (
  metodo: string,
  ruta: string,
  opciones: { token?: string; body?: unknown; datos?: Partial<Datos> } = {},
) => {
  consultas.length = 0;
  datos = { bloques: [BLOQUE], excepciones: [], total: null, ...(opciones.datos ?? {}) };
  const headers: Record<string, string> = {};
  if (opciones.token) headers.Authorization = `Bearer ${opciones.token}`;
  let body: string | undefined;
  if (opciones.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof opciones.body === "string" ? opciones.body : JSON.stringify(opciones.body);
  }
  return await app.request(ruta, { method: metodo, headers, body });
};

/** Las consultas de la funcionalidad: todas menos el `token_version` del middleware. */
const delModulo = () => consultas.filter((q) => !q.sql.includes("token_version"));

const BODY = {
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-01",
  endDate: "2026-12-15",
};

/** Las siete rutas del contrato, con un pedido válido y su status de éxito. */
const RUTAS: Array<{ metodo: string; ruta: string; body?: unknown; exito: number }> = [
  { metodo: "GET", ruta: "/time-blocks/me", exito: 200 },
  { metodo: "POST", ruta: "/time-blocks/me", body: BODY, exito: 201 },
  { metodo: "PATCH", ruta: "/time-blocks/me/12", body: BODY, exito: 200 },
  { metodo: "DELETE", ruta: "/time-blocks/me/12", exito: 200 },
  {
    metodo: "PUT", ruta: "/time-blocks/me/12/occurrences/2026-10-05",
    body: { status: "cancelled" }, exito: 200,
  },
  { metodo: "DELETE", ruta: "/time-blocks/me/12/occurrences/2026-10-05", exito: 200 },
  {
    metodo: "GET", ruta: "/time-blocks/me/occurrences?from=2026-09-21&to=2026-10-19",
    exito: 200,
  },
];

describe("quien puede entrar a /time-blocks (RS-BE-31)", () => {
  for (const { metodo, ruta, body } of RUTAS) {
    test(`${metodo} ${ruta} sin token responde 401 MISSING_TOKEN`, async () => {
      const res = await pedir(metodo, ruta, { body });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
      expect(consultas).toHaveLength(0);
    });

    test(`${metodo} ${ruta} con token de docente responde 403 FORBIDDEN`, async () => {
      const res = await pedir(metodo, ruta, { token: tokenDocente, body });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
      expect(delModulo()).toHaveLength(0);
    });

    test(`${metodo} ${ruta} con un studentId 0 responde 403 y no consulta nada`, async () => {
      // `authMiddleware` acepta un 0 (es entero): la guarda del controller lo corta.
      const res = await pedir(metodo, ruta, { token: tokenDe("student", 0), body });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
      expect(delModulo()).toHaveLength(0);
    });
  }

  test("un rol que no es de alumno responde 403 aunque el token traiga studentId", async () => {
    // Sin `requireRole`, la guarda del controller lo dejaría pasar: el studentId
    // es válido. Este es el caso que prueba que se mira el rol y no solo el id.
    for (const { metodo, ruta, body } of RUTAS) {
      const res = await pedir(metodo, ruta, { token: tokenDe("admin"), body });
      expect(`${metodo} ${ruta} → ${res.status}`).toBe(`${metodo} ${ruta} → 403`);
      expect(delModulo()).toHaveLength(0);
    }
  });

  test("student, delegate y subdelegate usan las siete rutas", async () => {
    for (const rol of ["student", "delegate", "subdelegate"]) {
      for (const { metodo, ruta, body, exito } of RUTAS) {
        const res = await pedir(metodo, ruta, { token: tokenDe(rol), body });
        expect(`${rol} ${metodo} ${ruta} → ${res.status}`).toBe(`${rol} ${metodo} ${ruta} → ${exito}`);
      }
    }
  });
});

describe("el alumno sale solo del token (RS-BE-31)", () => {
  test("GET /me?studentId=99 lee los bloques del alumno del token", async () => {
    const res = await pedir("GET", "/time-blocks/me?studentId=99", { token: tokenDe("student") });
    expect(res.status).toBe(200);
    const q = delModulo();
    expect(q).toHaveLength(2);
    for (const { sql, params } of q) {
      expect(params[0]).toBe(ALUMNO);
      expect(params).not.toContain(99);
      expect(params).not.toContain("99");
      // El id viaja como parámetro, nunca concatenado en el texto del SQL.
      expect(sql).not.toContain("99");
      expect(sql).not.toContain("42");
    }
  });

  test("un studentId en el body del POST se ignora", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"),
      body: { ...BODY, studentId: 99, student_id: 99 },
    });
    expect(res.status).toBe(201);
    const insert = delModulo().find((q) => q.sql.includes("insert into student_time_block"));
    expect(insert?.params[0]).toBe(ALUMNO);
    for (const { params } of delModulo()) {
      expect(params).not.toContain(99);
      expect(params).not.toContain("99");
    }
  });

  test("GET /me/occurrences?studentId=99 expande los bloques del alumno del token", async () => {
    const res = await pedir(
      "GET", "/time-blocks/me/occurrences?from=2026-09-21&to=2026-10-19&studentId=99",
      { token: tokenDe("student") },
    );
    expect(res.status).toBe(200);
    for (const { params } of delModulo()) {
      expect(params[0]).toBe(ALUMNO);
      expect(params).not.toContain(99);
      expect(params).not.toContain("99");
    }
  });

  test("no hay ruta con un alumno en el path ni un GET de un bloque suelto", async () => {
    for (const ruta of ["/time-blocks/99", "/time-blocks/99/me", "/time-blocks/me/12"]) {
      const res = await pedir("GET", ruta, { token: tokenDe("student") });
      expect(res.status).toBe(404);
      expect(delModulo()).toHaveLength(0);
    }
  });
});

describe("contrato de las siete rutas", () => {
  test("GET /me devuelve los bloques con sus excepciones", async () => {
    const res = await pedir("GET", "/time-blocks/me", {
      token: tokenDe("student"),
      datos: { excepciones: [CANCELADO, MOVIDO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      blocks: [{
        id: 12,
        title: "Practicas preprofesionales",
        colorHex: "#F94B3F",
        daysOfWeek: [1, 3],
        startTime: "14:00",
        endTime: "18:00",
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        exceptions: [
          { date: "2026-10-07", status: "cancelled", startTime: null, endTime: null },
          { date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:30" },
        ],
      }],
    });
  });

  test("GET /me sin bloques devuelve la lista vacia", async () => {
    const res = await pedir("GET", "/time-blocks/me", {
      token: tokenDe("student"),
      datos: { bloques: [] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ blocks: [] });
  });

  test("POST /me crea el bloque y responde 201 sin excepciones", async () => {
    const res = await pedir("POST", "/time-blocks/me", { token: tokenDe("student"), body: BODY });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ block: { id: 31, ...BODY, exceptions: [] } });
  });

  test("PATCH /me/:id reemplaza la regla y conserva las excepciones", async () => {
    const res = await pedir("PATCH", "/time-blocks/me/12", {
      token: tokenDe("student"),
      body: { ...BODY, startTime: "15:00", endTime: "19:00" },
      datos: { excepciones: [CANCELADO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      block: {
        id: 12, ...BODY, startTime: "15:00", endTime: "19:00",
        exceptions: [{ date: "2026-10-07", status: "cancelled", startTime: null, endTime: null }],
      },
    });
    for (const { sql } of delModulo()) expect(sql.toLowerCase()).not.toContain("delete");
  });

  test("DELETE /me/:id responde { ok: true } y borra acotado por el alumno", async () => {
    const res = await pedir("DELETE", "/time-blocks/me/12", { token: tokenDe("student") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const borrado = delModulo().find((q) => q.sql.includes("delete from student_time_block"));
    expect(borrado?.params).toEqual([12, ALUMNO]);
  });

  test("PUT de una ocurrencia cancelada responde la excepcion, sin blockId", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-07", {
      token: tokenDe("student"),
      body: { status: "cancelled" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      exception: { date: "2026-10-07", status: "cancelled", startTime: null, endTime: null },
    });
  });

  test("PUT de una ocurrencia movida responde las horas nuevas", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-14", {
      token: tokenDe("student"),
      body: { status: "moved", startTime: "15:00", endTime: "19:00" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      exception: { date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:00" },
    });
  });

  test("repetir el mismo PUT deja el mismo estado (RS-BE-32)", async () => {
    const pedido = {
      token: tokenDe("student"),
      body: { status: "moved", startTime: "15:00", endTime: "19:00" },
    };
    const primero = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-14", pedido);
    const cuerpo1 = await primero.json();
    const sql1 = delModulo();
    const segundo = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-14", pedido);
    expect(await segundo.json()).toEqual(cuerpo1);
    expect(delModulo()).toEqual(sql1);
  });

  test("DELETE de una ocurrencia responde { ok: true }", async () => {
    const res = await pedir("DELETE", "/time-blocks/me/12/occurrences/2026-10-07", {
      token: tokenDe("student"),
      datos: { excepciones: [CANCELADO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET /me/occurrences devuelve las ocurrencias y las horas por semana", async () => {
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-09-21&to=2026-10-19", {
      token: tokenDe("student"),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      occurrences: Array<{ date: string } & Record<string, unknown>>;
      weeks: Array<{ weekStart: string; hours: number }>;
    };
    expect(dto.occurrences[0]).toEqual({
      blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
      date: "2026-09-21", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", moved: false,
    });
    expect(dto.occurrences.map((o) => o.date)).toEqual([
      "2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30", "2026-10-05",
      "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19",
    ]);
    // La ventana termina el lunes 19-10, pero su semana suma entera: lunes 19
    // y miercoles 21 (RS-BE-34, "el de la semana entera").
    expect(dto.weeks).toEqual([
      { weekStart: "2026-09-21", hours: 8 },
      { weekStart: "2026-09-28", hours: 8 },
      { weekStart: "2026-10-05", hours: 8 },
      { weekStart: "2026-10-12", hours: 8 },
      { weekStart: "2026-10-19", hours: 8 },
    ]);
  });

  test("GET /me/occurrences aplica el dia cancelado y el movido", async () => {
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-10-05&to=2026-10-18", {
      token: tokenDe("student"),
      datos: { excepciones: [CANCELADO, MOVIDO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      occurrences: [
        {
          blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
          date: "2026-10-05", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", moved: false,
        },
        {
          blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
          date: "2026-10-12", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", moved: false,
        },
        {
          blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
          date: "2026-10-14", dayOfWeek: 3, startTime: "15:00", endTime: "19:30", moved: true,
        },
      ],
      weeks: [
        { weekStart: "2026-10-05", hours: 4 },
        { weekStart: "2026-10-12", hours: 8.5 },
      ],
    });
  });
});

describe("errores de validacion", () => {
  test("un color invalido responde 400 INVALID_REQUEST_BODY sin consultar", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: { ...BODY, colorHex: "azul" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST_BODY" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("la fecha de fin antes de la de inicio responde 400 con el campo culpable", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: { ...BODY, startDate: "2026-12-15", endDate: "2026-09-01" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST_BODY",
        details: { fieldErrors: { endDate: ["La fecha de fin no puede ser anterior a la de inicio."] } },
      },
    });
  });

  test("un body que no es JSON responde 400 INVALID_JSON_BODY", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: "esto no es json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_JSON_BODY" } });
  });

  test("un PATCH sin titulo responde 400 INVALID_REQUEST_BODY sin consultar", async () => {
    const { title: _sinTitulo, ...sinTitulo } = BODY;
    const res = await pedir("PATCH", "/time-blocks/me/12", {
      token: tokenDe("student"), body: sinTitulo,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST_BODY" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("un id de bloque que no es entero positivo o no cabe en integer responde 400 INVALID_ROUTE_PARAMS", async () => {
    // 3000000000 pasa `.positive()`, pero contra la columna integer Postgres
    // responderia 22003 y el errorHandler lo volveria un 500.
    for (const id of ["abc", "0", "-3", "3000000000"]) {
      const res = await pedir("PATCH", `/time-blocks/me/${id}`, {
        token: tokenDe("student"), body: BODY,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "INVALID_ROUTE_PARAMS" } });
    }
    expect(delModulo()).toHaveLength(0);
  });

  test("una fecha de ocurrencia mal escrita responde 400 INVALID_ROUTE_PARAMS", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/05-10-2026", {
      token: tokenDe("student"), body: { status: "cancelled" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_ROUTE_PARAMS" } });
  });

  test("un moved sin horas responde 400 INVALID_REQUEST_BODY", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-05", {
      token: tokenDe("student"), body: { status: "moved" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST_BODY" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("GET /me/occurrences sin ventana responde 400 INVALID_QUERY_PARAMS", async () => {
    // Además fija el orden de las rutas: si un `GET /me/:id` la capturara, esto
    // sería INVALID_ROUTE_PARAMS o un 404.
    for (const ruta of [
      "/time-blocks/me/occurrences",
      "/time-blocks/me/occurrences?from=2026-09-21",
    ]) {
      const res = await pedir("GET", ruta, { token: tokenDe("student") });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "INVALID_QUERY_PARAMS" } });
    }
  });
});

describe("errores de las reglas (RS-BE-31, RS-BE-32 y RS-BE-33)", () => {
  test("una ventana de 200 dias responde 400 TIME_BLOCK_WINDOW_TOO_WIDE sin consultar", async () => {
    // Del 2026-09-01 al 2027-03-19 son 200 días contando los dos extremos.
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-09-01&to=2027-03-19", {
      token: tokenDe("student"),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "TIME_BLOCK_WINDOW_TOO_WIDE" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("una ventana al reves responde 400 INVALID_QUERY_PARAMS, no TIME_BLOCK_WINDOW_TOO_WIDE", async () => {
    // La spec reserva TIME_BLOCK_WINDOW_TOO_WIDE para los 120 dias: una
    // ventana al reves es una query mal armada.
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-10-19&to=2026-09-21", {
      token: tokenDe("student"),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_QUERY_PARAMS" } });
  });

  test("un bloque fuera de 07:00-22:00 responde 400 TIME_BLOCK_OUT_OF_GRID sin consultar", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: { ...BODY, startTime: "06:00", endTime: "09:00" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "TIME_BLOCK_OUT_OF_GRID" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("con 20 bloques el POST responde 400 TIME_BLOCK_LIMIT_REACHED y no inserta", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: BODY, datos: { total: 20 },
    });
    expect(res.status).toBe(400);
    // RS-BE-31: el mensaje dice que cuentan los guardados, vencidos incluidos, y
    // sugiere borrar uno viejo. Va dentro del mismo toMatchObject: no suma aserciones.
    expect(await res.json()).toMatchObject({
      error: {
        code: "TIME_BLOCK_LIMIT_REACHED",
        message:
          "Llegaste al máximo de 20 bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro.",
      },
    });
    expect(delModulo().some((q) => q.sql.includes("insert"))).toBe(false);
  });

  test("una fecha fuera del patron responde 400 TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN", async () => {
    // 2026-10-08 es jueves y el bloque es lunes y miércoles.
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-08", {
      token: tokenDe("student"), body: { status: "cancelled" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" },
    });
    expect(delModulo().some((q) => q.sql.includes("insert"))).toBe(false);
  });

  const ESCRITURAS = RUTAS.filter((r) => r.ruta.startsWith("/time-blocks/me/12"));

  for (const { metodo, ruta, body } of ESCRITURAS) {
    test(`${metodo} ${ruta} sobre el bloque de otro alumno responde 404 TIME_BLOCK_NOT_FOUND`, async () => {
      const res = await pedir(metodo, ruta, { token: tokenDe("student", OTRO_ALUMNO), body });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: { code: "TIME_BLOCK_NOT_FOUND" } });
      // Cada consulta va con el alumno del token, nunca con el dueño del bloque.
      for (const { params } of delModulo()) {
        expect(params).toContain(OTRO_ALUMNO);
        expect(params).not.toContain(ALUMNO);
      }
      expect(delModulo().some((q) => q.sql.includes("student_time_block_exception"))).toBe(false);
    });
  }

  test("el 404 de un bloque ajeno es identico al de un bloque que no existe", async () => {
    // 404 y no 403: la respuesta no revela que el bloque 12 existe.
    const ajeno = await pedir("DELETE", "/time-blocks/me/12", {
      token: tokenDe("student", OTRO_ALUMNO),
    });
    const inexistente = await pedir("DELETE", "/time-blocks/me/999", { token: tokenDe("student") });
    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await ajeno.json()).toEqual(await inexistente.json());
  });
});

describe("modulo y registro", () => {
  test("el composition root expone las siete rutas detras de la autenticacion", async () => {
    const { timeBlocksRoutes } = await import("../../src/modules/time-blocks/index.js");
    const rutas = timeBlocksRoutes.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => `${r.method} ${r.path}`);
    expect(rutas).toEqual([
      "GET /me/occurrences",
      "GET /me",
      "POST /me",
      "PATCH /me/:id",
      "DELETE /me/:id",
      "PUT /me/:id/occurrences/:date",
      "DELETE /me/:id/occurrences/:date",
    ]);
    // Montado como lo monta `src/modules/index.ts`. Sin token corta el
    // middleware y no llega a la base, así que esto no depende de con qué base
    // se evaluó el módulo.
    const raiz = new Hono();
    raiz.onError(errorHandler);
    raiz.route("/time-blocks", timeBlocksRoutes);
    const res = await raiz.request("/time-blocks/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
  });

  test("src/modules/index.ts monta el modulo en /time-blocks", async () => {
    const texto = await Bun.file("src/modules/index.ts").text();
    expect(texto).toContain('import { timeBlocksRoutes } from "./time-blocks/index.js";');
    expect(texto).toContain('app.route("/time-blocks", timeBlocksRoutes);');
  });

  test("src/server.ts deja pasar PATCH en el preflight del CORS", async () => {
    // PATCH /time-blocks/me/:id es la primera ruta PATCH del backend (RS-BE-31).
    // La app nativa no hace preflight, pero la build web si: sin el verbo en
    // allowMethods, el navegador corta la edicion de un bloque antes de llegar
    // a la ruta. Se lee el archivo en vez de importar src/server.ts, que
    // registraria todos los modulos (Firebase incluido) y dejaria salida propia.
    const texto = await Bun.file("src/server.ts").text();
    expect(texto).toContain('allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],');
  });
});
