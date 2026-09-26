import type {
  EvaluacionEmparejada, EvaluacionSilabo, EvaluacionUlima, MatchRule,
} from "../portal-sync.types.js";

/**
 * RS-BE-54 · emparejamiento de las evaluaciones de la ULima con las del sílabo
 * de la oferta del curso. Función pura. El llamador le pasa solo las
 * candidatas de UNA matrícula, así que nunca cruza de curso.
 *
 * El peso es condición dura en las dos reglas, porque un peso distinto quiere
 * decir que la ponderación oficial ya no es la del sílabo cargado, y emparejar
 * haría mentir al promedio de la calculadora.
 */

const TOLERANCIA_PESO = 0.01;
const CORRIMIENTO_MAXIMO = 2;
const ORDINAL_ARABIGO = /\s+(?:n\s*[°º.]?\s*)?\d{1,2}$/;
const ORDINAL_ROMANO = /\s+(?:i|ii|iii|iv|v|vi)$/;

/** Minúsculas, sin tildes, espacios colapsados y sin un ordinal final. */
export const nombreBase = (nombre: string): string => {
  const s = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const sinArabigo = s.replace(ORDINAL_ARABIGO, "");
  return (sinArabigo !== s ? sinArabigo : s.replace(ORDINAL_ROMANO, "")).trim();
};

const mismoPeso = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCIA_PESO + 1e-9;

const calzaNombre = (base: string, c: EvaluacionSilabo): boolean =>
  nombreBase(c.name) === base || nombreBase(c.typeName) === base;

/** Por semana y, a igual semana, por posición original. */
const porSemana = (a: { semana: number; i: number }, b: { semana: number; i: number }): number =>
  a.semana - b.semana || a.i - b.i;

export const emparejarEvaluaciones = (
  ulima: EvaluacionUlima[], silabo: EvaluacionSilabo[],
): EvaluacionEmparejada[] => {
  const out: EvaluacionEmparejada[] = ulima.map((e) => ({ ...e, assessmentId: null, match: "none" }));
  const usadas = new Set<number>();
  const bases = ulima.map((e) => nombreBase(e.name));
  const emparejar = (i: number, j: number, match: MatchRule) => {
    usadas.add(j);
    out[i] = { ...ulima[i]!, assessmentId: silabo[j]!.assessmentId, match };
  };

  // R1, exacta. Misma semana y mismo peso. Con una sola candidata gana esa, y
  // con varias gana la única cuyo nombre base calce.
  ulima.forEach((e, i) => {
    if (e.week === null) return;
    const candidatas = silabo
      .map((c, j) => ({ c, j }))
      .filter(({ c, j }) => !usadas.has(j) && c.week === e.week && mismoPeso(c.weight, e.weight));
    if (candidatas.length === 1) {
      const { c, j } = candidatas[0]!;
      emparejar(i, j, calzaNombre(bases[i]!, c) ? "exact" : "exact_other_name");
      return;
    }
    const porNombre = candidatas.filter(({ c }) => calzaNombre(bases[i]!, c));
    if (porNombre.length === 1) emparejar(i, porNombre[0]!.j, "exact");
  });

  // R2, semana corrida. Lo que sobra, agrupado por nombre base y peso, se
  // ordena por semana en los dos lados, y la k-ésima se empareja con la
  // k-ésima si las semanas difieren en 2 o menos. El ordinal cuenta dentro del
  // mismo nombre, no por posición en la lista.
  const grupos = new Map<string, number[]>();
  ulima.forEach((e, i) => {
    if (out[i]!.match !== "none" || e.week === null) return;
    const clave = `${bases[i]}|${Math.round(e.weight * 100)}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), i]);
  });
  for (const indices of grupos.values()) {
    const base = bases[indices[0]!]!;
    const peso = ulima[indices[0]!]!.weight;
    const nuestras = indices.map((i) => ({ semana: ulima[i]!.week!, i })).sort(porSemana);
    const suyas = silabo
      .map((c, j) => ({ c, j }))
      .filter(({ c, j }) => !usadas.has(j) && mismoPeso(c.weight, peso) && calzaNombre(base, c))
      .map(({ c, j }) => ({ semana: c.week, i: j }))
      .sort(porSemana);
    for (let k = 0; k < Math.min(nuestras.length, suyas.length); k++) {
      if (Math.abs(nuestras[k]!.semana - suyas[k]!.semana) > CORRIMIENTO_MAXIMO) continue;
      emparejar(nuestras[k]!.i, suyas[k]!.i, "week_shift");
    }
  }

  // R3. Lo que queda ya está con assessmentId null y match none.
  return out;
};

/**
 * RS-BE-54, guarda del curso. Con el sílabo vacío o con la mitad o más de las
 * evaluaciones sin pareja, el servicio avisa SYLLABUS_MISMATCH y guarda igual.
 */
export const silaboNoCoincide = (emparejadas: EvaluacionEmparejada[], silabo: EvaluacionSilabo[]): boolean =>
  silabo.length === 0 || emparejadas.filter((e) => e.match === "none").length * 2 >= emparejadas.length;
