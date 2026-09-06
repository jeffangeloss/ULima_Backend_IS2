import { describe, expect, test } from "bun:test";
import {
  EQUIVALENCIAS,
  FUENTE,
  SIN_EQUIVALENCIA_CONOCIDA,
  consultarCursosVigentes,
  consultarLegadosVivos,
  planDeSiembra,
  problemasDeLaTabla,
} from "../../src/db/seed/equivalencias.logic.js";

/**
 * La tabla de equivalencias es DATO, no lógica, y por eso mismo un error acá es
 * silencioso: un código legado repetido o un destino mal tipeado no rompe nada,
 * solo deja de recuperar cursos. Estas pruebas cubren el dato y el plan de
 * siembra; el seed en sí (`equivalencias.ts`) solo hace la IO.
 */
describe("la tabla del PDF v3", () => {
  test("trae las 14 equivalencias de facultad que recupera ese documento", () => {
    expect(EQUIVALENCIAS).toHaveLength(14);
  });

  test("deja constancia de qué documento la respalda", () => {
    expect(FUENTE).toContain("tabla_de_equivalencia");
  });

  test("no repite ningún código legado", () => {
    // `uq_course_equivalence (curriculum_id, legacy_code)` lo rechazaría en la
    // BD, pero con `on conflict do nothing` el duplicado se perdería callado.
    const legados = EQUIVALENCIAS.map((e) => e.legacy);
    expect(new Set(legados).size).toBe(legados.length);
  });

  test("ninguna equivalencia apunta a sí misma", () => {
    expect(EQUIVALENCIAS.filter((e) => e.legacy === e.vigente)).toEqual([]);
  });

  test("NO incluye los 12 de Estudios Generales: ese documento no los cubre", () => {
    // El PDF v3 es 2025-1 ↔ 2025-0, de una generación anterior. Para estos hace
    // falta la tabla oficial 2026-1 ↔ 2025-1, que todavía no se tiene. La
    // prueba existe para que nadie los complete a ojo.
    const legados = new Set(EQUIVALENCIAS.map((e) => e.legacy));
    for (const code of SIN_EQUIVALENCIA_CONOCIDA) expect(legados.has(code)).toBe(false);
  });

  test("los 12 pendientes son los que el récord real dejó sin emparejar", () => {
    expect([...SIN_EQUIVALENCIA_CONOCIDA].sort()).toEqual(
      ["1472", "4380", "510001", "510002", "5686", "6382", "650001", "6505", "6506", "6510", "6512", "6513"],
    );
  });
});

describe("problemasDeLaTabla", () => {
  test("una tabla sana no reporta nada", () => {
    expect(problemasDeLaTabla(EQUIVALENCIAS)).toEqual([]);
  });

  test("denuncia un código legado repetido", () => {
    const problemas = problemasDeLaTabla([
      { legacy: "650003", vigente: "650055" },
      { legacy: "650003", vigente: "560042" },
    ]);
    expect(problemas.join(" ")).toContain("650003");
  });

  test("denuncia una equivalencia que apunta a sí misma", () => {
    expect(problemasDeLaTabla([{ legacy: "650003", vigente: "650003" }]).join(" "))
      .toContain("650003");
  });
});

describe("planDeSiembra", () => {
  const enLaMalla = new Map([["650055", 11], ["560042", 12]]);

  test("resuelve el código vigente contra la malla y no inventa el id", () => {
    const { aInsertar } = planDeSiembra(
      [{ legacy: "650003", vigente: "650055" }], enLaMalla,
    );
    expect(aInsertar).toEqual([{ legacy: "650003", vigente: "650055", curriculumCourseId: 11 }]);
  });

  test("aparta —no inserta— la equivalencia cuyo curso vigente no está en la malla", () => {
    // Insertar con un id inventado sería peor que no insertar: la FK compuesta
    // lo rechazaría, y si calzara de casualidad marcaría el curso equivocado.
    const { aInsertar, sinCursoVigente } = planDeSiembra(
      [{ legacy: "650003", vigente: "650055" }, { legacy: "1459", vigente: "999999" }],
      enLaMalla,
    );
    expect(aInsertar.map((x) => x.legacy)).toEqual(["650003"]);
    expect(sinCursoVigente).toEqual([{ legacy: "1459", vigente: "999999" }]);
  });

  test("con la malla vacía no propone insertar nada", () => {
    const { aInsertar, sinCursoVigente } = planDeSiembra(EQUIVALENCIAS, new Map());
    expect(aInsertar).toEqual([]);
    expect(sinCursoVigente).toHaveLength(14);
  });
});

/**
 * Regresión: el seed corre sobre `postgres.js`, NO sobre la plantilla `sql` de
 * Drizzle. Son dos drivers con reglas opuestas para un arreglo de JS:
 *
 *   - Drizzle expande el arreglo como constructor de fila → `any(($1,$2))` →
 *     Postgres lo rechaza con 42809. Por eso existe `intArray` y por eso
 *     `findCurriculumCourseIds` manda los códigos como un parámetro JSON.
 *   - postgres.js serializa el arreglo como arreglo de Postgres nativo, y
 *     `= any($1)` funciona. Pero si le das un STRING con un cast `::json`, lo
 *     vuelve a serializar: `json_typeof` sale `string` y Postgres falla con
 *     "cannot call json_array_elements_text on a scalar".
 *
 * Trasladar la solución de Drizzle a este seed rompió el dry-run contra la BD
 * real el 2026-09-06. Estas pruebas fijan que los códigos viajen como ARREGLO.
 */
describe("las consultas del seed hablan postgres.js, no Drizzle", () => {
  const sqlEspia = () => {
    const llamadas: Array<{ texto: string; valores: unknown[] }> = [];
    const tag = (trozos: TemplateStringsArray, ...valores: unknown[]) => {
      llamadas.push({ texto: trozos.join("?"), valores });
      return Promise.resolve([] as unknown[]);
    };
    return { tag, llamadas };
  };

  test("los códigos vigentes viajan como arreglo, no como JSON stringificado", async () => {
    const { tag, llamadas } = sqlEspia();
    await consultarCursosVigentes(tag, 1, ["650055", "560042"]);
    const codigos = llamadas[0]!.valores[1];
    expect(Array.isArray(codigos)).toBe(true);
    expect(codigos).toEqual(["650055", "560042"]);
  });

  test("los códigos legados viajan como arreglo, no como JSON stringificado", async () => {
    const { tag, llamadas } = sqlEspia();
    await consultarLegadosVivos(tag, 1, ["650003", "1459"]);
    expect(Array.isArray(llamadas[0]!.valores[1])).toBe(true);
  });

  test("ninguna de las dos castea a ::json", async () => {
    // El cast es justo lo que dispara la doble serialización de postgres.js.
    const { tag, llamadas } = sqlEspia();
    await consultarCursosVigentes(tag, 1, ["650055"]);
    await consultarLegadosVivos(tag, 1, ["650003"]);
    for (const l of llamadas) {
      expect(l.texto).toContain("= any(");
      expect(l.texto).not.toContain("::json");
    }
  });
});
