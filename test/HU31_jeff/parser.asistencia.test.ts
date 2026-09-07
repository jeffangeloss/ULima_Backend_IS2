import { describe, expect, test } from "bun:test";
import { parseAsistenciaCurso } from "../../src/modules/portal-sync/parsers/asistencia.js";

/**
 * RS-BE-15 · parser del panel Asistencia del Aula Virtual.
 *
 * Fixtures reales del spike del 2026-09-06, ANONIMIZADOS (el repo es público):
 * código de alumno, nombre de alumno, nombre y usuario de docente y las
 * observaciones están reemplazados por valores sintéticos. La estructura del
 * JSP no se tocó.
 */

const ALUMNO = "20200001";
const curso508 = await Bun.file("test/HU31_jeff/fixtures/asistencia-curso-154508.html").text();
const curso516 = await Bun.file("test/HU31_jeff/fixtures/asistencia-curso-154516.html").text();

describe("extrae los tres agregados y la identificación", () => {
  test("curso 650033, sección 952: 64 programadas, 8 asistidas, 0 de falta", () => {
    const r = parseAsistenciaCurso(curso508, "154508", ALUMNO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({
      courseCode: "650033",
      sectionCode: "952",
      totalHours: 64,
      attendedHours: 8,
      absentHours: 0,
    });
  });

  test("segundo curso, con otros totales: 96 / 10 / 0", () => {
    const r = parseAsistenciaCurso(curso516, "154516", ALUMNO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.courseCode).toBe("650035");
    expect(r.data.sectionCode).toBe("958");
    expect(r.data.totalHours).toBe(96);
    expect(r.data.attendedHours).toBe(10);
  });

  test("encuentra 'Total  horas  asistidas' pese a los espacios dobles del JSP", () => {
    // El crudo trae DOS espacios dobles; un includes del literal normal falla
    // en las cinco páginas. Si este test cae, el parser volvió a mirar el crudo.
    expect(curso508.includes("Total horas asistidas")).toBe(false);
    const r = parseAsistenciaCurso(curso508, "154508", ALUMNO);
    expect(r.ok && r.data.attendedHours).toBe(8);
  });
});

describe("minimización de datos: el DTO no puede crecer sin querer", () => {
  test("exactamente cinco campos, ninguno de texto libre", () => {
    const r = parseAsistenciaCurso(curso508, "154508", ALUMNO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.data).sort()).toEqual(
      ["absentHours", "attendedHours", "courseCode", "sectionCode", "totalHours"],
    );
  });

  test("nada del alumno, del docente ni de la observación sale del parser", () => {
    const r = parseAsistenciaCurso(curso508, "154508", ALUMNO);
    const serializado = JSON.stringify(r);
    for (const dato of ["PEREZ", "CLAUDIA", "RAMIREZ QUISPE", "Observacion", "20200001"]) {
      expect(serializado).not.toContain(dato);
    }
  });
});

describe("rechaza lo que no es la página pedida", () => {
  test("otra aula: no se acepta una respuesta cruzada", () => {
    const r = parseAsistenciaCurso(curso508, "999999", ALUMNO);
    expect(r.ok).toBe(false);
  });

  test("otro alumno: se rechaza sin imprimir ninguno de los dos códigos", () => {
    const r = parseAsistenciaCurso(curso508, "154508", "20200999");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).not.toContain("20200001");
    expect(r.reason).not.toContain("20200999");
  });

  test("la página de login con HTTP 200 no pasa por asistencia", () => {
    const login = "<html><body><form action='j_security_check'><input name='j_username'></form></body></html>";
    expect(parseAsistenciaCurso(login, "154508", ALUMNO).ok).toBe(false);
  });

  test("un cuerpo vacío tampoco", () => {
    expect(parseAsistenciaCurso("", "154508", ALUMNO).ok).toBe(false);
  });

  test("nunca lanza, ni con basura", () => {
    expect(() => parseAsistenciaCurso("<<<>>>&#x;;", "1", "2")).not.toThrow();
  });
});

describe("nunca inventa un cero", () => {
  test("si el bloque de inasistencias tiene formato desconocido, falla", () => {
    // Es el caso que importa: nadie ha visto todavía una fila de inasistencia,
    // así que el formato del agregado CON faltas no está verificado. Asumir 0
    // ahí borraría faltas reales.
    const roto = curso508.replace(/0 horas/, "cero horas");
    const r = parseAsistenciaCurso(roto, "154508", ALUMNO);
    expect(r.ok).toBe(false);
  });

  test("si falta un total, falla en vez de completar con 0", () => {
    const roto = curso508.replace(/Total horas programadas/, "Total horas dictadas");
    expect(parseAsistenciaCurso(roto, "154508", ALUMNO).ok).toBe(false);
  });
});
