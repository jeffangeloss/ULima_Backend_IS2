import { describe, expect, test } from "bun:test";
import { parseCicloActivo } from "../../src/modules/portal-sync/parsers/ciclo.js";
import { parseConsolidadoMatricula } from "../../src/modules/portal-sync/parsers/matricula.js";

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();

describe("parseCicloActivo", () => {
  test("devuelve el ciclo VIGENTE y no el del bloque por periodo", () => {
    const r = parseCicloActivo(layout);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // layout.jsp trae ADEMÁS "Información por Período Académico: Ciclo 2026-1",
    // que es el ciclo anterior y aparece antes en el HTML.
    expect(r.data.periodCode).toBe("2026-2");
    expect(r.data.cocicloUrl).toBe("20262");
  });

  test("falla con ok:false si no hay ciclo", () => {
    expect(parseCicloActivo("<html>sin ciclo</html>").ok).toBe(false);
  });

  test("falla con ok:false si las dos fuentes discrepan", () => {
    const html = 'RestrictToCategory=20262_650033 <td>CICLO: 2026-1</td>';
    const r = parseCicloActivo(html);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("contradictorios");
  });

  test("una entidad entre CICLO y los digitos ya no rompe la lectura", () => {
    const r = parseCicloActivo('RestrictToCategory=20262_650033 <td>CICLO:&nbsp;2026-2</td>');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.periodCode).toBe("2026-2");
  });
});

describe("parseConsolidadoMatricula", () => {
  test("extrae identidad y las 5 filas de curso del ciclo", () => {
    const r = parseConsolidadoMatricula(matricula);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.studentCode).toMatch(/^\d{8}$/);
    expect(r.data.studentName.length).toBeGreaterThan(0);
    expect(r.data.careerName).toBe("INGENIERÍA DE SISTEMAS");
    expect(r.data.periodCode).toBe("2026-2");
    expect(r.data.rows).toHaveLength(5);
  });

  test("respeta la columna GR. y no desplaza los campos", () => {
    const r = parseConsolidadoMatricula(matricula);
    if (!r.ok) throw new Error("parser fallo");
    const plan = r.data.rows.find((x) => x.courseCode === "650033");
    expect(plan).toEqual({
      carCode: "6500",
      courseCode: "650033",
      sectionCode: "952",
      groupCode: "",
      courseName: "PLANEAMIENTO ESTRATÉGICO",
      level: 9,
      credits: 3,
      attempt: 1,
    });
  });

  test("falla con ok:false si el encabezado no trae CODIGO", () => {
    expect(parseConsolidadoMatricula("<html><table><tr><td>x</td></tr></table></html>").ok).toBe(false);
  });

  test("la identidad se toma de la fila bajo el encabezado CODIGO", () => {
    const r = parseConsolidadoMatricula(matricula);
    if (!r.ok) throw new Error("parser fallo");
    expect(r.data.studentCode).toMatch(/^\d{8}$/);
  });

  test("una fila senuelo antes del encabezado no se confunde con la identidad", () => {
    const senuelo = matricula.replace(
      /<table/i,
      '<table><tr><td>99999999</td><td>TRAMITE</td><td>X</td></tr>',
    );
    const r = parseConsolidadoMatricula(senuelo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.studentCode).not.toBe("99999999");
  });

  test("falla si hay mas de una fila de identidad candidata", () => {
    const dup = matricula.replace(
      /(<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?\b\d{8}\b[\s\S]*?<\/tr>)/i,
      "$1$1",
    );
    const r = parseConsolidadoMatricula(dup);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("candidatas");
  });
});
