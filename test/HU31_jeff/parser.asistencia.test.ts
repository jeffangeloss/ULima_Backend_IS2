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

describe("identificación verificada (RS-BE-48, con RS-BE-51 punto 4)", () => {
  // Con el menú de lista, el aula no dice de qué curso es. La página de
  // asistencia lo dice, y ese par tiene que sobrevivir aunque la página falle
  // después, porque de él salen los delegados y el nombre del curso en los avisos.
  const PAR = { courseCode: "650033", sectionCode: "952" };

  test("una página leída entera trae el par en identificado, fuera de los cinco campos", () => {
    const r = parseAsistenciaCurso(curso508, "154508", ALUMNO);
    expect(r.identificado).toEqual(PAR);
    expect(r.ok && Object.keys(r.data)).toHaveLength(5);
  });

  test("una página que identifica el curso y falla en los totales devuelve identificado", () => {
    const roto = curso508.replace(/Total horas programadas/, "Total horas dictadas");
    const r = parseAsistenciaCurso(roto, "154508", ALUMNO);
    expect(r.ok).toBe(false);
    expect(r.identificado).toEqual(PAR);
  });

  test("también cuando falla en el cotejo con las sesiones", () => {
    const roto = curso508.replace('<strong class="textos">8</strong>', '<strong class="textos">99</strong>');
    const r = parseAsistenciaCurso(roto, "154508", ALUMNO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("los totales no cuadran con las sesiones listadas");
    expect(r.identificado).toEqual(PAR);
  });

  test("sin el aula pedida o sin el alumno autenticado no hay identificación", () => {
    expect(parseAsistenciaCurso(curso508, "999999", ALUMNO).identificado).toBeUndefined();
    expect(parseAsistenciaCurso(curso508, "154508", "20200999").identificado).toBeUndefined();
    expect(parseAsistenciaCurso("<html><body>login</body></html>", "154508", ALUMNO).identificado)
      .toBeUndefined();
  });
});

// ── RS-BE-49 y RS-BE-51 (recarga-portal) · ciclo e identidad ────────────────
// Fixture armado a mano con los datos inventados de la spec (RS-BE-59).
const PAGINA_900101 = await Bun.file("test/HU37_jeff/fixtures/asistencia-curso-900101.html").text();
const ALUMNO_900101 = "20230001";

/** Cambia el `value` de un oculto. */
const conOculto = (html: string, nombre: string, valor: string) =>
  html.replace(new RegExp(`(name="${nombre}" value=")[^"]*`), (_t, pre: string) => pre + valor);
/** Quita un oculto entero. */
const sinOculto = (html: string, nombre: string) =>
  html.replace(new RegExp(`<INPUT[^>]*name="${nombre}"[^>]*>`, "i"), "");

describe("fixture armado a mano de la recarga (RS-BE-59)", () => {
  test("lee 48 programadas, 4 asistidas y 2 de falta, con el ciclo esperado", () => {
    expect(parseAsistenciaCurso(PAGINA_900101, "900101", ALUMNO_900101, "2026-2")).toEqual({
      ok: true,
      data: { courseCode: "690417", sectionCode: "812", totalHours: 48, attendedHours: 4, absentHours: 2 },
      identificado: { courseCode: "690417", sectionCode: "812" },
    });
  });
});

describe("ciclo esperado (RS-BE-51, punto 3)", () => {
  test("otro ciclo con los dos ocultos bien formados marca otroCiclo y no identifica", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sNuCicl", "1"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo", otroCiclo: true });
  });

  test("un año mal formado es un fallo común, sin otroCiclo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sAaCicl", "26"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo" });
  });

  test("un número de ciclo fuera de 0 a 3 es un fallo común, sin otroCiclo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sNuCicl", "4"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo" });
  });

  test("un oculto del ciclo ausente es un fallo común, sin otroCiclo", () => {
    const r = parseAsistenciaCurso(sinOculto(PAGINA_900101, "prm_sNuCicl"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo" });
  });

  test("sin cicloEsperado no se revisa el ciclo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sNuCicl", "1"), "900101", ALUMNO_900101);
    expect(r.ok).toBe(true);
  });
});

describe("identidad (RS-BE-49)", () => {
  test("un código presente y distinto marca identityMismatch sin imprimir ningún código", () => {
    const r = parseAsistenciaCurso(PAGINA_900101, "900101", "20230002", "2026-2");
    expect(r).toEqual({
      ok: false, reason: "la página declara un código de alumno distinto del autenticado", identityMismatch: true,
    });
  });

  test("un código vacío es un fallo común con su propio motivo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sCoUserAlum", ""), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página no trae el código de alumno" });
  });

  test("sin el oculto del alumno, el mismo fallo común", () => {
    const r = parseAsistenciaCurso(sinOculto(PAGINA_900101, "prm_sCoUserAlum"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página no trae el código de alumno" });
  });

  test("la identidad se revisa antes que el ciclo", () => {
    const ajena = conOculto(conOculto(PAGINA_900101, "prm_sCoUserAlum", "20230002"), "prm_sNuCicl", "1");
    const r = parseAsistenciaCurso(ajena, "900101", ALUMNO_900101, "2026-2");
    expect(r.identityMismatch).toBe(true);
    expect(r.otroCiclo).toBeUndefined();
  });
});
