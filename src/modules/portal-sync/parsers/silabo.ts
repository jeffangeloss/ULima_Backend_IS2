import { config } from "../../../config/app-config.js";
import type { SyllabusEntry } from "../portal-sync.types.js";

const TITLE_MAX_LENGTH = 150;   // syllabus.title varchar(150)
const URL_MAX_LENGTH = 255;     // syllabus.drive_file_url varchar(255)
const UNID_MAX_LENGTH = 120;    // syllabus.drive_file_id varchar(120)

/**
 * `@unid` aceptable. Un UNID de Domino son 32 dígitos hexadecimales; se exige
 * la forma (no solo la longitud) porque este valor entra CRUDO en la URL que
 * se persiste en `drive_file_url` y que la app entrega al alumno como enlace.
 * Sin esta validación, un `@unid` con `../` o con `?`/`#` — influenciable por
 * la respuesta de Domino — se guardaba tal cual, con traversal de path dentro
 * del host y capacidad de cortar el path. La cota de longitud queda subsumida
 * acá (`varchar(120)`).
 */
const UNID_PATTERN = new RegExp(`^[0-9A-Fa-f]{1,${UNID_MAX_LENGTH}}$`);

/**
 * Domino emite el fragmento JS embebido (`AbreArchivo(...)`, dentro de un
 * comentario HTML `<!-- ... -->`) con escapes de barra invertida que NO son
 * válidos en JSON estricto: `\!` y `\>` no están en la lista permitida
 * (`" \\ / b f n r t u`). `JSON.parse` los rechaza con "Bad escaped
 * character" — se comprobó contra la respuesta real guardada en
 * `test/HU31_jeff/fixtures/silabo.json`, que sin este arreglo NUNCA parsea,
 * aunque sea una respuesta válida y completa.
 *
 * La normalización recorre el cuerpo de izquierda a derecha consumiendo
 * PRIMERO los escapes válidos (`\uXXXX` con sus cuatro dígitos hex, y `\"`
 * `\\` `\/` `\b` `\f` `\n` `\r` `\t`), que quedan intactos. Solo cuando la
 * barra invertida no inicia un escape válido se ELIMINA, dejando el carácter
 * literal que la seguía: `\!` → `!`, `\>` → `>`, `\'` → `'`.
 *
 * Se elimina, y NO se duplica, a propósito: duplicarla (`\!` → `\\!`) también
 * produce JSON válido, pero decodifica a una barra invertida LITERAL dentro
 * del texto, que termina guardada en `syllabus.title` y percent-codificada
 * (`%5C`) en `drive_file_url` — una URL que apunta a un adjunto que en Domino
 * no existe. Esa corrupción sería silenciosa: no devuelve `null`, devuelve un
 * registro que parece bueno.
 *
 * Consumir primero los escapes válidos también deja intacto un cuerpo que ya
 * era JSON válido: en `"A\\!B"` la barra escapada se conserva y el `!` que la
 * sigue no la convierte en un escape inválido.
 */
const sanitizeJson = (raw: string): string =>
  raw.replace(/\\u[0-9A-Fa-f]{4}|\\["\\/bfnrt]|\\([\s\S])/g, (match, invalido?: string) => invalido ?? match);

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
 * `@unid` es el id único del documento; el filename (con el ciclo y el
 * nombre del curso, p. ej. `2026-2 SIL PLANEAMIENTO ESTRATÉGICO.pdf`) sale
 * del snippet `AbreArchivo(...)` en `entrydata[].text["0"]`.
 *
 * El cliente pide `Count=5`, así que la vista puede devolver más de una
 * entrada para la misma categoría (un sílabo republicado que convive con el
 * anterior, o un documento sin adjunto listado primero). Se recorren TODAS en
 * orden y se devuelve la PRIMERA usable: `@unid` con forma válida, snippet
 * `AbreArchivo` legible y filename/URL dentro de los topes de la BD. Mirar
 * solo la primera entrada perdía el sílabo aunque estuviera publicado.
 *
 * Guardas de longitud: `syllabus.title` es `varchar(150)`,
 * `syllabus.drive_file_url` es `varchar(255)` y `syllabus.drive_file_id` es
 * `varchar(120)`. Los tres se validan ACÁ, antes de devolver el resultado:
 * la escritura ocurre dentro de la transacción de la importación, así que una
 * fila que la base de datos rechace POR LONGITUD no "pierde el sílabo" —
 * aborta la transacción y con ella TODA la importación. Mejor descartar esa
 * entrada y seguir con la siguiente (si ninguna sirve, `null`, degradado como
 * "sin sílabo") que arriesgar eso por un dato que es un extra, no el
 * propósito de importar.
 */
export const parseSyllabusEntry = (json: string): SyllabusEntry | null => {
  let data: RawSyllabusView;
  try {
    data = JSON.parse(sanitizeJson(json)) as RawSyllabusView;
  } catch {
    return null;
  }

  const entries = Array.isArray(data?.viewentry) ? data.viewentry : [];
  for (const entry of entries) {
    const unid = entry?.["@unid"];
    if (typeof unid !== "string" || !UNID_PATTERN.test(unid)) continue;

    const snippet = (entry.entrydata ?? [])
      .map((d) => d?.text?.["0"])
      .find((t): t is string => typeof t === "string" && t.includes("AbreArchivo"));
    if (!snippet) continue;

    const fileName = snippet.match(ABRE_ARCHIVO)?.[1];
    if (!fileName || fileName.length > TITLE_MAX_LENGTH) continue;

    const url = `${config.syllabus.baseUrl}/ac/ac_bd001.nsf/vSyllabusXCicloAV/${unid}/$File/${encodeURIComponent(fileName)}`;
    if (url.length > URL_MAX_LENGTH) continue;

    return { unid, fileName, url };
  }
  return null;
};
