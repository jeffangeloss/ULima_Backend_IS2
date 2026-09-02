import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * El progreso se escribe en LOTE: una consulta para resolver todos los códigos
 * contra la malla y una sentencia para todas las filas. Antes eran dos viajes
 * por curso (~90 de los ~115 viajes secuenciales de la importación), todos
 * manteniendo abierta la misma transacción.
 *
 * Estas pruebas miran el SQL RENDERIZADO además del resultado, porque la clase
 * de defecto que importa acá la produce Postgres al ejecutar y no el código al
 * armar: fue exactamente así como se coló el `all(($1, $2))` que tumbó la
 * primera importación real.
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

describe("findCurriculumCourseIds", () => {
  test("resuelve N códigos en UNA sola consulta", async () => {
    const { tx, llamadas } = fakeTx([
      { code: "650033", id: 11 }, { code: "650035", id: 12 }, { code: "650067", id: 13 },
    ]);
    await repo.findCurriculumCourseIds(tx, 1, ["650033", "650035", "650067"]);
    expect(llamadas()).toBe(1);
  });

  test("devuelve el mapa código -> id, y omite lo que la malla no tiene", async () => {
    // Un curso del récord que no está en la malla simplemente no vuelve, que es
    // lo mismo que el `null` de la versión de a uno.
    const { tx } = fakeTx([{ code: "650033", id: 11 }]);
    const mapa = await repo.findCurriculumCourseIds(tx, 1, ["650033", "999999"]);
    expect(mapa.get("650033")).toBe(11);
    expect(mapa.has("999999")).toBe(false);
  });

  test("sin códigos no toca la base", async () => {
    const { tx, llamadas } = fakeTx([]);
    expect((await repo.findCurriculumCourseIds(tx, 1, [])).size).toBe(0);
    expect(llamadas()).toBe(0);
  });

  test("deduplica los códigos repetidos antes de consultar", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.findCurriculumCourseIds(tx, 1, ["650033", "650033", "650035"]);
    const payload = consultas()[0]!.params.find((p) => typeof p === "string" && p.startsWith("["));
    expect(JSON.parse(String(payload))).toEqual(["650033", "650035"]);
  });

  test("los códigos viajan como UN parámetro JSON, no concatenados en el SQL", async () => {
    // Con `string_to_array` un código con coma rompería en silencio, y el dato
    // viene del portal.
    const { tx, consultas } = fakeTx([]);
    await repo.findCurriculumCourseIds(tx, 1, ["650033", "650035"]);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("json_array_elements_text");
    expect(texto).not.toContain("650033");
    expect(params).toEqual([1, '["650033","650035"]']);
  });
});

describe("upsertProgressBatch", () => {
  const items = [
    { curriculumCourseId: 11, status: "approved" as const },
    { curriculumCourseId: 12, status: "in_progress" as const },
    { curriculumCourseId: 13, status: "failed" as const },
  ];

  test("escribe N filas en UNA sola sentencia", async () => {
    const { tx, llamadas } = fakeTx([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await repo.upsertProgressBatch(tx, 6, 1, items);
    expect(llamadas()).toBe(1);
  });

  test("conserva el conflict target y el do update de la version de a uno", async () => {
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.upsertProgressBatch(tx, 6, 1, items);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("on conflict (student_id, curriculum_course_id) do update set status = excluded.status");
  });

  test("lleva `distinct on`: dos filas con la misma clave rompen ON CONFLICT con 21000", async () => {
    // "ON CONFLICT DO UPDATE command cannot affect row a second time". De a uno
    // no podia pasar; en lote basta un curso repetido para tumbar la
    // importacion entera.
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.upsertProgressBatch(tx, 6, 1, items);
    expect(norm(consultas()[0]!.sql)).toContain("distinct on");
  });

  test("las filas viajan como UN parametro JSON: no crece el numero de parametros", async () => {
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.upsertProgressBatch(tx, 6, 1, items);
    const { params } = consultas()[0]!;
    expect(params).toHaveLength(3);                       // studentId, curriculumId, payload
    expect(JSON.parse(String(params[2]))).toEqual([
      { ccId: 11, status: "approved" },
      { ccId: 12, status: "in_progress" },
      { ccId: 13, status: "failed" },
    ]);
  });

  test("devuelve lo que la base dice haber escrito, no lo que se intento", async () => {
    const { tx } = fakeTx([{ id: 1 }, { id: 2 }]);
    expect(await repo.upsertProgressBatch(tx, 6, 1, items)).toBe(2);
  });

  test("sin filas no toca la base", async () => {
    const { tx, llamadas } = fakeTx([]);
    expect(await repo.upsertProgressBatch(tx, 6, 1, [])).toBe(0);
    expect(llamadas()).toBe(0);
  });
});
