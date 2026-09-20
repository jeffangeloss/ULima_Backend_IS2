import { describe, expect, test } from "bun:test";
import {
  CREDIT_TOLERANCE,
  approvedRows,
  evaluateRecordTrust,
  failedRows,
} from "../../src/modules/academic-record/academic-record.logic.js";
import { parseRecordPage } from "../../src/modules/portal-sync/parsers/record.js";
import type {
  RecordFooter,
  RecordPage,
  RecordRow,
} from "../../src/modules/portal-sync/portal-sync.types.js";

// RS-BE-21 — Regla de confianza del récord.
// Fixture inventado de HU34 (alumno sintético, sin datos reales). Cuadra con su pie:
// aprobadas 14 (3.0 crd), 12 (4.0) y 17 (1.5) → ASIG. APR. 3 y CRD. APROB. 8.5;
// desaprobada 08 → ASIG. DESAP. 1; ASIG. CONV. 0; el ciclo 2026-2 va sin nota.
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();

const tablas = record.match(/<table[\s\S]*?<\/table>/gi) ?? [];
const tablaPie = tablas[1] ?? "";

// Fila de valores del pie del fixture, por posición:
// COD. CAR. | PROM. POND. | CRD. CONV. | CRD. APROB. | TOTAL CRD. VÁLIDOS |
// ASIG. CONV. | ASIG. APR. | TOTAL ASIG. VÁLIDOS | CRD. DESAP. | ASIG. DESAP.
const PIE_FIXTURE = ["0001", "11.8000", "0.0", "8.5", "8.5", "0", "3", "3", "4.0", "1"];

/** El fixture con la fila de valores del pie reescrita; `cambios` va por posición. */
const pieCon = (cambios: Record<number, string>): string => {
  const valores = PIE_FIXTURE.map((v, i) => cambios[i] ?? v);
  const filaPie = `<tr>${valores.map((v) => `<td class="text-center">${v}</td>`).join("")}</tr>`;
  const nuevoPie = tablaPie.replace(/<tbody>[\s\S]*<\/tbody>/, () => `<tbody>${filaPie}</tbody>`);
  return record.replace(tablaPie, () => nuevoPie);
};

/** Intercambia la primera aparición de `a` con la primera de `b`. */
const intercambiar = (html: string, a: string, b: string): string =>
  html.replace(a, "@@INTERCAMBIO@@").replace(b, a).replace("@@INTERCAMBIO@@", b);

const confianza = (html: string) => evaluateRecordTrust(parseRecordPage(html));

const NO_CABECERA = { ok: false, reason: "tabla del récord ausente o con cabecera distinta" };
const NO_PIE = { ok: false, reason: "pie ausente o ilegible" };

/** Fila sintética con todos los campos de RecordRow. */
const filaCon = (grade: number | null, credits: number, courseCode: string): RecordRow => ({
  periodCode: "2024-1",
  courseCode,
  courseName: "CURSO DE PRUEBA",
  attempt: 1,
  credits,
  grade,
  sectionCode: "101",
  gradeRaw: grade === null ? null : String(grade),
  observation: null,
});

// Página armada a mano: dos aprobadas de 3 créditos y una desaprobada, con su pie coherente.
const FILAS: RecordRow[] = [filaCon(15, 3, "659101"), filaCon(12, 3, "659102"), filaCon(8, 3, "659103")];
const PIE: RecordFooter = {
  weightedAverage: 11.6667, convalidatedCredits: 0, approvedCredits: 6, validCredits: 6,
  convalidatedCourses: 0, approvedCourses: 2, validCourses: 2, failedCredits: 3, failedCourses: 1,
};
const pagina = (cambios: Partial<RecordPage>): RecordPage => ({
  rows: FILAS, headerOk: true, discarded: 0, footer: PIE, ...cambios,
});

describe("fixture HU34 del record", () => {
  test("trae las dos tablas y los literales que usan las variantes", () => {
    expect(tablas).toHaveLength(2);
    for (const literal of [
      "<th>NOTA</th>",
      "<th>TOMO</th>",
      "<th>OBSERVACIÓN</th>",
      "<th>TOTAL CRD. VÁLIDOS</th>",
      "<th>TOTAL ASIG. VÁLIDOS</th>",
      "<th>ASIG. CONV.</th>",
      "<th>ASIG. APR.</th>",
      '<td class="text-center">0022</td>',
    ]) {
      expect(record).toContain(literal);
    }
  });

  test("pieCon sin cambios reproduce el pie del fixture", () => {
    const original = parseRecordPage(record).footer;
    expect(original).not.toBeNull();
    expect(parseRecordPage(pieCon({})).footer).toEqual(original);
  });
});

describe("evaluateRecordTrust con el fixture", () => {
  test("el fixture completo es de confianza", () => {
    expect(confianza(record)).toEqual({ ok: true });
  });

  test("sin pie no es de confianza: la comparacion nunca se omite", () => {
    expect(confianza(record.replace(tablaPie, ""))).toEqual(NO_PIE);
  });

  test("pie con una celda numerica ilegible no es de confianza", () => {
    expect(confianza(pieCon({ 2: "N/D" }))).toEqual(NO_PIE);
  });

  test("pie con ASIG. CONV. y ASIG. APR. intercambiadas no es de confianza", () => {
    const html = intercambiar(record, "<th>ASIG. CONV.</th>", "<th>ASIG. APR.</th>");
    expect(confianza(html)).toEqual(NO_PIE);
  });

  test("tabla cortada a la mitad no es de confianza aunque se lean filas", () => {
    const corte = record.indexOf("659002");
    // El corte cae dentro del <tbody> de la primera tabla; el resto de la página se pierde.
    expect(corte).toBeGreaterThan(0);
    expect(corte).toBeLessThan(record.indexOf("</table>"));
    const cortada = record.slice(0, corte);
    // Así llega hoy un récord truncado con HTTP 200: las filas se leen...
    expect(parseRecordPage(cortada).rows.length).toBeGreaterThan(0);
    // ...pero no es de confianza.
    expect(confianza(cortada)).toEqual(NO_CABECERA);
  });

  test("cabecera reordenada (NOTA y TOMO intercambiadas) no es de confianza", () => {
    expect(confianza(intercambiar(record, "<th>NOTA</th>", "<th>TOMO</th>"))).toEqual(NO_CABECERA);
  });

  test("tabla del record sin filas de datos no es de confianza", () => {
    // El primer <tbody> es el de la tabla del récord.
    const vacia = record.replace(/<tbody>[\s\S]*?<\/tbody>/, "<tbody></tbody>");
    expect(confianza(vacia)).toEqual({ ok: false, reason: "sin filas" });
  });

  test("una fila de datos con 11 celdas no es de confianza", () => {
    // Quita la celda FOLIO de la fila 4901: queda con 11 celdas y se descarta.
    const sinFolio = record.replace('<td class="text-center">0022</td>', "");
    expect(confianza(sinFolio)).toEqual({ ok: false, reason: "1 filas descartadas" });
  });

  test("una fila descartada basta aunque los totales cuadren", () => {
    // El primer </tbody> es el de la tabla del récord.
    const conBasura = record.replace("</tbody>", "<tr><td>FILA DE PRUEBA</td></tr></tbody>");
    expect(parseRecordPage(conBasura).rows).toHaveLength(6);
    expect(confianza(conBasura)).toEqual({ ok: false, reason: "1 filas descartadas" });
  });

  test("ASIG. APR. distinto de las filas aprobadas no es de confianza", () => {
    expect(confianza(pieCon({ 6: "4" }))).toEqual({
      ok: false,
      reason: "aprobadas no coinciden con ASIG. APR.",
    });
  });

  test("CRD. APROB. dentro de la tolerancia de 0.05 es de confianza", () => {
    expect(confianza(pieCon({ 3: "8.54" }))).toEqual({ ok: true });
    expect(confianza(pieCon({ 3: "8.46" }))).toEqual({ ok: true });
  });

  test("CRD. APROB. fuera de la tolerancia no es de confianza", () => {
    const motivo = { ok: false, reason: "créditos aprobados no coinciden con CRD. APROB." };
    expect(confianza(pieCon({ 3: "8.6" }))).toEqual(motivo);
    expect(confianza(pieCon({ 3: "8.4" }))).toEqual(motivo);
  });

  test("ASIG. CONV. mayor que 0 no es de confianza", () => {
    expect(confianza(pieCon({ 5: "1" }))).toEqual({
      ok: false,
      reason: "hay convalidados (ASIG. CONV. > 0)",
    });
  });

  test("ASIG. DESAP. distinto de las filas desaprobadas no es de confianza", () => {
    const motivo = { ok: false, reason: "desaprobadas no coinciden con ASIG. DESAP." };
    expect(confianza(pieCon({ 9: "0" }))).toEqual(motivo);
    expect(confianza(pieCon({ 9: "2" }))).toEqual(motivo);
  });

  test("TOTAL CRD. VALIDOS y TOTAL ASIG. VALIDOS se leen pero no deciden", () => {
    const html = pieCon({ 4: "99.0", 7: "42" });
    expect(parseRecordPage(html).footer?.validCourses).toBe(42);
    expect(confianza(html)).toEqual({ ok: true });
  });

  test("cabecera con mojibake de windows-1252 es de confianza", () => {
    // UTF-8 leído como ISO-8859-1: Ó → "Ã"", Á → "Ã" + U+0081.
    const html = record
      .replace("<th>OBSERVACIÓN</th>", "<th>OBSERVACIÃ“N</th>")
      .replaceAll("VÁLIDOS", "VÃLIDOS");
    expect(html).not.toContain("VÁLIDOS");
    expect(confianza(html)).toEqual({ ok: true });
  });

  test("cabecera con caracter de reemplazo U+FFFD es de confianza", () => {
    // Latin-1 leído como UTF-8: la vocal con tilde se vuelve U+FFFD.
    const html = record
      .replace("<th>OBSERVACIÓN</th>", "<th>OBSERVACI�N</th>")
      .replaceAll("VÁLIDOS", "V�LIDOS");
    expect(confianza(html)).toEqual({ ok: true });
  });
});

describe("approvedRows y failedRows", () => {
  const filas = parseRecordPage(record).rows;
  const resumen = (rows: RecordRow[]) => rows.map((r) => [r.courseCode, r.attempt, r.grade]);

  test("el curso jalado en VEZ 1 y aprobado en VEZ 2 cuenta una vez en cada lado", () => {
    expect(resumen(approvedRows(filas))).toEqual([
      ["4901", 1, 14],
      ["659001", 2, 12],
      ["659002", 1, 17],
    ]);
    expect(resumen(failedRows(filas))).toEqual([["659001", 1, 8]]);
  });

  test("las filas del ciclo en curso no cuentan en ningun total", () => {
    const enCurso = filas.filter((r) => r.periodCode === "2026-2");
    expect(enCurso).toHaveLength(2);
    expect(enCurso.every((r) => r.grade === null)).toBe(true);
    const contadas = [...approvedRows(filas), ...failedRows(filas)];
    expect(contadas.some((r) => r.periodCode === "2026-2")).toBe(false);
  });

  test("solo cuentan notas enteras: 11 a 20 aprueba, 0 a 10 desaprueba", () => {
    const rows = [0, 10, 11, 20, null, 10.5].map((g, i) => filaCon(g, 3, `65900${i}`));
    expect(approvedRows(rows).map((r) => r.grade)).toEqual([11, 20]);
    expect(failedRows(rows).map((r) => r.grade)).toEqual([0, 10]);
  });
});

describe("evaluateRecordTrust: orden y alcance de las condiciones", () => {
  test("la pagina base es de confianza", () => {
    expect(evaluateRecordTrust(pagina({}))).toEqual({ ok: true });
  });

  test("la cabecera se evalua antes que el pie y las filas", () => {
    const page = pagina({ headerOk: false, footer: null, rows: [], discarded: 3 });
    expect(evaluateRecordTrust(page)).toEqual(NO_CABECERA);
  });

  test("sin pie no es de confianza aunque las filas esten bien", () => {
    expect(evaluateRecordTrust(pagina({ footer: null }))).toEqual(NO_PIE);
  });

  test("sin filas se evalua antes que los descartes", () => {
    expect(evaluateRecordTrust(pagina({ rows: [], discarded: 2 }))).toEqual({
      ok: false,
      reason: "sin filas",
    });
  });

  test("el motivo lleva la cantidad de filas descartadas", () => {
    expect(evaluateRecordTrust(pagina({ discarded: 2 }))).toEqual({
      ok: false,
      reason: "2 filas descartadas",
    });
  });

  test("el orden de las cuatro comparaciones del pie es fijo", () => {
    // Con varias condiciones rotas a la vez, el motivo es siempre el de la primera.
    const roto = (cambios: Partial<RecordFooter>) =>
      evaluateRecordTrust(pagina({ footer: { ...PIE, ...cambios } }));
    expect(roto({ approvedCourses: 5, approvedCredits: 99, convalidatedCourses: 1, failedCourses: 9 }))
      .toEqual({ ok: false, reason: "aprobadas no coinciden con ASIG. APR." });
    expect(roto({ approvedCredits: 99, convalidatedCourses: 1, failedCourses: 9 }))
      .toEqual({ ok: false, reason: "créditos aprobados no coinciden con CRD. APROB." });
    expect(roto({ convalidatedCourses: 1, failedCourses: 9 }))
      .toEqual({ ok: false, reason: "hay convalidados (ASIG. CONV. > 0)" });
    expect(roto({ failedCourses: 9 }))
      .toEqual({ ok: false, reason: "desaprobadas no coinciden con ASIG. DESAP." });
  });

  test("filas sin nota o con una marca no suman cursos ni creditos", () => {
    const rows: RecordRow[] = [
      ...FILAS,
      filaCon(null, 4, "659104"),
      { ...filaCon(null, 3, "659105"), gradeRaw: "RET" },
    ];
    expect(evaluateRecordTrust(pagina({ rows }))).toEqual({ ok: true });
  });

  test("la tolerancia de creditos es 0.05", () => {
    expect(CREDIT_TOLERANCE).toBe(0.05);
  });
});
