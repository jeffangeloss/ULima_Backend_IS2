import { describe, expect, test } from "bun:test";
import { leerAsistencia } from "../../src/modules/portal-sync/refresh/fase-asistencia.js";
import { leerNotas } from "../../src/modules/portal-sync/refresh/fase-notas.js";
import type { Pedir } from "../../src/modules/portal-sync/refresh/refresh.types.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import {
  ALUMNO, CICLO, CURSOS, MENU_ASISTENCIA, MENU_NOTA, asistenciaDe, aulaDe, marco, menuLista, notaDe, pedirFalso,
} from "./recarga.dobles.js";
import { STUDENT_ID, armar } from "./recarga.servicio.js";

/**
 * RS-BE-50 · presupuesto de tiempo y tope de concurrencia, con un reloj falso
 * que avanza solo cuando se pide una página.
 */

describe("RS-BE-50 · presupuesto y concurrencia en la fase de asistencia", () => {
  test("ninguna página se pide después del plazo y las que faltan quedan not_reached", async () => {
    const f = pedirFalso((path) => asistenciaDe(aulaDe(path)), { t: 30_000, paso: 10_000 });
    const fase = await leerAsistencia(
      { pedir: f.pedir, now: () => f.reloj.t, deadline: 60_000 }, { ok: true, html: MENU_ASISTENCIA }, ALUMNO, CICLO,
    );
    expect(f.pedidos.map((p) => p.t)).toEqual([30_000, 40_000, 50_000]);
    expect(fase.aulas.map((a) => a.estado)).toEqual(["leida", "leida", "leida", "not_reached", "not_reached"]);
  });

  test("nunca hay más de cinco peticiones en vuelo", async () => {
    const aulas = Array.from({ length: 8 }, (_, i) => ({ aula: String(900101 + i), seccion: "812" }));
    let enVuelo = 0;
    let maximo = 0;
    const pedir: Pedir = async () => {
      enVuelo++;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((r) => setTimeout(r, 5));
      enVuelo--;
      return "<html></html>";
    };
    const fase = await leerAsistencia(
      { pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: menuLista("OpenAsistenciaAlumno", aulas) }, ALUMNO, CICLO,
    );
    expect(fase.aulas).toHaveLength(8);
    expect(maximo).toBe(5);
  });
});

describe("RS-BE-50 · presupuesto en la fase de notas", () => {
  test("pasado el plazo no se pide el marco ni el curso siguiente, y la identificación queda", async () => {
    const respuestasNotas = (path: string): string => {
      const aula = aulaDe(path);
      return path === PORTAL_PATHS.notaCurso(aula) ? notaDe(aula) : marco();
    };
    const f = pedirFalso(respuestasNotas, { t: 50_000, paso: 10_000 });
    const fase = await leerNotas(
      { pedir: f.pedir, now: () => f.reloj.t, deadline: 60_000 }, { ok: true, html: MENU_NOTA }, new Map(),
    );
    expect(f.pedidos.map((p) => p.path)).toEqual([PORTAL_PATHS.notaCurso("900101")]);
    expect(fase.aulas.map((a) => a.estado)).toEqual(["not_reached", "not_reached", "not_reached", "not_reached", "not_reached"]);
    expect(fase.identificadas.get("900101")).toEqual({ courseCode: "690417", sectionCode: "812" });
  });
});

describe("RS-BE-50 · presupuesto de la recarga entera", () => {
  test("si el presupuesto se agota antes de la apertura, responde 504, cierra la sesión y suelta la guarda", async () => {
    const a = armar({ reloj: { t: 60_000, paso: 0 } });
    await expect(a.servicio.refresh(a.entrada({ recibidaEn: 0 }))).rejects.toMatchObject({
      statusCode: 504, code: "PORTAL_TIMEOUT",
    });
    expect(a.pedidos).toHaveLength(0);
    expect(a.cierres()).toBe(1);
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("los cursos que no alcanzan quedan not_reached y el aviso sale una sola vez", async () => {
    const a = armar({ reloj: { t: 0, paso: 10_000 } });
    const res = await a.servicio.refresh(a.entrada({ recibidaEn: 0 }));
    expect(a.pedidos.every((p) => p.t < 60_000)).toBe(true);
    expect(res.courses.map((c) => [c.attendance, c.grades])).toEqual([
      ["updated", "not_reached"], ["updated", "not_reached"], ["updated", "not_reached"],
      ["not_reached", "not_reached"], ["not_reached", "not_reached"],
    ]);
    expect(res.warnings.filter((w) => w.code === "REFRESH_BUDGET_EXCEEDED")).toEqual([{
      code: "REFRESH_BUDGET_EXCEEDED", block: "asistencia",
      message: "La lectura de miUlima tardó demasiado y algunos cursos quedaron sin leer.",
    }]);
    expect(a.cierres()).toBe(1);
  });

  test("el presupuesto agotado sin ningún curso leído responde 504", async () => {
    const a = armar({
      reloj: { t: 0, paso: 10_000 },
      paginas: Object.fromEntries(CURSOS.map((c) => [
        PORTAL_PATHS.asistenciaAlumno(c.aula), new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"),
      ])),
    });
    await expect(a.servicio.refresh(a.entrada({ recibidaEn: 0 }))).rejects.toMatchObject({
      statusCode: 504, code: "PORTAL_TIMEOUT",
    });
  });
});
