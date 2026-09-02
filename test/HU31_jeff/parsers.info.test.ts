import { describe, expect, test } from "bun:test";
import { parseImpedimentos, parseInfoAcademica } from "../../src/modules/portal-sync/parsers/info-academica.js";

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();

describe("parseInfoAcademica", () => {
  test("lee la carrera del bloque de informacion academica", () => {
    const r = parseInfoAcademica(layout);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.careerName).toBe("INGENIERÍA DE SISTEMAS");
  });

  test("solo extrae la carrera: ni PPA, ni ubicacion, ni nivel", () => {
    const r = parseInfoAcademica(layout);
    if (!r.ok) throw new Error("parser fallo");
    expect(Object.keys(r.data)).toEqual(["careerName"]);
  });

  test("parseInfoAcademica falla si no hay bloque de informacion academica", () => {
    expect(parseInfoAcademica("<html>nada</html>").ok).toBe(false);
  });
});

describe("parseImpedimentos", () => {
  test("detecta impedimento y deuda del bloque de matricula", () => {
    const r = parseImpedimentos(layout);
    expect(r.hasImpediment).toBe(true);
    expect(r.hasDebt).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });

  test("sin rotulos devuelve todo en false", () => {
    const r = parseImpedimentos("<html>nada</html>");
    expect(r.hasImpediment).toBe(false);
    expect(r.hasDebt).toBe(false);
  });
});
