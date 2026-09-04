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

/** Escapa un literal para incrustarlo en un `RegExp` construido en caliente. */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `value` CRUDO del `<input>` que se llama exactamente `name`, o `null` si no
 * hay tal input (o si el tag no trae `value=`).
 *
 * Existe por la nómina de delegados: ahí el código y el nombre del alumno viven
 * en el atributo `value` de dos inputs `readonly` y NO en el texto de la celda,
 * así que `cellsOf` devuelve cadena vacía sobre esas dos columnas.
 *
 * El nombre se compara COMPLETO —la comilla de cierre es parte del patrón—
 * porque ese formulario hace convivir `prm_sCoUser_1` con `prm_sCoUser_10` y
 * `prm_sCoUser_29` con `prm_sCoUserDlgd`: un `includes` o una regex sin cerrar
 * devolvería el input equivocado.
 *
 * Devuelve el valor sin normalizar: quien lo consuma decide si le aplica `clean`
 * (el código y el nombre sí; un identificador numérico interno puede no querer).
 */
export const inputValueByName = (html: string, name: string): string | null => {
  const n = escapeRe(name);
  const tag = html.match(
    new RegExp(`<input\\b[^>]*\\bname\\s*=\\s*(?:"${n}"|'${n}'|${n}(?=[\\s>]))[^>]*>`, "i"),
  )?.[0];
  if (!tag) return null;
  const v = tag.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]*))/i);
  if (!v) return null;
  return v[1] ?? v[2] ?? v[3] ?? "";
};
