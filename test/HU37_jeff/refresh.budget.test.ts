import { describe, expect, test } from "bun:test";
import { leerAsistencia } from "../../src/modules/portal-sync/refresh/fase-asistencia.js";
import type { Pedir } from "../../src/modules/portal-sync/refresh/refresh.types.js";
import { ALUMNO, CICLO, MENU_ASISTENCIA, asistenciaDe, aulaDe, menuLista, pedirFalso } from "./recarga.dobles.js";

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
