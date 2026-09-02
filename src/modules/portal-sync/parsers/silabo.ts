import { config } from "../../../config/app-config.js";
import type { SyllabusEntry } from "../portal-sync.types.js";

const TITLE_MAX_LENGTH = 150;   // syllabus.title varchar(150)
const URL_MAX_LENGTH = 255;     // syllabus.drive_file_url varchar(255)
const UNID_MAX_LENGTH = 120;    // syllabus.drive_file_id varchar(120)

/**
 * Domino emite el fragmento JS embebido (`AbreArchivo(...)`, dentro de un
 * comentario HTML `<!-- ... -->`) con escapes de barra invertida que NO son
 * válidos en JSON estricto: `\!` y `\>` no están en la lista permitida
 * (`" \\ / b f n r t u`). `JSON.parse` los rechaza con "Bad escaped
 * character" — se comprobó contra la respuesta real guardada en
 * `test/HU31_jeff/fixtures/silabo.json`, que sin este arreglo NUNCA parsea,
 * aunque sea una respuesta válida y completa.
 *
 * Se normaliza duplicando toda barra invertida que no inicie un escape JSON
 * válido: `\!` queda como `\\!` (barra invertida escapada, seguida del
 * carácter literal `!`), que sí es JSON válido y decodifica al mismo texto
 * origen salvo por la barra invertida en sí (irrelevante: no aparece en los
 * campos que se leen).
 */
const sanitizeJson = (raw: string): string => raw.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");

/** `vSyllabusXCicloAV/<UNID>/$File/<filename>`, dentro del snippet JS. */
const ABRE_ARCHIVO = /AbreArchivo\('vSyllabusXCicloAV\/[0-9A-Fa-f]+\/\$File\/([^']+)'\)/;

interface RawViewEntry {
  "@unid"?: unknown;
  entrydata?: Array<{ text?: Record<string, unknown> }>;
}
interface RawSyllabusView { viewentry?: RawViewEntry[] }

/**
 * Sílabo de un curso, de la vista Domino `vSyllabusXCicloAV`
 * (`RestrictToCategory=<COCICLO>_<courseCode>`, `OutputFormat=JSON`).
 *
 * NO sigue el patrón `ParseResult` de los demás parsers: acá "este curso no
 * tiene sílabo publicado" es un resultado legítimo y frecuente (no todo
 * curso lo publica), no un fallo que haya que reportar — de ahí que devuelva
 * `null` directo en vez de `{ ok: false, reason }`. Lo mismo aplica a una
 * respuesta con `viewentry` vacío (RestrictToCategory sin resultados) y a un
 * cuerpo que no parsea como JSON: ambos son "no hay sílabo", no un error.
 *
 * `viewentry[0]["@unid"]` es el id único del documento; el filename (con el
 * ciclo y el nombre del curso, p. ej. `2026-2 SIL PLANEAMIENTO
 * ESTRATÉGICO.pdf`) sale del snippet `AbreArchivo(...)` en
 * `entrydata[].text["0"]`.
 *
 * Guardas de longitud: `syllabus.title` es `varchar(150)`,
 * `syllabus.drive_file_url` es `varchar(255)` y `syllabus.drive_file_id` es
 * `varchar(120)`. Los tres se validan ACÁ, antes de devolver el resultado:
 * la escritura ocurre dentro de la transacción de la importación, así que
 * una fila que la base de datos rechace no "pierde el sílabo" — aborta la
 * transacción y con ella TODA la importación. Mejor omitir el sílabo
 * (devolver `null`, degradado como "sin sílabo") que arriesgar eso por un
 * dato que es un extra, no el propósito de importar.
 */
export const parseSyllabusEntry = (json: string): SyllabusEntry | null => {
  let data: RawSyllabusView;
  try {
    data = JSON.parse(sanitizeJson(json)) as RawSyllabusView;
  } catch {
    return null;
  }

  const entry = data?.viewentry?.[0];
  const unid = entry?.["@unid"];
  if (!entry || typeof unid !== "string" || !unid) return null;
  if (unid.length > UNID_MAX_LENGTH) return null;

  const snippet = (entry.entrydata ?? [])
    .map((d) => d?.text?.["0"])
    .find((t): t is string => typeof t === "string" && t.includes("AbreArchivo"));
  if (!snippet) return null;

  const fileName = snippet.match(ABRE_ARCHIVO)?.[1];
  if (!fileName) return null;
  if (fileName.length > TITLE_MAX_LENGTH) return null;

  const url = `${config.syllabus.baseUrl}/ac/ac_bd001.nsf/vSyllabusXCicloAV/${unid}/$File/${encodeURIComponent(fileName)}`;
  if (url.length > URL_MAX_LENGTH) return null;

  return { unid, fileName, url };
};
