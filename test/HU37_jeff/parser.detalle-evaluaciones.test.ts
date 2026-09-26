import { describe, expect, test } from "bun:test";
import { parseDetalleEvaluaciones } from "../../src/modules/portal-sync/parsers/nota.js";

/**
 * RS-BE-53 · tabla «Detalle Evaluaciones» del marco del panel Nota.
 * Fixtures armados a mano con datos inventados (RS-BE-59). Todavía no hay
 * ninguna muestra viva con una nota publicada, así que los formatos de nota
 * salen de la spec y los ajusta la verificación V2.
 */
const leer = (n: string) => Bun.file(`test/HU37_jeff/fixtures/${n}`).text();
const VACIAS = await leer("detalle-evaluaciones-vacias.html");
const CON_NOTAS = await leer("detalle-evaluaciones-con-notas.html");
const NP = await leer("detalle-evaluaciones-np.html");
const DOS_GRUPOS = await leer("detalle-evaluaciones-dos-grupos.html");

const CABECERA = "<tr><th></th><th>Detalle Evaluaciones</th><th>Semana</th><th>Peso</th><th>Nota</th><th></th></tr>";
const tabla = (filas: string[]) => `<table>${CABECERA}${filas.join("")}</table>`;
const grupo = (id = "07", nombre = "EVC", peso = "100") =>
  `<tr data-tt-id="${id}"><td></td><td>${nombre}</td><td>&nbsp;</td><td>${peso}</td><td>&nbsp;</td><td></td></tr>`;
const hoja = (id: string, nombre: string, semana: string, peso: string, nota = "&nbsp;", padre = "07") =>
  `<tr data-tt-id="${id}" data-tt-parent-id='${padre}'><td></td><td>${nombre}</td><td>${semana}</td><td>${peso}</td><td>${nota}</td><td></td></tr>`;
const conNota = (nota: string) => parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "Examen escrito 1", "3", "100", nota)]));
const falla = (reason: string) => ({ ok: false, reason });

describe("puerta de cabecera (punto 1)", () => {
  test("una cabecera distinta falla", () => {
    expect(parseDetalleEvaluaciones(VACIAS.replace("<th>Peso</th>", "<th>Ponderación</th>"))).toEqual(
      falla("la tabla de evaluaciones no tiene la cabecera esperada"),
    );
  });

  test("la página de inicio de sesión no pasa", () => {
    const login = "<html><body><form action='j_security_check'><input name='j_username'></form></body></html>";
    expect(parseDetalleEvaluaciones(login)).toEqual(falla("la tabla de evaluaciones no tiene la cabecera esperada"));
  });
});

describe("evaluaciones del sondeo, con datos inventados", () => {
  test("cinco evaluaciones sin nota, cada una con sus siete campos", () => {
    const r = parseDetalleEvaluaciones(VACIAS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(5);
    expect(r.data[0]).toEqual({
      key: "07.13", group: "EVC", name: "Examen escrito 1", week: 3, weight: 15, value: null, mark: "pending",
    });
    expect(r.data.map((e) => e.name)).toEqual([
      "Examen escrito 1", "Trabajo de producción 1", "Exposición", "Examen escrito 2", "Proyecto final",
    ]);
    for (const e of r.data) expect(Object.keys(e).sort()).toEqual(["group", "key", "mark", "name", "value", "week", "weight"]);
  });

  test("notas con punto y con coma decimal", () => {
    const r = parseDetalleEvaluaciones(CON_NOTAS);
    expect(r.ok && r.data.slice(0, 3).map((e) => [e.value, e.mark])).toEqual([
      [14.5, "graded"], [12.75, "graded"], [null, "pending"],
    ]);
  });

  test("NP es una marca sin valor", () => {
    const r = parseDetalleEvaluaciones(NP);
    expect(r.ok && [r.data[0]!.value, r.data[0]!.mark]).toEqual([null, "np"]);
  });

  test("dos grupos con pesos absolutos, cada evaluación con su grupo", () => {
    const r = parseDetalleEvaluaciones(DOS_GRUPOS);
    expect(r.ok && r.data.map((e) => [e.key, e.group, e.weight])).toEqual([
      ["07.13", "EVC", 20], ["07.14", "EVC", 40], ["08.21", "EXF", 40],
    ]);
  });
});

describe("celdas de una hoja (punto 4)", () => {
  test("formatos de nota aceptados", () => {
    expect(conNota("14.5")).toMatchObject({ ok: true, data: [{ value: 14.5, mark: "graded" }] });
    expect(conNota("14,5")).toMatchObject({ ok: true, data: [{ value: 14.5, mark: "graded" }] });
    expect(conNota("NP")).toMatchObject({ ok: true, data: [{ value: null, mark: "np" }] });
    expect(conNota("np")).toMatchObject({ ok: true, data: [{ value: null, mark: "np" }] });
    expect(conNota("&nbsp;")).toMatchObject({ ok: true, data: [{ value: null, mark: "pending" }] });
    expect(conNota("0")).toMatchObject({ ok: true, data: [{ value: 0, mark: "graded" }] });
  });

  test("formatos de nota rechazados", () => {
    expect(conNota("21")).toEqual(falla("una nota está fuera del rango de 0 a 20"));
    for (const nota of ["-1", "A", "14.555"]) expect(conNota(nota)).toEqual(falla("una nota tiene un formato desconocido"));
  });

  test("semana vacía como null, y 0, 21 o con letras fallan", () => {
    const conSemana = (semana: string) =>
      parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "Participación", semana, "100")]));
    expect(conSemana("&nbsp;")).toMatchObject({ ok: true, data: [{ week: null }] });
    for (const semana of ["0", "21", "3a"]) expect(conSemana(semana)).toEqual(falla("la semana de una evaluación no es válida"));
  });

  test("peso 0 o 101 falla, y con coma se lee", () => {
    const conPeso = (a: string, b: string) =>
      parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "A", "3", a), hoja("07.14", "B", "4", b)]));
    expect(conPeso("0", "100")).toEqual(falla("el peso de una evaluación no es válido"));
    expect(conPeso("101", "0,5")).toEqual(falla("el peso de una evaluación no es válido"));
    expect(conPeso("87,5", "12,5")).toMatchObject({ ok: true, data: [{ weight: 87.5 }, { weight: 12.5 }] });
  });

  test("nombre vacío o de más de 150 caracteres falla", () => {
    const conNombre = (nombre: string) => parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", nombre, "3", "100")]));
    expect(conNombre("&nbsp;")).toEqual(falla("una evaluación no tiene nombre"));
    expect(conNombre("x".repeat(151))).toEqual(falla("el nombre de una evaluación es demasiado largo"));
  });

  test("un grupo de más de 60 caracteres deja group en null", () => {
    const r = parseDetalleEvaluaciones(tabla([grupo("07", "G".repeat(61)), hoja("07.13", "A", "3", "100")]));
    expect(r).toMatchObject({ ok: true, data: [{ group: null }] });
  });
});

describe("estructura de la tabla (puntos 2 y 3)", () => {
  test("hoja huérfana, tercer nivel, id repetido, id raro y fila de cinco celdas fallan", () => {
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("09.1", "A", "3", "100", "&nbsp;", "09")])))
      .toEqual(falla("una evaluación no tiene su grupo"));
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "A", "3", "50"), hoja("07.13.1", "B", "4", "50", "&nbsp;", "07.13")])))
      .toEqual(falla("la tabla tiene un nivel de evaluaciones que ULima++ todavía no lee"));
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "A", "3", "50"), hoja("07.13", "B", "4", "50")])))
      .toEqual(falla("una fila de evaluaciones está repetida"));
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("07.a", "A", "3", "100")])))
      .toEqual(falla("una fila de evaluaciones tiene un identificador desconocido"));
    const cinco = `<tr data-tt-id="07.13" data-tt-parent-id='07'><td></td><td>A</td><td>3</td><td>100</td><td></td></tr>`;
    expect(parseDetalleEvaluaciones(tabla([grupo(), cinco]))).toEqual(falla("una fila de evaluaciones no tiene seis celdas"));
  });

  test("una tabla sin hojas falla", () => {
    expect(parseDetalleEvaluaciones(tabla([grupo()]))).toEqual(falla("la tabla no trae evaluaciones"));
  });
});

describe("pesos (punto 6)", () => {
  const dos = (a: string, b: string) =>
    parseDetalleEvaluaciones(tabla([grupo("07", "EVC", ""), hoja("07.13", "A", "3", a), hoja("07.14", "B", "4", b)]));

  test("99,6 y 100,4 se aceptan y 99 se rechaza", () => {
    expect(dos("49,6", "50").ok).toBe(true);
    expect(dos("50,4", "50").ok).toBe(true);
    expect(dos("49", "50")).toEqual(falla("los pesos de la ULima no suman 100"));
  });

  test("un grupo cuyo peso no coincide con sus evaluaciones falla", () => {
    expect(parseDetalleEvaluaciones(DOS_GRUPOS.replace("<td>EXF</td><td>&nbsp;</td><td>40</td>", "<td>EXF</td><td>&nbsp;</td><td>30</td>")))
      .toEqual(falla("el peso de un grupo no coincide con sus evaluaciones"));
  });

  test("pesos relativos a cada grupo fallan con su propio motivo", () => {
    const relativos = tabla([
      grupo("07", "EVC", "60"), hoja("07.13", "A", "3", "50"), hoja("07.14", "B", "4", "50"),
      grupo("08", "EXF", "40"), hoja("08.21", "C", "16", "100", "&nbsp;", "08"),
    ]);
    expect(parseDetalleEvaluaciones(relativos)).toEqual(falla("pesos por grupo, un formato que ULima++ todavía no lee"));
  });
});

describe("mensajes", () => {
  test("ningún motivo lleva HTML ni el texto de una celda", () => {
    const r = parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "<b>Secreto</b>", "3", "100", "XYZ")]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).not.toContain("<");
    expect(r.reason).not.toContain("Secreto");
    expect(r.reason).not.toContain("XYZ");
  });

  test("nunca lanza, ni con basura", () => {
    expect(() => parseDetalleEvaluaciones("<<<>>>&#x;;<tr data-tt-id=")).not.toThrow();
  });
});
