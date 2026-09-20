import { cellsOf, normalizeLabel, trsOf, type ParseResult } from "./html.js";
import type { RecordFooter, RecordPage, RecordRow } from "../portal-sync.types.js";

/**
 * Récord académico (RS-BE-19 y RS-BE-20 de academic-record.spec.md).
 *
 * La página trae dos tablas sin anidar y con la MISMA clase, así que solo la
 * cabecera las distingue:
 * - la del récord, 12 columnas:
 *   CICLO | COD. | ASIGNATURA | VIG. | FAC. | VEZ | CRD. | NOTA | SEC. | TOMO | FOLIO | OBSERVACIÓN
 *   La celda CICLO SOLO trae valor en la primera fila de cada grupo (&nbsp; en
 *   las demás): se arrastra el último valor no vacío.
 * - la del pie, 10 columnas con los totales (una sola fila de valores).
 *
 * Si no aparece la tabla del récord con su cabecera exacta, se lee la página
 * entera como antes (`headerOk: false`): el récord no será de confianza
 * (RS-BE-21), pero el resto de la importación sigue como hoy.
 */

/** Cabecera del récord, ya normalizada con `normalizeLabel`. */
export const RECORD_HEADER: readonly string[] = [
  "CICLO", "COD.", "ASIGNATURA", "VIG.", "FAC.", "VEZ", "CRD.", "NOTA", "SEC.", "TOMO", "FOLIO", "OBSERVACION",
];

/** Cabecera del pie, ya normalizada con `normalizeLabel`. */
export const FOOTER_HEADER: readonly string[] = [
  "COD. CAR.", "PROM. POND.", "CRD. CONV.", "CRD. APROB.", "TOTAL CRD. VALIDOS",
  "ASIG. CONV.", "ASIG. APR.", "TOTAL ASIG. VALIDOS", "CRD. DESAP.", "ASIG. DESAP.",
];

const PERIOD_RE = /^\d{4}-[0-2]$/;
const COURSE_CODE_RE = /^\d{4,6}$/;
const INTEGER_RE = /^\d+$/;
const NUMBER_RE = /^\d+(\.\d+)?$/;
const VALIDOS = "VALIDOS";

/**
 * ¿El rótulo crudo `actual` es el rótulo esperado `expected` (ya normalizado)?
 *
 * Las únicas tildes de las dos cabeceras están en OBSERVACIÓN y en los dos
 * VÁLIDOS. Si el portal mandó UTF-8 y `portal.client.ts` lo decodificó como
 * ISO-8859-1 (o al revés), esa letra llega rota: por eso OBSERVACIÓN se compara
 * por el prefijo "OBSERVACI" y los dos VÁLIDOS por su prefijo y el sufijo
 * "LIDOS". Dos rótulos terminan en LIDOS: la comparación es por posición,
 * nunca por búsqueda.
 */
export const labelMatches = (actual: string, expected: string): boolean => {
  const label = normalizeLabel(actual);
  if (expected === "OBSERVACION") return label.startsWith("OBSERVACI");
  if (expected.endsWith(VALIDOS)) {
    return label.startsWith(expected.slice(0, -VALIDOS.length)) && label.endsWith("LIDOS");
  }
  return label === expected;
};

const headerMatches = (cells: string[], expected: readonly string[]): boolean =>
  cells.length === expected.length && cells.every((cell, i) => labelMatches(cell, expected[i]));

/**
 * `<tr>` crudas de la primera tabla cuya primera fila es la cabecera esperada,
 * o `null`. La página del récord no anida tablas, así que cada tabla termina en
 * el primer `</table>`. `cellsOf` se aplica a la `<tr>` y nunca a la tabla
 * entera: su regex `<t[dh]` también atrapa `<thead`.
 */
const findTable = (html: string, expected: readonly string[]): string[] | null => {
  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const trs = trsOf(table);
    if (trs.length && headerMatches(cellsOf(trs[0]), expected)) return trs;
  }
  return null;
};

/** Una fila ya validada. `grade` conserva exactamente la regla de siempre. */
const toRow = (periodCode: string, cells: string[]): RecordRow => {
  const gradeText = cells[7];
  const gradeNum = Number.parseInt(gradeText, 10);
  const grade = /^\d{1,2}$/.test(gradeText) && gradeNum >= 0 && gradeNum <= 20 ? gradeNum : null;
  const observation = cells[11] ?? "";
  return {
    periodCode,
    courseCode: cells[1],
    courseName: cells[2],
    attempt: Number.parseInt(cells[5], 10) || 1,
    credits: Number.parseFloat(cells[6]) || 0,
    grade,
    sectionCode: cells[8],
    gradeRaw: gradeText === "" ? null : gradeText,
    observation: observation === "" ? null : observation,
  };
};

/** Filas de la tabla del récord, con las descartadas contadas. */
const readRecordTable = (trs: string[]): { rows: RecordRow[]; discarded: number } => {
  const rows: RecordRow[] = [];
  let discarded = 0;
  let currentPeriod = "";

  for (const tr of trs.slice(1)) {
    const cells = cellsOf(tr);
    if (cells.length !== RECORD_HEADER.length) { discarded++; continue; }
    if (PERIOD_RE.test(cells[0])) currentPeriod = cells[0];
    const valid =
      currentPeriod !== "" &&
      COURSE_CODE_RE.test(cells[1]) &&
      INTEGER_RE.test(cells[5]) && Number.parseInt(cells[5], 10) >= 1 &&
      NUMBER_RE.test(cells[6]);
    if (!valid) { discarded++; continue; }
    rows.push(toRow(currentPeriod, cells));
  }
  return { rows, discarded };
};

/** Lectura de antes, sobre la página entera: para HTML sin la cabecera del
 *  récord. No cuenta descartes. */
const readLoose = (html: string): RecordRow[] => {
  const rows: RecordRow[] = [];
  let currentPeriod = "";

  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    if (cells.length < 9) continue;
    if (PERIOD_RE.test(cells[0])) currentPeriod = cells[0];
    if (!currentPeriod) continue;
    if (!COURSE_CODE_RE.test(cells[1])) continue;
    rows.push(toRow(currentPeriod, cells));
  }
  return rows;
};

/** Primera fila de valores del pie. `null` si falta o si alguna de las
 *  celdas 1..9 no es un número. */
const readFooter = (trs: string[] | null): RecordFooter | null => {
  if (!trs || trs.length < 2) return null;
  const cells = cellsOf(trs[1]);
  if (cells.length !== FOOTER_HEADER.length) return null;
  if (!cells.slice(1).every((cell) => NUMBER_RE.test(cell))) return null;
  const n = (i: number): number => Number(cells[i]);
  return {
    weightedAverage: n(1), convalidatedCredits: n(2), approvedCredits: n(3), validCredits: n(4),
    convalidatedCourses: n(5), approvedCourses: n(6), validCourses: n(7),
    failedCredits: n(8), failedCourses: n(9),
  };
};

/** Lee la página del récord completa. Nunca lanza. */
export const parseRecordPage = (html: string): RecordPage => {
  const source = html ?? "";
  const footer = readFooter(findTable(source, FOOTER_HEADER));
  const recordTrs = findTable(source, RECORD_HEADER);
  if (!recordTrs) return { rows: readLoose(source), headerOk: false, discarded: 0, footer };
  const { rows, discarded } = readRecordTable(recordTrs);
  return { rows, headerOk: true, discarded, footer };
};

/** Las filas en la forma de siempre de los parsers. */
export const recordRows = (page: RecordPage): ParseResult<RecordRow[]> =>
  page.rows.length
    ? { ok: true, data: page.rows }
    : { ok: false, reason: "no se encontraron filas de récord" };

/** Envoltorio compatible: las filas del récord, como antes. */
export const parseRecordAcademico = (html: string): ParseResult<RecordRow[]> =>
  recordRows(parseRecordPage(html));
