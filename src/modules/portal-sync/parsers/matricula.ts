import { cellsOf, clean, stripTags, trsOf, type ParseResult } from "./html.js";
import type { Matricula, MatriculaRow } from "../portal-sync.types.js";

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

  // Identidad anclada al encabezado. Sin ancla, cualquier fila de 3 celdas con
  // 8 dígitos delante (un número de trámite, por ejemplo) se aceptaría como
  // identidad. Y si aparece más de una candidata, se falla en vez de elegir:
  // esta es la única prueba de que la sesión del portal es del alumno correcto.
  const rows = trsOf(html);
  const headerIdx = rows.findIndex((tr) => {
    const c = cellsOf(tr);
    return c.length === 3 && /^C[ÓO]DIGO$/i.test(c[0]);
  });
  if (headerIdx === -1) {
    return { ok: false, reason: "no se encontró la fila de encabezado CÓDIGO" };
  }

  const idRows = rows
    .slice(headerIdx + 1)
    .map((tr) => cellsOf(tr))
    .filter((c) => c.length === 3 && /^\d{8}$/.test(c[0]));

  if (idRows.length === 0) {
    return { ok: false, reason: "no se encontró la fila de identidad bajo el encabezado CÓDIGO" };
  }
  if (idRows.length > 1) {
    return { ok: false, reason: `hay ${idRows.length} filas de identidad candidatas; el portal cambió de formato` };
  }
  const [studentCode, studentName, careerName] = idRows[0];

  const courseRows: MatriculaRow[] = [];
  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    // Fila de curso: CAR. (4 díg.) + COD (4-6 díg.) + SEC. (dígitos) y al menos 8 celdas.
    if (cells.length < 8) continue;
    if (!/^\d{4}$/.test(cells[0]) || !/^\d{4,6}$/.test(cells[1]) || !/^\d{1,4}$/.test(cells[2])) continue;
    courseRows.push({
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
  if (!courseRows.length) return { ok: false, reason: "no se encontraron filas de curso" };

  return { ok: true, data: { studentCode, studentName, careerName, periodCode, rows: courseRows } };
};
