import { describe, expect, test } from "bun:test";
import { parseNotaCurso } from "../../src/modules/portal-sync/parsers/nota.js";

/**
 * RS-BE-52 · página de notas de un curso en el panel Nota del Aula Virtual.
 * Fixture armado a mano con la estructura de la página viva y datos inventados
 * (RS-BE-59).
 */
const PAGINA = await Bun.file("test/HU37_jeff/fixtures/nota-curso-900101.html").text();

/** Cambia el valor de una asignación `var nombre = '…'`. */
const conVar = (html: string, nombre: string, valor: string) =>
  html.replace(new RegExp(`(\\bvar ${nombre} = )'[^']*'`), (_t, pre: string) => `${pre}'${valor}'`);

const NO_ES_NOTAS = { ok: false, reason: "la respuesta no es la página de notas de un curso" };

describe("identificación del curso (puntos 1 y 2)", () => {
  test("lee curso y sección con cada var sangrado con un tabulador, como en la página viva", () => {
    const r = parseNotaCurso(PAGINA, "900101");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.courseCode).toBe("690417");
    expect(r.data.sectionCode).toBe("812");
  });

  test("una línea comentada nunca se lee, aunque asigne codCurso", () => {
    const trampa = PAGINA.replace("\tvar codCurso = '690417';", "\t//var codCurso = '111111';\n\tvar codCurso = '690417';");
    const r = parseNotaCurso(trampa, "900101");
    expect(r.ok && r.data.courseCode).toBe("690417");
  });

  test("sin sangría y con comillas dobles también se lee", () => {
    const plana = PAGINA.replaceAll("\tvar ", "var ").replace("'690417'", '"690417"');
    const r = parseNotaCurso(plana, "900101");
    expect(r.ok && r.data.courseCode).toBe("690417");
  });

  test("el nombre de la línea comentada no aparece en el resultado, que tiene tres campos", () => {
    const r = parseNotaCurso(PAGINA, "900101");
    const texto = JSON.stringify(r);
    for (const dato of ["PRUEBA", "RAMOS", "LUCIA", "TALLER"]) expect(texto).not.toContain(dato);
    expect(r.ok && Object.keys(r.data).sort()).toEqual(["agregados", "courseCode", "sectionCode"]);
  });

  test("codCurso ausente o mal formado da el motivo de la página de inicio de sesión", () => {
    expect(parseNotaCurso(PAGINA.replace("\tvar codCurso = '690417';\n", ""), "900101")).toEqual(NO_ES_NOTAS);
    expect(parseNotaCurso(conVar(PAGINA, "codCurso", "69A417"), "900101")).toEqual(NO_ES_NOTAS);
    const login = "<html><body><form action='j_security_check'><input name='j_username'></form></body></html>";
    expect(parseNotaCurso(login, "900101")).toEqual(NO_ES_NOTAS);
  });

  test("una sección mal formada falla con su propio motivo", () => {
    expect(parseNotaCurso(conVar(PAGINA, "seccion", "8A2"), "900101")).toEqual({
      ok: false, reason: "la página no trae el código de sección",
    });
  });
});

describe("marco de evaluaciones (punto 3)", () => {
  test("sin el marco ifrTareaAcad", () => {
    expect(parseNotaCurso(PAGINA.replace(/<iframe[\s\S]*?<\/iframe>/, ""), "900101")).toEqual({
      ok: false, reason: "la página no trae el marco de evaluaciones",
    });
  });

  test("un marco hacia otra ruta no cuenta como marco de evaluaciones", () => {
    const otra = PAGINA.replace("ComandoConsultarTareaAcademica", "ComandoOtraCosa");
    expect(parseNotaCurso(otra, "900101")).toEqual({ ok: false, reason: "la página no trae el marco de evaluaciones" });
  });

  test("un marco de otra aula", () => {
    expect(parseNotaCurso(PAGINA, "900102")).toEqual({
      ok: false, reason: "la página no corresponde al aula que se pidió",
    });
  });

  test("el marco se reconoce por su id aunque no tenga name", () => {
    expect(parseNotaCurso(PAGINA.replace('name="ifrTareaAcad" ', ""), "900101").ok).toBe(true);
  });
});

describe("agregados (puntos 4 y 5)", () => {
  const BASE = [
    { clave: "EP", etiqueta: "Eval. Continua", valor: null },
    { clave: "TA", etiqueta: "Eval. Continua 2", valor: null },
    { clave: "EF", etiqueta: "Eval. Final", valor: null },
    { clave: "PROM", etiqueta: "Promedio", valor: null },
  ];

  test("un 0 del portal sale como null, porque significa «sin nota», y el <br> pasa a espacio", () => {
    const r = parseNotaCurso(PAGINA, "900101");
    expect(r.ok && r.data.agregados).toEqual(BASE);
  });

  test("una nota publicada se lee con sus decimales", () => {
    const r = parseNotaCurso(conVar(PAGINA, "notaPROM", "14.25"), "900101");
    expect(r.ok && r.data.agregados.at(-1)).toEqual({ clave: "PROM", etiqueta: "Promedio", valor: 14.25 });
  });

  test("los mínimos y máximos de la clase nunca cambian el resultado", () => {
    const otra = conVar(conVar(conVar(PAGINA, "minPROM", "3"), "maxPROM", "20"), "minEP", "0");
    const r = parseNotaCurso(otra, "900101");
    expect(r.ok && r.data.agregados).toEqual(BASE);
  });

  test("un agregado ausente o fuera de formato se omite sin hacer fallar al curso", () => {
    const sinTA = PAGINA.replace("\tvar notaTA = '0';\n", "");
    const fuera = conVar(conVar(sinTA, "notaEF", "21"), "notaEP", "A");
    const r = parseNotaCurso(fuera, "900101");
    expect(r.ok && r.data.agregados.map((a) => a.clave)).toEqual(["PROM"]);
  });

  test("nunca lanza, ni con basura", () => {
    expect(() => parseNotaCurso("<<<>>>&#x;;", "1")).not.toThrow();
  });
});
