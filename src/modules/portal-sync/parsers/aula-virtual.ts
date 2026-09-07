import { clean, stripTags, tdsOf, trsOf, type ParseResult } from "./html.js";
import type { AulaVirtualRow } from "../portal-sync.types.js";

/**
 * "DIEZ QUIÑONES / PANDURO / PERCY" -> "DIEZ QUIÑONES PANDURO, PERCY".
 *
 * El portal separa con barras los apellidos de los nombres, y esa es la ÚNICA
 * señal de dónde termina el apellido: un apellido paterno puede ser compuesto
 * ("DIEZ QUIÑONES") y desde el texto plano no hay forma de saberlo. Antes esto
 * aplanaba a "NOMBRES APELLIDOS" y tiraba esa señal, así que al mostrarlo se
 * partía por la convención de dos apellidos y salía "JAVIER MORE, SANCHEZ".
 *
 * Se conserva la coma a propósito: deja el corte explícito para siempre y
 * `partirNombre` ya la respeta por encima de cualquier convención.
 */
export const normalizeTeacherName = (raw: string): string => {
  const parts = clean(raw).split("/").map((p) => clean(p)).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].toUpperCase();
  const nombres = parts[parts.length - 1];
  const apellidos = parts.slice(0, -1).join(" ");
  return clean(`${apellidos}, ${nombres}`).toUpperCase();
};

/**
 * Bloque "Aula Virtual" de layout.jsp: Código | Nombre (+ docente en <br>) | Sección | Sílabo.
 * Es la fuente del NOMBRE COMPLETO del curso (el récord y el horario lo traen truncado a 20).
 */
export const parseAulaVirtual = (html: string): ParseResult<AulaVirtualRow[]> => {
  const out: AulaVirtualRow[] = [];
  for (const tr of trsOf(html)) {
    const tds = tdsOf(tr);
    if (tds.length < 3) continue;
    const code = clean(stripTags(tds[0]));
    if (!/^\d{4,6}$/.test(code)) continue;
    // La 2a celda trae "NOMBRE<br>APELLIDO / APELLIDO / NOMBRES" dentro de <font> anidados.
    const inner = tds[1].replace(/<br\s*\/?>/gi, "|");
    const [nombreRaw, docenteRaw = ""] = clean(stripTags(inner)).split("|");
    const section = clean(stripTags(tds[2]));
    if (!/^\d{1,4}$/.test(section)) continue;
    out.push({
      courseCode: code,
      courseName: clean(nombreRaw),
      sectionCode: section,
      teacherName: normalizeTeacherName(docenteRaw),
    });
  }
  if (!out.length) return { ok: false, reason: "no se encontró el bloque Aula Virtual" };
  return { ok: true, data: out };
};
