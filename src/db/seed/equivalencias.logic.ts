// Datos y lógica pura del seed de `course_equivalence`. La IO vive en
// `equivalencias.ts`; acá no se toca la base, para que la tabla —que es el
// único lugar donde un error es silencioso— se pueda probar sola.

/** Un curso de la malla anterior y su equivalente en la vigente, por CÓDIGO. */
export interface Equivalencia {
  /** Código tal como lo publica el récord académico del portal. */
  legacy: string;
  /** Código del curso equivalente en la malla vigente (`course.code`). */
  vigente: string;
}

/**
 * Documento oficial que respalda estas equivalencias. Se guarda en
 * `course_equivalence.source`: sin la procedencia no hay forma de distinguir,
 * mirando una fila, una tabla oficial de una completada a ojo.
 */
export const FUENTE = "tabla_de_equivalencia_de_plan_de_estudios_v3";

/**
 * Las 14 equivalencias de facultad (ciclos 3-7) que da el PDF v3.
 *
 * OJO con el alcance: ese documento es **2025-1 ↔ 2025-0**, de una generación
 * anterior a la malla vigente (2026-1). Alcanza para los cursos de facultad,
 * que es lo que hay acá, y no para los de Estudios Generales —ver
 * `SIN_EQUIVALENCIA_CONOCIDA`.
 */
export const EQUIVALENCIAS: readonly Equivalencia[] = [
  { legacy: "650003", vigente: "650055" },
  { legacy: "1459", vigente: "560042" },
  { legacy: "650004", vigente: "650056" },
  { legacy: "1460", vigente: "560047" },
  { legacy: "560020", vigente: "560046" },
  { legacy: "650007", vigente: "650053" },
  { legacy: "650002", vigente: "650054" },
  { legacy: "5644", vigente: "560038" },
  { legacy: "5623", vigente: "560043" },
  { legacy: "650052", vigente: "650058" },
  { legacy: "650005", vigente: "650086" },
  { legacy: "650006", vigente: "650057" },
  { legacy: "1492", vigente: "650059" },
  { legacy: "1506", vigente: "560048" },
];

/**
 * Los 12 códigos que el récord real de 20235218 dejó sin emparejar y que el PDF
 * v3 NO puede resolver: son todos de Estudios Generales, y ese documento es de
 * una generación anterior.
 *
 * Falta la tabla oficial **2026-1 ↔ 2025-1**. Hasta que exista, estos cursos
 * siguen contando en el warning `PROGRESS_SKIPPED` de la importación, y el piso
 * por nivel de `approvedLevelsFor` sigue siendo su red de seguridad.
 *
 * Está acá, y con una prueba que verifica que NO estén en `EQUIVALENCIAS`, para
 * que el hueco sea explícito y nadie lo complete a ojo.
 */
export const SIN_EQUIVALENCIA_CONOCIDA: readonly string[] = [
  "6505", "510002", "510001", "6506", "6382", "6510",
  "5686", "650001", "6512", "6513", "1472", "4380",
];

/**
 * Revisa la tabla antes de escribir nada. Devuelve la lista de problemas; vacía
 * quiere decir que está sana.
 *
 * Un código legado repetido no rompería la importación: `on conflict do nothing`
 * se tragaría el segundo en silencio y ese curso simplemente no se recuperaría.
 */
export const problemasDeLaTabla = (eqs: readonly Equivalencia[]): string[] => {
  const problemas: string[] = [];
  const vistos = new Set<string>();
  for (const e of eqs) {
    if (vistos.has(e.legacy)) problemas.push(`código legado repetido: ${e.legacy}`);
    vistos.add(e.legacy);
    if (e.legacy === e.vigente) problemas.push(`equivalencia a sí misma: ${e.legacy}`);
  }
  return problemas;
};

export interface FilaASembrar extends Equivalencia { curriculumCourseId: number }

/**
 * Cruza la tabla contra la malla vigente. El id de `curriculum_course` NUNCA se
 * hardcodea: sale de la BD en el momento de sembrar, porque los ids son de la
 * instancia y no del documento.
 *
 * Lo que no cruza se APARTA, no se inserta. Insertar con un id inventado sería
 * peor que no insertar: la FK compuesta lo rechazaría, y si por casualidad
 * calzara, marcaría el curso equivocado como aprobado.
 */
export const planDeSiembra = (
  eqs: readonly Equivalencia[],
  curriculumCourseIdPorCodigo: ReadonlyMap<string, number>,
): { aInsertar: FilaASembrar[]; sinCursoVigente: Equivalencia[] } => {
  const aInsertar: FilaASembrar[] = [];
  const sinCursoVigente: Equivalencia[] = [];
  for (const e of eqs) {
    const curriculumCourseId = curriculumCourseIdPorCodigo.get(e.vigente);
    if (curriculumCourseId === undefined) sinCursoVigente.push(e);
    else aInsertar.push({ ...e, curriculumCourseId });
  }
  return { aInsertar, sinCursoVigente };
};

/**
 * Forma mínima de la etiqueta de plantilla de `postgres.js`. Las consultas del
 * seed la reciben como parámetro para poder probarlas sin base de datos.
 *
 * Devuelve `any` a propósito: el tipo `Sql` de postgres.js está sobrecargado
 * (además de la plantilla, `sql(valor)` devuelve un `Helper` cuyo `then` es
 * privado), y TypeScript resuelve esa otra firma al asignarlo a una de una sola
 * sobrecarga. Cada consulta declara su propia forma de retorno abajo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlTag = (trozos: TemplateStringsArray, ...valores: any[]) => any;

/**
 * OJO — este seed corre sobre `postgres.js`, NO sobre la plantilla `sql` de
 * Drizzle. Las dos tienen reglas OPUESTAS para un arreglo de JS:
 *
 *   - Drizzle lo expande como constructor de fila: `any(($1,$2))`, que Postgres
 *     rechaza con 42809. De ahí `intArray` y el truco del parámetro JSON en
 *     `portal-sync.repository.ts`.
 *   - postgres.js lo serializa como arreglo de Postgres nativo, y `= any($1)`
 *     funciona tal cual. Pero si le pasas un STRING con un cast `::json`, lo
 *     vuelve a serializar y llega un escalar: `json_typeof` da `string` y
 *     Postgres falla con "cannot call json_array_elements_text on a scalar".
 *
 * Trasladar acá la solución de Drizzle rompió el dry-run contra la BD real el
 * 2026-09-06. Los códigos van como ARREGLO y sin cast.
 */
export const consultarCursosVigentes = (
  sql: SqlTag, curriculumId: number, codigosVigentes: string[],
) => sql`
    select c.code, cc.id::int as curriculum_course_id
    from curriculum_course cc
    join course c on c.id = cc.course_id
    where cc.curriculum_id = ${curriculumId}
      and c.code = any(${codigosVigentes})
  ` as PromiseLike<Array<{ code: string; curriculum_course_id: number }>>;

/** Códigos "legados" que TODAVÍA viven en la malla vigente: el match directo de
 *  portal-sync ya los resuelve, así que su equivalencia sería letra muerta. */
export const consultarLegadosVivos = (
  sql: SqlTag, curriculumId: number, codigosLegados: string[],
) => sql`
    select c.code
    from curriculum_course cc
    join course c on c.id = cc.course_id
    where cc.curriculum_id = ${curriculumId}
      and c.code = any(${codigosLegados})
  ` as PromiseLike<Array<{ code: string }>>;
