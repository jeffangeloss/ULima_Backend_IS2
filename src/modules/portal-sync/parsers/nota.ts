import { cellsOf, clean, normalizeLabel, stripTags, trsOf, type ParseResult } from "./html.js";
import type { AgregadoUlima, EvaluacionUlima, NotaCurso } from "../portal-sync.types.js";

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

const CABECERA = ["DETALLE EVALUACIONES", "SEMANA", "PESO", "NOTA"];
const ID_FILA = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const SEMANA = /^\d{1,2}$/;
const PESO = /^\d{1,3}([.,]\d{1,2})?$/;
const NOTA = /^\d{1,2}([.,]\d{1,2})?$/;
const TOLERANCIA_SUMA = 0.5;

const decimal = (s: string): number => Number(s.replace(",", "."));
const fallaTabla = (reason: string): ParseResult<EvaluacionUlima[]> => ({ ok: false, reason });

type Fila = { id: string; padre: string | null; celdas: string[] };

type LecturaNota =
  | { ok: true; mark: EvaluacionUlima["mark"]; value: number | null }
  | { ok: false; reason: string };

/** Punto 4. Vacía es `pending`, NP es `np` y un número de 0 a 20 es `graded`. */
const leerNota = (celda: string): LecturaNota => {
  if (!celda) return { ok: true, mark: "pending", value: null };
  if (/^np$/i.test(celda)) return { ok: true, mark: "np", value: null };
  // Todavía no hay ninguna muestra con nota publicada (V2), así que cualquier
  // otro texto hace fallar al curso en vez de adivinar.
  if (!NOTA.test(celda)) return { ok: false, reason: "una nota tiene un formato desconocido" };
  const valor = decimal(celda);
  if (valor > 20) return { ok: false, reason: "una nota está fuera del rango de 0 a 20" };
  return { ok: true, mark: "graded", value: Math.round(valor * 100) / 100 };
};

/**
 * RS-BE-53 · marco «Detalle Evaluaciones». No trae ningún identificador, así
 * que solo lo ata a su curso el orden de las peticiones (Tarea 17).
 */
export const parseDetalleEvaluaciones = (html: string): ParseResult<EvaluacionUlima[]> => {
  const trs = trsOf(html);

  // 1. Puerta de cabecera. Rechaza también la página de inicio de sesión.
  const hayCabecera = trs
    .map(cellsOf)
    .some((c) => c.length === 6 && CABECERA.every((etiqueta, i) => normalizeLabel(c[i + 1]!) === etiqueta));
  if (!hayCabecera) return fallaTabla("la tabla de evaluaciones no tiene la cabecera esperada");

  // 2. Filas con data-tt-id, con comillas simples o dobles.
  const filas: Fila[] = [];
  const vistos = new Set<string>();
  for (const tr of trs) {
    const tag = /^<tr\b[^>]*>/i.exec(tr)?.[0] ?? "";
    const id = atributo(tag, "data-tt-id");
    if (id === null) continue;
    if (!ID_FILA.test(id)) return fallaTabla("una fila de evaluaciones tiene un identificador desconocido");
    if (vistos.has(id)) return fallaTabla("una fila de evaluaciones está repetida");
    vistos.add(id);
    const celdas = cellsOf(tr);
    if (celdas.length !== 6) return fallaTabla("una fila de evaluaciones no tiene seis celdas");
    filas.push({ id, padre: atributo(tag, "data-tt-parent-id"), celdas });
  }

  // 3. Grupos y hojas. No hay muestra de un tercer nivel.
  const grupos = new Map(filas.filter((f) => f.padre === null).map((f) => [f.id, f]));
  const hojas = filas.filter((f) => f.padre !== null);
  for (const h of hojas) {
    if (grupos.has(h.padre!)) continue;
    return fallaTabla(vistos.has(h.padre!)
      ? "la tabla tiene un nivel de evaluaciones que ULima++ todavía no lee"
      : "una evaluación no tiene su grupo");
  }
  if (!hojas.length) return fallaTabla("la tabla no trae evaluaciones");

  // 4 y 5. Celdas de cada hoja y nombre de su grupo. Las celdas 0 y 5 no se leen.
  const evaluaciones: EvaluacionUlima[] = [];
  for (const h of hojas) {
    const [, nombre, semana, peso, nota] = h.celdas;
    if (!nombre) return fallaTabla("una evaluación no tiene nombre");
    if (nombre.length > 150) return fallaTabla("el nombre de una evaluación es demasiado largo");
    let week: number | null = null;
    if (semana) {
      week = SEMANA.test(semana) ? Number(semana) : 0;
      if (week < 1 || week > 20) return fallaTabla("la semana de una evaluación no es válida");
    }
    const weight = PESO.test(peso!) ? decimal(peso!) : 0;
    if (weight <= 0 || weight > 100) return fallaTabla("el peso de una evaluación no es válido");
    const leida = leerNota(nota!);
    if (!leida.ok) return fallaTabla(leida.reason);
    const nombreGrupo = grupos.get(h.padre!)!.celdas[1]!;
    evaluaciones.push({
      key: h.id,
      group: nombreGrupo && nombreGrupo.length <= 60 ? nombreGrupo : null,
      name: nombre,
      week,
      weight,
      value: leida.value,
      mark: leida.mark,
    });
  }

  // 6. Pesos, en este orden.
  const suma = (xs: EvaluacionUlima[]) => xs.reduce((s, e) => s + e.weight, 0);
  const cerca = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA_SUMA;
  const porGrupo = new Map<string, EvaluacionUlima[]>();
  hojas.forEach((h, i) => porGrupo.set(h.padre!, [...(porGrupo.get(h.padre!) ?? []), evaluaciones[i]!]));
  if (cerca(suma(evaluaciones), 100)) {
    for (const [id, evs] of porGrupo) {
      const pesoGrupo = grupos.get(id)!.celdas[3]!;
      if (!pesoGrupo) continue;
      if (!PESO.test(pesoGrupo) || !cerca(decimal(pesoGrupo), suma(evs))) {
        return fallaTabla("el peso de un grupo no coincide con sus evaluaciones");
      }
    }
    return { ok: true, data: evaluaciones };
  }
  if ([...porGrupo.values()].every((evs) => cerca(suma(evs), 100))) {
    return fallaTabla("pesos por grupo, un formato que ULima++ todavía no lee");
  }
  return fallaTabla("los pesos de la ULima no suman 100");
};
