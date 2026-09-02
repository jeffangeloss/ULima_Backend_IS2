import { clean, stripTags, tdsOf, trsOf, type ParseResult } from "./html.js";
import type { HorarioSession } from "../portal-sync.types.js";

const hhmm = (h: number): string => `${String(h).padStart(2, "0")}:00`;

interface Cell { courseCode: string; dayOfWeek: number; hour: number; classroom: string | null }

/**
 * Tabla de horario: 16 franjas ("7-8" … "22-23") x 6 días (Lun..Sab) = 96 celdas.
 * OJO: el portal emite el atributo `title` en LAS 96, vacío en las libres
 * (`<font ... size="1" title>`). Su sola presencia NO indica clase: solo cuenta
 * `title` con valor que empiece por el código de curso.
 */
export const parseHorario = (html: string): ParseResult<HorarioSession[]> => {
  const cells: Cell[] = [];

  for (const tr of trsOf(html)) {
    const tds = tdsOf(tr);
    if (tds.length < 7) continue;
    const hourLabel = clean(stripTags(tds[0]));
    const hm = hourLabel.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!hm) continue;
    const hour = Number.parseInt(hm[1], 10);

    for (let d = 1; d <= 6 && d < tds.length; d++) {
      const titleAttr = tds[d].match(/title\s*=\s*"([^"]*)"/i)?.[1];
      if (!titleAttr) continue;                       // title sin valor => celda libre
      const t = clean(titleAttr);
      const cm = t.match(/^(\d{4,6})\s+\S/);
      if (!cm) continue;
      // El aula es la última línea de la celda, tras el <br> que sigue al </small>.
      const afterSmall = tds[d].split(/<\/small>/i).pop() ?? "";
      const classroom = clean(stripTags(afterSmall)) || null;
      cells.push({ courseCode: cm[1], dayOfWeek: d, hour, classroom });
    }
  }

  if (!cells.length) return { ok: false, reason: "no se encontró la tabla de horario" };

  // Fusión de bloques contiguos del mismo curso, día y aula.
  cells.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.courseCode.localeCompare(b.courseCode) || a.hour - b.hour);
  const out: HorarioSession[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (
      last &&
      last.courseCode === c.courseCode &&
      last.dayOfWeek === c.dayOfWeek &&
      last.classroom === c.classroom &&
      last.endTime === hhmm(c.hour)
    ) {
      last.endTime = hhmm(c.hour + 1);
      continue;
    }
    out.push({
      courseCode: c.courseCode,
      dayOfWeek: c.dayOfWeek,
      startTime: hhmm(c.hour),
      endTime: hhmm(c.hour + 1),
      classroom: c.classroom,
    });
  }
  return { ok: true, data: out };
};
