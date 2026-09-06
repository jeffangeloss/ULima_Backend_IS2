import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { courseEquivalence } from "../../src/db/schema/schema.js";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * Segundo intento de emparejamiento del récord contra la malla: los códigos
 * que el match directo por `course.code` no resuelve se buscan en
 * `course_equivalence`.
 *
 * Igual que `repository.progress-batch.test.ts`, estas pruebas miran el SQL
 * RENDERIZADO además del resultado: la clase de defecto que importa acá la
 * produce Postgres al ejecutar y no el código al armar (fue así como se coló
 * el `all(($1, $2))` que tumbó la primera importación real).
 */
const fakeTx = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  return {
    tx: { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
    llamadas: () => capturadas.length,
  };
};

const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const columnas = courseEquivalence as unknown as Record<string, { name: string; notNull: boolean }>;

describe("esquema de course_equivalence", () => {
  test("mapea a la tabla course_equivalence", () => {
    const meta = Object.getOwnPropertySymbols(courseEquivalence)
      .map((s) => (courseEquivalence as unknown as Record<symbol, unknown>)[s])
      .find((v) => typeof v === "string" && v === "course_equivalence");
    expect(meta).toBe("course_equivalence");
  });

  test("el código legado es varchar(30) y no admite null", () => {
    // 30 es el largo de `course.code`: el récord trae códigos de la misma
    // familia, solo que de la malla anterior.
    const col = courseEquivalence.legacyCode as unknown as
      { name: string; notNull: boolean; getSQLType(): string };
    expect(col.name).toBe("legacy_code");
    expect(col.notNull).toBe(true);
    expect(col.getSQLType()).toBe("varchar(30)");
  });

  test("apunta a una malla y a un curso de esa malla, ambos obligatorios", () => {
    expect(columnas.curriculumId.name).toBe("curriculum_id");
    expect(columnas.curriculumId.notNull).toBe(true);
    expect(columnas.curriculumCourseId.name).toBe("curriculum_course_id");
    expect(columnas.curriculumCourseId.notNull).toBe(true);
  });

  test("guarda de qué documento salió la equivalencia", () => {
    // Sin la procedencia no hay forma de saber, mirando la fila, si vino de una
    // tabla oficial o de alguien completando a ojo.
    expect(columnas.source.name).toBe("source");
    expect(columnas.source.notNull).toBe(true);
  });
});

describe("findEquivalentCurriculumCourseIds", () => {
  test("resuelve N códigos legados en UNA sola consulta", async () => {
    const { tx, llamadas } = fakeTx([
      { code: "650003", id: 11 }, { code: "1459", id: 12 }, { code: "5644", id: 13 },
    ]);
    await repo.findEquivalentCurriculumCourseIds(tx, 1, ["650003", "1459", "5644"]);
    expect(llamadas()).toBe(1);
  });

  test("devuelve el mapa código legado -> id de curriculum_course", async () => {
    const { tx } = fakeTx([{ code: "650003", id: 11 }]);
    const mapa = await repo.findEquivalentCurriculumCourseIds(tx, 1, ["650003"]);
    expect(mapa.get("650003")).toBe(11);
  });

  test("omite el código legado que todavía no tiene equivalencia", async () => {
    // Los 12 de Estudios Generales están en este caso hasta que llegue la
    // tabla 2026-1 ↔ 2025-1: no hay fila, y eso NO es un error.
    const { tx } = fakeTx([{ code: "650003", id: 11 }]);
    const mapa = await repo.findEquivalentCurriculumCourseIds(tx, 1, ["650003", "6505"]);
    expect(mapa.has("6505")).toBe(false);
  });

  test("sin códigos no toca la base", async () => {
    const { tx, llamadas } = fakeTx([]);
    expect((await repo.findEquivalentCurriculumCourseIds(tx, 1, [])).size).toBe(0);
    expect(llamadas()).toBe(0);
  });

  test("deduplica los códigos repetidos antes de consultar", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.findEquivalentCurriculumCourseIds(tx, 1, ["650003", "650003", "1459"]);
    const payload = consultas()[0]!.params.find((p) => typeof p === "string" && p.startsWith("["));
    expect(JSON.parse(String(payload))).toEqual(["650003", "1459"]);
  });

  test("los códigos viajan como UN parámetro JSON, no concatenados en el SQL", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.findEquivalentCurriculumCourseIds(tx, 1, ["650003", "1459"]);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("json_array_elements_text");
    expect(texto).not.toContain("650003");
    expect(params).toEqual([1, '["650003","1459"]']);
  });

  test("filtra por la malla del alumno: una equivalencia de otra malla no aplica", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.findEquivalentCurriculumCourseIds(tx, 7, ["650003"]);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("curriculum_id =");
    expect(params[0]).toBe(7);
  });
});
