import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  SPECIALTY_TEST_MAX_PER_HOUR,
  specialtyTestRateLimit,
} from "../../src/shared/middleware/rate-limit.js";

/**
 * RS-BE-46: `specialtyTestRateLimit`, 30 evaluaciones por alumno por hora.
 *
 * Se monta el middleware solo, detrás de un paso que pone el `studentId` como
 * lo haría `authMiddleware`. El contador vive en la memoria del módulo y bun
 * comparte el módulo entre archivos, así que cada prueba usa ids propios, lejos
 * de los de `specialty-test.routes.test.ts`.
 */

const app = new Hono<{ Variables: { studentId?: number } }>();
app.use("*", async (c, next) => {
  const id = c.req.header("X-Alumno");
  if (id) c.set("studentId", Number(id));
  await next();
});
app.post("/evaluar", specialtyTestRateLimit, (c) => c.json({ ok: true }));

const evaluar = (alumno?: number) =>
  app.request("/evaluar", { method: "POST", headers: alumno === undefined ? {} : { "X-Alumno": String(alumno) } });

describe("specialtyTestRateLimit (RS-BE-46)", () => {
  test("el tope es 30 por hora", () => {
    expect(SPECIALTY_TEST_MAX_PER_HOUR).toBe(30);
  });

  test("deja pasar 30 y responde 429 en la 31 con el mensaje y los minutos", async () => {
    const alumno = 9_000_001;
    for (let i = 1; i <= 30; i++) {
      const res = await evaluar(alumno);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(30 - i));
    }
    const res = await evaluar(alumno);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Hiciste demasiados intentos del test. Intenta de nuevo en 60 minuto(s).",
        details: { retryAfterMinutes: 60 },
      },
    });
  });

  test("cada alumno lleva su propio contador", async () => {
    for (let i = 0; i < 31; i++) await evaluar(9_000_002);
    expect((await evaluar(9_000_002)).status).toBe(429);
    expect((await evaluar(9_000_003)).status).toBe(200);
  });

  test("sin alumno en el contexto no cuenta y deja pasar", async () => {
    for (let i = 0; i < 35; i++) expect((await evaluar()).status).toBe(200);
  });

  test("no comparte el contador con el del chatbot", async () => {
    const { chatbotRateLimit } = await import("../../src/shared/middleware/rate-limit.js");
    expect(chatbotRateLimit).not.toBe(specialtyTestRateLimit);
    const texto = await Bun.file("src/shared/middleware/rate-limit.ts").text();
    expect(texto).toContain("const specialtyTestStore = new Map<number, RateLimitEntry>();");
  });
});
