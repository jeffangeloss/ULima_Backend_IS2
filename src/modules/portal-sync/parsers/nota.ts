import { clean, stripTags, type ParseResult } from "./html.js";
import type { AgregadoUlima, NotaCurso } from "../portal-sync.types.js";

/**
 * RS-BE-52 y RS-BE-53 · panel Nota del Aula Virtual, vista del alumno.
 *
 * `parseNotaCurso` lee la página de un curso, que trae en JavaScript el curso,
 * la sección y cuatro agregados, y abre el marco «Detalle Evaluaciones».
 *
 * Los motivos de fallo son literales fijos y nunca llevan un fragmento del
 * HTML. Las asignaciones `min*` y `max*` no se leen nunca, porque son datos de
 * la clase entera, es decir de terceros, y usan el mismo 0 ambiguo.
 *
 * Este archivo no entra al barrel `parsers/index.ts`, que cuenta
 * `scripts/verificar-readme.py`, y se importa directo.
 */

const MARCO = /^\/portalUL\/gada\/servlets\/ComandoConsultarTareaAcademica\?prm_sNuAula=(\d{4,8})$/;
const NOTA_AGREGADO = /^\d{1,2}(\.\d{1,2})?$/;
const CLAVES: ReadonlyArray<AgregadoUlima["clave"]> = ["EP", "TA", "EF", "PROM"];

/**
 * Valor de la asignación JavaScript `nombre = '<valor>';` al comienzo de una
 * línea, tras espacios o tabulaciones opcionales y con `var` opcional, con
 * comillas simples, dobles o sin ellas. La página viva sangra cada `var` con
 * tabulaciones, y una línea cuyo primer carácter visible empieza un `//` nunca
 * calza, así que la línea comentada con el nombre del alumno queda fuera por
 * construcción.
 */
export const asignacionJs = (html: string, nombre: string): string | null => {
  const re = new RegExp(
    `^[ \\t]*(?:var[ \\t]+)?${nombre}[ \\t]*=[ \\t]*(?:(['"])([^'"\\r\\n]*)\\1|([^\\s;'"]+))[ \\t]*;`,
    "m",
  );
  const m = re.exec(html);
  return m ? (m[2] ?? m[3] ?? null) : null;
};

/** Valor de un atributo de una etiqueta, con comillas dobles, simples o sin ellas. */
export const atributo = (tag: string, nombre: string): string | null => {
  const m = new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
};

export const parseNotaCurso = (html: string, aulaEsperada: string): ParseResult<NotaCurso> => {
  // 1. El curso. Su ausencia mata también la página de inicio de sesión, que
  // este portal devuelve con HTTP 200.
  const courseCode = asignacionJs(html, "codCurso");
  if (!courseCode || !/^\d{4,6}$/.test(courseCode)) {
    return { ok: false, reason: "la respuesta no es la página de notas de un curso" };
  }
  // 2. La sección.
  const sectionCode = asignacionJs(html, "seccion");
  if (!sectionCode || !/^\d{1,4}$/.test(sectionCode)) {
    return { ok: false, reason: "la página no trae el código de sección" };
  }
  // 3. El marco de evaluaciones, por su name o su id, con la ruta exacta.
  const aulas = (html.match(/<iframe\b[^>]*>/gi) ?? [])
    .filter((tag) => atributo(tag, "name") === "ifrTareaAcad" || atributo(tag, "id") === "ifrTareaAcad")
    .map((tag) => MARCO.exec(atributo(tag, "src") ?? "")?.[1] ?? null)
    .filter((aula): aula is string => aula !== null);
  if (!aulas.length) return { ok: false, reason: "la página no trae el marco de evaluaciones" };
  if (!aulas.includes(aulaEsperada)) return { ok: false, reason: "la página no corresponde al aula que se pidió" };

  // 4. Los agregados. Uno que falta o no cumple se omite y no hace fallar al curso.
  const agregados: AgregadoUlima[] = [];
  for (const clave of CLAVES) {
    const crudo = asignacionJs(html, `nota${clave}`);
    if (crudo === null || !NOTA_AGREGADO.test(crudo)) continue;
    const valor = Number(crudo);
    if (valor > 20) continue;
    agregados.push({
      clave,
      etiqueta: clean(stripTags(asignacionJs(html, `nom${clave}`) ?? "")),
      valor: valor === 0 ? null : valor,
    });
  }
  return { ok: true, data: { courseCode, sectionCode, agregados } };
};
