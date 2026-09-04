import { clean, inputValueByName, type ParseResult } from "./html.js";
import type {
  DelegadoAula, DelegadoDescarte, DelegadosNomina,
} from "../portal-sync.types.js";

/**
 * Delegados del Aula Virtual. Dos parsers puros, sin dependencias, para los dos
 * saltos que hay que dar después del cascarón:
 *
 *   sidebar (ComandoListarCursosXOpcionAulaVirtualDelegado) -> `parseAulas`
 *   nómina  (ComandoListarAulaDelegadoAulaVirtual)          -> `parseDelegados`
 *
 * El cascarón (`ComandoIngresarAulaVirtualBBDelegado`) no trae dato: es un
 * frameset y por eso no tiene parser.
 *
 * Los DTO viven en `portal-sync.types.ts`, como los de los otros seis parsers.
 */

/** Largos de `section_representative_claim`. Un valor más largo NO se devuelve:
 *  la escritura va dentro de la transacción de la importación y un 22001 ahí
 *  haría rollback de notas, horario y matrícula (RS-6a). */
const MAX_CODE = 30;
const MAX_NAME = 150;

/**
 * Lee `<nombre>[<i>]="<valor>";` de los arrays JS planos del sidebar y lo
 * devuelve indexado por el subíndice EXPLÍCITO, nunca por orden de aparición.
 *
 * El guard `(^|[^A-Za-z0-9_$])` hace las veces de frontera de identificador:
 * el mismo bloque declara `aCoordCurs`, `aNomCurs` y `aNomDepc`, y una regex
 * suelta emparejaría el array equivocado. Se evita un lookbehind a propósito,
 * por compatibilidad con cualquier runtime.
 *
 * Un índice repetido se queda con la ÚLTIMA asignación, que es lo que haría el
 * navegador al ejecutar ese script.
 */
const jsArray = (html: string, name: string): Map<number, string> => {
  const re = new RegExp(
    `(^|[^A-Za-z0-9_$])${name}\\s*\\[\\s*(\\d+)\\s*\\]\\s*=\\s*["']([^"']*)["']`,
    "g",
  );
  const out = new Map<number, string>();
  for (const m of html.matchAll(re)) out.set(Number.parseInt(m[2], 10), m[3]);
  return out;
};

/** Aulas que el sidebar realmente ofrece abrir. */
const aulasAbiertas = (html: string): Set<string> =>
  new Set([...html.matchAll(/OpenDelegado\(\s*['"](\d+)['"]\s*\)/gi)].map((m) => m[1]));

/**
 * Sidebar de delegados -> el aula de cada curso, con el par que lo identifica.
 *
 * El emparejamiento es por el subíndice `[i]` de cada array y NUNCA por la
 * posición dentro del resultado de la regex: el JSP emite ramas condicionales,
 * así que a un índice le puede faltar un array, y consumir los tres arrays en
 * paralelo desplazaría en silencio todos los cursos posteriores — escribiendo
 * la nómina de un curso dentro de otro. Un índice incompleto se descarta solo,
 * sin mover a los demás.
 *
 * Validaciones: mismas que `parsers/record.ts` y `parsers/aula-virtual.ts` para
 * curso (`\d{4,6}`, porque en la segunda cuenta sondeada hay códigos de 4) y
 * sección (`\d{1,4}`). El aula se valida con el mismo `\d{4,8}` con que el
 * cliente la va a interpolar, para que una malformada muera acá y no allá.
 *
 * NO se filtra por `aTipAV`: las 10 entradas observadas son "002" y filtrar por
 * un valor del que solo se conoce una variante sería una suposición sin muestra.
 * `aNomCurs` se ignora: viene truncado a 20 caracteres.
 *
 * Además se exige que el aula aparezca en un `OpenDelegado('<aula>')` del mismo
 * sidebar: los arrays los llena el JSP siempre, pero el enlace solo se emite
 * para los cursos que de verdad tienen panel de delegados.
 */
export const parseAulas = (html: string): ParseResult<DelegadoAula[]> => {
  const aulas = jsArray(html, "aNuAula");
  const cursos = jsArray(html, "aCurs");
  const secciones = jsArray(html, "aSecc");
  const abiertas = aulasAbiertas(html);

  const out: DelegadoAula[] = [];
  for (const i of [...aulas.keys()].sort((a, b) => a - b)) {
    const aula = aulas.get(i) ?? "";
    const courseCode = cursos.get(i) ?? "";
    const sectionCode = secciones.get(i) ?? "";
    if (!/^\d{4,8}$/.test(aula)) continue;
    if (!/^\d{4,6}$/.test(courseCode)) continue;
    if (!/^\d{1,4}$/.test(sectionCode)) continue;
    if (!abiertas.has(aula)) continue;
    out.push({ aula, courseCode, sectionCode });
  }

  // Cero aulas no es "este alumno no tiene cursos": este portal devuelve la
  // página de login con HTTP 200, y así se ve. Se falla, como todos los demás
  // parsers del módulo, en vez de reportar un sidebar vacío.
  if (!out.length) {
    return { ok: false, reason: "el sidebar de delegados no trae ninguna aula utilizable" };
  }
  return { ok: true, data: out };
};

/** Cualquier `<input>`, con sus atributos intactos. */
const INPUT_TAG = /<input\b[^>]*>/gi;
/** El `name` de un tag, con o sin comillas. */
const NAME_ATTR = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i;
/** RS-3: el ancla `^...$` es obligatoria. `prm_sFgInsert_29` y `prm_sFgUpdate_29`
 *  comparten el prefijo `prm_sFg` con las casillas y están en la misma fila. */
const CARGO_NAME = /^prm_sFg(Dlgd|Sdlg)_(\d+)$/;
/** Una fila de alumno se cuenta por su input de código, que sí existe siempre. */
const ALUMNO_NAME = /^prm_sCoUser_(\d+)$/;
/** `checked`, `CHECKED` y `checked="checked"`, en posición de atributo. Un
 *  `\bchecked\b` suelto también aceptaría `class="is-checked"`. */
const CHECKED = /(?:^|\s)checked(?=[\s=>/]|$)/i;
/** `<title>Aula Delegado 154508</title>`. */
const TITULO = /<title[^>]*>([\s\S]*?)<\/title>/i;

const ETIQUETA: Record<"delegate" | "subdelegate", string> = {
  delegate: "delegado",
  subdelegate: "subdelegado",
};

/**
 * Nómina de una sección -> delegado y subdelegado.
 *
 * `aulaEsperada` no es decorativa: las nóminas se piden en paralelo (RS-9) y sin
 * confrontar la respuesta con el aula pedida dos peticiones cruzadas escribirían
 * los delegados de una sección dentro de otra. Se confronta contra las DOS
 * fuentes que trae la página, el `<title>` y el hidden `prm_sNuAula`, y basta
 * que una discrepe para no escribir nada.
 *
 * El dato NO se lee del texto de la celda: las columnas Código y Apellidos y
 * Nombres son inputs `readonly` y su celda no tiene texto (`cellsOf` devolvería
 * cadena vacía). La llave es el sufijo `<orden>` del `name` de la casilla.
 */
export const parseDelegados = (
  html: string,
  aulaEsperada: string,
): ParseResult<DelegadosNomina> => {
  const marcados: { position: "delegate" | "subdelegate"; orden: string }[] = [];
  let filas = 0;

  for (const [tag] of html.matchAll(INPUT_TAG)) {
    const nm = tag.match(NAME_ATTR);
    const name = nm ? (nm[1] ?? nm[2] ?? nm[3] ?? "") : "";
    if (ALUMNO_NAME.test(name)) {
      filas += 1;
      continue;
    }
    const cargo = CARGO_NAME.exec(name);
    if (!cargo) continue;
    // RS-4: se mira `checked` y NUNCA `DISABLED`. Las 20 casillas observadas en
    // las 2 cuentas vienen deshabilitadas —incluida la de una cuenta que ostenta
    // un cargo—, así que `DISABLED` no distingue nada y atarse a él sería atarse
    // a un detalle de presentación que el portal puede cambiar sin aviso.
    if (!CHECKED.test(tag)) continue;
    marcados.push({ position: cargo[1] === "Dlgd" ? "delegate" : "subdelegate", orden: cargo[2] });
  }

  // RS-6, primer corte: sin una sola fila de alumno esto no es una sección sin
  // delegado, es una respuesta que no es la nómina. Va antes que todo lo demás
  // porque es el diagnóstico correcto de la página de login con HTTP 200.
  if (filas === 0) {
    return { ok: false, reason: "la respuesta no trae ninguna fila de alumno" };
  }

  const esperada = clean(aulaEsperada);
  const declaradas = new Set<string>();
  const titulo = html.match(TITULO)?.[1];
  const enTitulo = titulo ? clean(titulo).match(/^Aula\s+Delegado\s+(\S+)$/i)?.[1] : undefined;
  if (enTitulo) declaradas.add(enTitulo);
  const oculto = clean(inputValueByName(html, "prm_sNuAula") ?? "");
  if (oculto) declaradas.add(oculto);

  if (declaradas.size === 0) {
    return { ok: false, reason: `la respuesta no declara a qué aula pertenece (se pidió ${esperada})` };
  }
  for (const declarada of declaradas) {
    if (declarada !== esperada) {
      return { ok: false, reason: `la respuesta es del aula ${declarada} y se pidió ${esperada}` };
    }
  }

  const data: DelegadosNomina = {};
  const warnings: DelegadoDescarte[] = [];
  for (const position of ["delegate", "subdelegate"] as const) {
    const propios = marcados.filter((m) => m.position === position);
    // RS-6: dos casillas del mismo cargo es ambigüedad. Antes que elegir una, no
    // se escribe nada: un rol a medias es peor que no tener el dato.
    if (propios.length > 1) {
      return {
        ok: false,
        reason: `hay ${propios.length} casillas de ${ETIQUETA[position]} marcadas`,
      };
    }
    const marca = propios[0];
    if (!marca) continue;

    const code = clean(inputValueByName(html, `prm_sCoUser_${marca.orden}`) ?? "");
    // RS-6: sin código no hay a quién empatar contra `app_user.code` cuando esa
    // persona se registre, y el claim quedaría siendo un nombre suelto.
    if (!code) {
      return {
        ok: false,
        reason: `la fila ${marca.orden}, marcada como ${ETIQUETA[position]}, no trae código`,
      };
    }
    const fullName = clean(inputValueByName(html, `prm_sNoCmpUser_${marca.orden}`) ?? "");

    // RS-6a: lo que la BD rechazaría se devuelve como AUSENTE, no como ok:false.
    // El nombre vacío entra acá por el mismo motivo: un claim sin nombre no le
    // sirve a la app (mostraría un número) y el problema es del nombre, no de la
    // identidad, así que no invalida al otro cargo de la misma nómina.
    if (code.length > MAX_CODE || !fullName || fullName.length > MAX_NAME) {
      warnings.push({
        position,
        reason: `se descartó el ${ETIQUETA[position]} de la fila ${marca.orden}: `
          + `código de ${code.length} y nombre de ${fullName.length} caracteres`,
      });
      continue;
    }
    data[position] = { code, fullName };
  }

  // RS-5: cero casillas marcadas con filas de alumno presentes es una sección
  // que todavía no eligió. `ok: true` con ambos campos ausentes.
  if (warnings.length) data.warnings = warnings;
  return { ok: true, data };
};
