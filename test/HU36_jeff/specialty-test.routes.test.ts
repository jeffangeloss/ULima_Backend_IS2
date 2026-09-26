import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-38, RS-BE-39, RS-BE-45 y RS-BE-46 vistos desde HTTP: las tres rutas
 * de /specialty-test, quién entra, de dónde sale el alumno, el orden de la
 * validación, los límites y la forma de cada error.
 *
 * La cadena es la real (routes → controller → service → repository) y solo la
 * base y Cohere son falsos. La base contesta según el texto de cada sentencia
 * y anota `{ sql, params }`, para exigir que el `studentId` del token, y
 * ningún otro, llegue al SQL. `mock.module` va ANTES de cualquier
 * `await import(...)` porque `authMiddleware` consulta `token_version` en cada
 * petición y el `.env` del worktree apunta a producción.
 *
 * El contador de `specialtyTestRateLimit` vive en la memoria del módulo y bun
 * comparte el módulo entre archivos, así que cada petición usa un alumno nuevo
 * salvo que la prueba pida uno fijo.
 *
 * Datos INVENTADOS (el repo es público): el alumno sintético 20230001; los ids
 * de especialidad 1, 5, 6 y 7 son ilustrativos.
 */

type Consulta = { sql: string; params: unknown[] };

interface Datos {
  alumno: boolean;
  activas: Array<{ id: number; name: string }>;
  fila: Record<string, unknown> | null;
  guardadoFalla: boolean;
}

const FECHA = "2026-09-25T20:15:00.000Z";
const ACTIVAS = [
  { id: 1, name: "Ingeniería de Software" },
  { id: 5, name: "Tecnologías de la Información" },
  { id: 6, name: "Sistemas de Información" },
  { id: 7, name: "Desarrollo de Videojuegos" },
];

const consultas: Consulta[] = [];
let datos: Datos = { alumno: true, activas: ACTIVAS, fila: null, guardadoFalla: false };

const ejecutar = async (q: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(q);
  consultas.push({ sql, params });
  const texto = sql.toLowerCase().replace(/\s+/g, " ").trim();

  if (texto.includes("token_version")) return [{ token_version: 1 }];
  if (texto.startsWith("insert into student_specialty_test_result")) {
    if (datos.guardadoFalla) throw new Error("fallo de la base");
    return [{ completed_at: FECHA }];
  }
  if (texto.includes("from student_specialty_test_result")) return datos.fila ? [datos.fila] : [];
  if (texto.includes("from specialty")) return datos.activas;
  if (texto.includes("from student")) return datos.alumno ? [{ career_id: 3 }] : [];
  throw new Error(`consulta inesperada: ${texto}`);
};

const fakeDb = {
  execute: ejecutar,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { SpecialtyTestController } = await import("../../src/modules/specialty-test/specialty-test.controller.js");
const { SpecialtyTestRepository } = await import("../../src/modules/specialty-test/specialty-test.repository.js");
const { SpecialtyTestService } = await import("../../src/modules/specialty-test/specialty-test.service.js");
const { createSpecialtyTestRoutes } = await import("../../src/modules/specialty-test/specialty-test.routes.js");
const { CONTENT_BY_VERSION, CONTENT_REGISTRY, CURRENT_VERSION } = await import(
  "../../src/modules/specialty-test/content/index.js"
);
const { EventBus } = await import("../../src/events/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const ejemplo = (id: string) => c.weights.examples.find((e) => e.id === id)!;

/** Lo que responde el Cohere falso; cada prueba puede cambiarlo. */
let respuestaCohere: () => Promise<string> = async () => "";
let llamadasCohere = 0;

const app = new Hono();
app.onError(errorHandler);
app.route(
  "/specialty-test",
  createSpecialtyTestRoutes(
    new SpecialtyTestController(
      new SpecialtyTestService(
        new SpecialtyTestRepository(fakeDb as never),
        new EventBus(),
        {
          chatWithHistory: async () => {
            llamadasCohere++;
            return respuestaCohere();
          },
        },
        CONTENT_REGISTRY,
      ),
    ),
  ),
);

let siguienteAlumno = 5000;
const alumnoNuevo = () => ++siguienteAlumno;

const tokenDe = (role: string, studentId: number) =>
  jwt.sign({ sub: "1", studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);

const tokenDocente = jwt.sign({ sub: "2", teacherId: 7, role: "teacher", tokenVersion: 1 }, config.auth.jwtSecret);

const pedir = async (
  metodo: string,
  ruta: string,
  opciones: { token?: string | null; body?: unknown; datos?: Partial<Datos> } = {},
) => {
  consultas.length = 0;
  llamadasCohere = 0;
  datos = { alumno: true, activas: ACTIVAS, fila: null, guardadoFalla: false, ...(opciones.datos ?? {}) };
  const headers: Record<string, string> = {};
  const token = opciones.token === undefined ? tokenDe("student", alumnoNuevo()) : opciones.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (opciones.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof opciones.body === "string" ? opciones.body : JSON.stringify(opciones.body);
  }
  return await app.request(ruta, { method: metodo, headers, body });
};

const delModulo = () => consultas.filter((q) => !q.sql.includes("token_version"));

const CUERPO = (id = "ejemplo-2", tiebreakAnswers: unknown[] = []) => ({
  version: CURRENT_VERSION,
  answers: { ...ejemplo(id).answers },
  tiebreakAnswers,
});

const RUTAS: Array<{ metodo: string; ruta: string; body?: unknown }> = [
  { metodo: "GET", ruta: "/specialty-test/content" },
  { metodo: "POST", ruta: "/specialty-test/me/evaluate", body: CUERPO() },
  { metodo: "GET", ruta: "/specialty-test/me/result" },
];

let errores: ReturnType<typeof spyOn>;
let avisos: ReturnType<typeof spyOn>;
beforeEach(() => {
  respuestaCohere = async () => "";
  errores = spyOn(console, "error").mockImplementation(() => {});
  avisos = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  errores.mockRestore();
  avisos.mockRestore();
});

describe("quien puede entrar a /specialty-test (RS-BE-46)", () => {
  for (const { metodo, ruta, body } of RUTAS) {
    test(`${metodo} ${ruta} sin token responde 401 MISSING_TOKEN`, async () => {
      const res = await pedir(metodo, ruta, { token: null, body });
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
      const res = await pedir(metodo, ruta, { token: tokenDe("student", 0), body });
      expect(res.status).toBe(403);
      expect(delModulo()).toHaveLength(0);
    });
  }

  test("delegado y subdelegado entran como alumnos", async () => {
    for (const rol of ["delegate", "subdelegate"]) {
      const res = await pedir("GET", "/specialty-test/content", { token: tokenDe(rol, alumnoNuevo()) });
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /specialty-test/content (RS-BE-38)", () => {
  test("200 con la version vigente, los specialtyId del alumno y sin no-store", async () => {
    const alumno = alumnoNuevo();
    const res = await pedir("GET", "/specialty-test/content", { token: tokenDe("student", alumno) });
    expect(res.status).toBe(200);
    const cuerpo = await res.json() as { version: string; specialties: Array<{ key: string; specialtyId: number }> };
    expect(cuerpo.version).toBe(CURRENT_VERSION);
    expect(cuerpo.specialties.map((s) => s.specialtyId)).toEqual([1, 5, 6, 7]);
    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(delModulo().map((q) => q.params)).toEqual([[alumno], [3]]);
  });

  test("404 SPECIALTY_TEST_NOT_AVAILABLE si falta una activa y 404 USER_NOT_FOUND sin alumno", async () => {
    let res = await pedir("GET", "/specialty-test/content", { datos: { activas: ACTIVAS.slice(1) } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "SPECIALTY_TEST_NOT_AVAILABLE", message: "El test de especialidad no está disponible para tu carrera." },
    });
    res = await pedir("GET", "/specialty-test/content", { datos: { alumno: false } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "USER_NOT_FOUND" } });
  });
});

describe("POST /specialty-test/me/evaluate (RS-BE-39 y RS-BE-46)", () => {
  test("recorrido del ejemplo-2: dos desempates y el resultado, con el alumno del token", async () => {
    const alumno = alumnoNuevo();
    const token = tokenDe("student", alumno);
    let res = await pedir("POST", "/specialty-test/me/evaluate", { token, body: { ...CUERPO(), studentId: 99 } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "tiebreak", tiebreak: { id: "tb-si-vj-1" } });
    expect(delModulo().some((q) => q.sql.toLowerCase().includes("insert"))).toBe(false);

    res = await pedir("POST", "/specialty-test/me/evaluate", {
      token, body: CUERPO("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }]),
    });
    expect(await res.json()).toMatchObject({ status: "tiebreak", tiebreak: { id: "tb-si-vj-2" } });

    res = await pedir("POST", "/specialty-test/me/evaluate", {
      token,
      body: CUERPO("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }, { id: "tb-si-vj-2", answer: "top" }]),
    });
    expect(res.status).toBe(200);
    const cuerpo = await res.json() as { status: string; result: Record<string, unknown> };
    expect(cuerpo.status).toBe("result");
    expect(cuerpo.result).toMatchObject({
      version: CURRENT_VERSION, completedAt: FECHA, tie: false,
      reason: ejemplo("ejemplo-2").reasonText, reasonSource: "templates",
    });
    const insercion = delModulo().find((q) => q.sql.trim().toLowerCase().startsWith("insert"));
    expect(insercion?.params[0]).toBe(alumno);
    expect(delModulo().every((q) => !q.params.includes(99))).toBe(true);
  });

  test("400 INVALID_JSON_BODY con un cuerpo que no es JSON", async () => {
    const res = await pedir("POST", "/specialty-test/me/evaluate", { body: "{no es json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_JSON_BODY" } });
  });

  test("400 INVALID_REQUEST_BODY con los campos en details.fieldErrors", async () => {
    const casos: Array<[unknown, string]> = [
      [{ ...CUERPO(), version: "ultima" }, "version"],
      [{ ...CUERPO(), version: `2026-09-25.${"1".repeat(20)}` }, "version"],
      [{ ...CUERPO(), answers: { pregunta1: "top" } }, "answers"],
      [{ ...CUERPO(), answers: { q01: "tal_vez" } }, "answers"],
      [{ ...CUERPO(), answers: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`q${String(i).padStart(2, "0")}`, "top"])) }, "answers"],
      [{ ...CUERPO(), tiebreakAnswers: [{ id: "a", answer: "top" }, { id: "b", answer: "top" }, { id: "c", answer: "top" }] }, "tiebreakAnswers"],
      [{ ...CUERPO(), tiebreakAnswers: [{ id: "x".repeat(25), answer: "top" }] }, "tiebreakAnswers"],
      [{ ...CUERPO(), tiebreakAnswers: [{ id: "tb-si-vj-1", answer: "nada" }] }, "tiebreakAnswers"],
    ];
    for (const [cuerpo, campo] of casos) {
      const res = await pedir("POST", "/specialty-test/me/evaluate", { body: cuerpo });
      expect(res.status).toBe(400);
      const json = await res.json() as { error: { code: string; details: { fieldErrors: Record<string, unknown> } } };
      expect(json.error.code).toBe("INVALID_REQUEST_BODY");
      expect(Object.keys(json.error.details.fieldErrors)).toContain(campo);
    }
  });

  test("tiebreakAnswers es opcional", async () => {
    const { tiebreakAnswers: _omitido, ...sinDesempates } = CUERPO();
    const res = await pedir("POST", "/specialty-test/me/evaluate", { body: sinDesempates });
    expect(await res.json()).toMatchObject({ status: "tiebreak" });
  });

  test("409, 400 de respuestas y 400 de desempate con sus details", async () => {
    let res = await pedir("POST", "/specialty-test/me/evaluate", { body: { ...CUERPO(), version: "2026-09-25.3" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "SPECIALTY_TEST_VERSION_OUTDATED",
        message: "El test se actualizó. Vuelve a empezarlo.",
        details: { currentVersion: CURRENT_VERSION },
      },
    });

    const { q14: _q14, ...sinUna } = ejemplo("ejemplo-2").answers;
    res = await pedir("POST", "/specialty-test/me/evaluate", { body: { ...CUERPO(), answers: sinUna } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "SPECIALTY_TEST_INVALID_ANSWERS", details: { missing: ["q14"], unexpected: [], invalid: [] } },
    });

    res = await pedir("POST", "/specialty-test/me/evaluate", {
      body: CUERPO("ejemplo-2", [{ id: "tb-sw-ti-1", answer: "top" }]),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "SPECIALTY_TEST_TIEBREAK_MISMATCH", details: { expected: "tb-si-vj-1" } },
    });
  });

  test("413 PAYLOAD_TOO_LARGE con la forma de error de siempre y no-store", async () => {
    const res = await pedir("POST", "/specialty-test/me/evaluate", {
      body: { ...CUERPO(), relleno: "x".repeat(5000) },
    });
    expect(res.status).toBe(413);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "La petición es demasiado grande." },
    });
    expect(delModulo()).toHaveLength(0);
  });

  test("un cuerpo de 4 KiB justos todavia entra", async () => {
    const base = JSON.stringify({ ...CUERPO(), relleno: "" });
    const cuerpo = JSON.stringify({ ...CUERPO(), relleno: "x".repeat(4096 - Buffer.byteLength(base)) });
    expect(Buffer.byteLength(cuerpo)).toBe(4096);
    const res = await pedir("POST", "/specialty-test/me/evaluate", { body: cuerpo });
    expect(res.status).toBe(200);
  });

  test("500 si falla el guardado, sin llamar a Cohere", async () => {
    const res = await pedir("POST", "/specialty-test/me/evaluate", {
      body: CUERPO("ejemplo-1"), datos: { guardadoFalla: true },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "INTERNAL_SERVER_ERROR" } });
    expect(llamadasCohere).toBe(0);
  });

  test("un fallo de Cohere nunca llega a la app y ningun console lleva respuestas, textos ni ids", async () => {
    const alumno = alumnoNuevo();
    respuestaCohere = async () => {
      throw new Error(`Cohere Chat error 500: secreto-de-cohere ${alumno}`);
    };
    const res = await pedir("POST", "/specialty-test/me/evaluate", {
      token: tokenDe("student", alumno), body: CUERPO("ejemplo-1"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { reasonSource: "templates" } });
    const registrado = [...avisos.mock.calls, ...errores.mock.calls].flat().map(String).join("\n");
    expect(registrado).toBe("[specialty-test] motivo con plantillas: http");
    for (const prohibido of ["secreto-de-cohere", String(alumno), "me_encantaria", ejemplo("ejemplo-1").reasonText]) {
      expect(registrado).not.toContain(prohibido);
    }
  });
});

describe("GET /specialty-test/me/result (RS-BE-45)", () => {
  const FILA = {
    content_version: CURRENT_VERSION,
    ranking: [
      { key: "vj", specialtyId: 7, affinity: 75 },
      { key: "si", specialtyId: 6, affinity: 65 },
      { key: "ti", specialtyId: 5, affinity: 28 },
      { key: "sw", specialtyId: 1, affinity: 24 },
    ],
    is_tie: false,
    completed_at: FECHA,
  };

  test("200 con result null si no hay test terminado, y no-store", async () => {
    const res = await pedir("GET", "/specialty-test/me/result");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ result: null });
  });

  test("200 con el ultimo resultado", async () => {
    const res = await pedir("GET", "/specialty-test/me/result", { datos: { fila: FILA } });
    expect(await res.json()).toEqual({
      result: {
        version: CURRENT_VERSION,
        isCurrentVersion: true,
        completedAt: FECHA,
        tie: false,
        ranking: [
          { key: "vj", specialtyId: 7, name: "Desarrollo de Videojuegos", affinity: 75 },
          { key: "si", specialtyId: 6, name: "Sistemas de Información", affinity: 65 },
          { key: "ti", specialtyId: 5, name: "Tecnologías de la Información", affinity: 28 },
          { key: "sw", specialtyId: 1, name: "Ingeniería de Software", affinity: 24 },
        ],
      },
    });
  });

  test("404 SPECIALTY_TEST_NOT_AVAILABLE aunque haya fila guardada", async () => {
    const res = await pedir("GET", "/specialty-test/me/result", { datos: { fila: FILA, activas: [] } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "SPECIALTY_TEST_NOT_AVAILABLE" } });
    expect(delModulo().some((q) => q.sql.includes("student_specialty_test_result"))).toBe(false);
  });

  test("500 con un ranking corrupto", async () => {
    const res = await pedir("GET", "/specialty-test/me/result", {
      datos: { fila: { ...FILA, ranking: [{ key: "vj" }] } },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "INTERNAL_SERVER_ERROR" } });
  });
});

describe("limite de tasa en las rutas (RS-BE-46)", () => {
  test("la evaluacion 31 de la hora responde 429 y las dos GET siguen sin limite", async () => {
    const token = tokenDe("student", alumnoNuevo());
    for (let i = 1; i <= 30; i++) {
      const res = await pedir("POST", "/specialty-test/me/evaluate", { token, body: CUERPO() });
      expect(res.status).toBe(200);
    }
    const res = await pedir("POST", "/specialty-test/me/evaluate", { token, body: CUERPO() });
    expect(res.status).toBe(429);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Hiciste demasiados intentos del test. Intenta de nuevo en 60 minuto(s).",
        details: { retryAfterMinutes: 60 },
      },
    });
    for (let i = 0; i < 31; i++) {
      expect((await pedir("GET", "/specialty-test/content", { token })).status).toBe(200);
      expect((await pedir("GET", "/specialty-test/me/result", { token })).status).toBe(200);
    }
  });

  test("el tamano va antes que el limite y el limite antes que la forma", async () => {
    const token = tokenDe("student", alumnoNuevo());
    for (let i = 0; i < 30; i++) await pedir("POST", "/specialty-test/me/evaluate", { token, body: "{}" });
    const grande = await pedir("POST", "/specialty-test/me/evaluate", { token, body: "x".repeat(5000) });
    expect(grande.status).toBe(413);
    const noJson = await pedir("POST", "/specialty-test/me/evaluate", { token, body: "{no es json" });
    expect(noJson.status).toBe(429);
  });
});

describe("registro del modulo", () => {
  test("el composition root expone las tres rutas detras de la autenticacion", async () => {
    const { specialtyTestRoutes } = await import("../../src/modules/specialty-test/index.js");
    // Hono anota una entrada por cada handler de la ruta (no-store, bodyLimit,
    // límite y controller), así que se comparan las rutas sin repetir.
    const rutas = specialtyTestRoutes.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => `${r.method} ${r.path}`);
    expect([...new Set(rutas)]).toEqual(["GET /content", "POST /me/evaluate", "GET /me/result"]);
    const raiz = new Hono();
    raiz.onError(errorHandler);
    raiz.route("/specialty-test", specialtyTestRoutes);
    const res = await raiz.request("/specialty-test/content");
    expect(res.status).toBe(401);
  });

  test("src/modules/index.ts monta el modulo en /specialty-test", async () => {
    const texto = await Bun.file("src/modules/index.ts").text();
    expect(texto).toContain('import { specialtyTestRoutes } from "./specialty-test/index.js";');
    expect(texto).toContain('app.route("/specialty-test", specialtyTestRoutes);');
  });
});
