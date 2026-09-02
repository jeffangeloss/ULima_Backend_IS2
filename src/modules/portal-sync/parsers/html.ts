/** Resultado uniforme de todo parser: nunca lanza, devuelve el motivo del fallo. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Allowlist de entidades nombradas derivada de los fixtures comprometidos.
 *  Una entidad que no aparece aquí se pasa sin decodificar. */
const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  Ntilde: "Ñ", ntilde: "ñ", Ccedil: "Ç", ccedil: "ç",
  Aacute: "Á", aacute: "á", Eacute: "É", eacute: "é", Iacute: "Í", iacute: "í",
  Oacute: "Ó", oacute: "ó", Uacute: "Ú", uacute: "ú", Uuml: "Ü", uuml: "ü",
  Agrave: "À", agrave: "à", ordm: "º", ordf: "ª", deg: "°", middot: "·", hellip: "…",
};

/** Decodifica entidades nombradas y numéricas. layout.jsp las usa; los servlets no. */
export const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([A-Za-z]+);/g, (m, name) => NAMED[name] ?? m);

/** Quita etiquetas conservando el texto. Reemplaza etiquetas con espacio para que textos adyacentes queden separados. */
export const stripTags = (s: string): string => s.replace(/<[^>]*>/g, " ");

/** Normalización obligatoria antes de comparar o guardar cualquier texto del portal. */
export const clean = (s: string): string =>
  decodeEntities(s ?? "").replace(/\s+/g, " ").trim();

/** Filas crudas del HTML, con su marcado intacto. */
export const trsOf = (html: string): string[] => html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

/** Celdas `<td>` CRUDAS de una fila: los parsers de horario y Aula Virtual
 *  necesitan los atributos (`title`, `width`), no solo el texto. */
export const tdsOf = (tr: string): string[] => tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];

/** Texto ya normalizado de cada celda (`td` o `th`) de una fila. */
export const cellsOf = (tr: string): string[] =>
  (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((td) => clean(stripTags(td)));
