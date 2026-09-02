import { cellsOf, clean, stripTags, trsOf, type ParseResult } from "./html.js";
import type { Matricula, MatriculaRow } from "../portal-sync.types.js";

const CODE = /\b(\d{8})\b/;
const PERIOD = /Per[ií]odo\s*:?\s*(\d{4}-[0-2])/i;

/**
 * Consolidado de matrícula. Es la FUENTE DE IDENTIDAD: si esto falla, la
 * importación aborta con 422 y no escribe nada.
 * Columnas reales de cada fila: CAR. | COD | SEC. | GR. | NOMBRE | Nv. | CRD. | VEZ
 */
export const parseConsolidadoMatricula = (html: string): ParseResult<Matricula> => {
  const text = clean(stripTags(html));
  if (!/C[ÓO]DIGO/i.test(text)) return { ok: false, reason: "el encabezado no trae la columna CÓDIGO" };

  const periodCode = text.match(PERIOD)?.[1];
  if (!periodCode) return { ok: false, reason: "no se pudo leer el período" };

  // Fila de identidad: CÓDIGO | NOMBRES Y APELLIDOS | CARRERA (3 celdas, la 1a de 8 dígitos).
  let studentCode = "";
  let studentName = "";
  let careerName = "";
  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    if (cells.length !== 3) continue;
    if (!CODE.test(cells[0])) continue;
    [studentCode, studentName, careerName] = [cells[0].match(CODE)![1], cells[1], cells[2]];
    break;
  }
  if (!studentCode) return { ok: false, reason: "no se pudo leer el código de alumno" };

  const rows: MatriculaRow[] = [];
  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    // Fila de curso: CAR. (4 díg.) + COD (4-6 díg.) + SEC. (dígitos) y al menos 8 celdas.
    if (cells.length < 8) continue;
    if (!/^\d{4}$/.test(cells[0]) || !/^\d{4,6}$/.test(cells[1]) || !/^\d{1,4}$/.test(cells[2])) continue;
    rows.push({
      carCode: cells[0],
      courseCode: cells[1],
      sectionCode: cells[2],
      groupCode: cells[3],
      courseName: cells[4],
      level: Number.parseInt(cells[5], 10) || 0,
      credits: Math.ceil(Number.parseFloat(cells[6]) || 0),
      attempt: Number.parseInt(cells[7], 10) || 1,
    });
  }
  if (!rows.length) return { ok: false, reason: "no se encontraron filas de curso" };

  return { ok: true, data: { studentCode, studentName, careerName, periodCode, rows } };
};
