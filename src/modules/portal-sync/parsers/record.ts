import { cellsOf, trsOf, type ParseResult } from "./html.js";
import type { RecordRow } from "../portal-sync.types.js";

/**
 * Récord académico. Columnas reales:
 * CICLO | COD. | ASIGNATURA | VIG. | FAC. | VEZ | CRD. | NOTA | SEC. | TOMO | FOLIO | OBSERVACIÓN
 * La celda CICLO SOLO trae valor en la primera fila de cada grupo (&nbsp; en las
 * demás): se arrastra el último valor no vacío.
 */
export const parseRecordAcademico = (html: string): ParseResult<RecordRow[]> => {
  const out: RecordRow[] = [];
  let currentPeriod = "";

  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    if (cells.length < 9) continue;

    const cicloCell = cells[0];
    if (/^\d{4}-[0-2]$/.test(cicloCell)) currentPeriod = cicloCell;
    if (!currentPeriod) continue;

    const courseCode = cells[1];
    if (!/^\d{4,6}$/.test(courseCode)) continue;

    const gradeRaw = cells[7];
    const gradeNum = Number.parseInt(gradeRaw, 10);
    const grade = /^\d{1,2}$/.test(gradeRaw) && gradeNum >= 0 && gradeNum <= 20 ? gradeNum : null;

    out.push({
      periodCode: currentPeriod,
      courseCode,
      courseName: cells[2],
      attempt: Number.parseInt(cells[5], 10) || 1,
      credits: Math.ceil(Number.parseFloat(cells[6]) || 0),
      grade,
      sectionCode: cells[8],
    });
  }

  if (!out.length) return { ok: false, reason: "no se encontraron filas de récord" };
  return { ok: true, data: out };
};
