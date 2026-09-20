import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * RS-BE-23: la limpieza borra de `student_course_progress` los electivos
 * APROBADOS que ninguna fila del record respalda.
 *
 * Es la unica escritura de esta funcionalidad que BORRA datos propios del
 * alumno, asi que las pruebas miran el SQL renderizado: lo que importa no es
 * solo lo que la sentencia hace, sino todo lo que NO puede llegar a tocar.
 *
 * Datos inventados: alumno sintetico 20230001 (studentId interno 77), malla 1,
 * curriculum_course 5 y 6 como respaldo.
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

describe("deleteUnbackedElectives", () => {
  test("con el respaldo vacio devuelve 0 SIN consultar nada", async () => {
    // `intArray([])` rinde `string_to_array('', ',')::int[]`, que es '{}', y
    // `<> all('{}')` es verdadero para TODA fila: la consulta borraria todos
    // los electivos aprobados del alumno. La guarda corta antes.
    const { tx, llamadas } = fakeTx([{ id: 31 }]);
    expect(await repo.deleteUnbackedElectives(tx, 77, 1, [])).toBe(0);
    expect(llamadas()).toBe(0);
  });

  test("borra en UNA sentencia y devuelve lo que la base dice haber borrado", async () => {
    // Tres filas borradas con dos ids de respaldo: el numero sale del
    // `returning`, no del largo de `backingIds`.
    const { tx, consultas, llamadas } = fakeTx([{ id: 31 }, { id: 32 }, { id: 33 }]);
    expect(await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6])).toBe(3);
    expect(llamadas()).toBe(1);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("delete from student_course_progress scp using curriculum_course cc");
    expect(q).toContain("returning scp.id");
  });

  test("solo electivos aprobados, del alumno y de su malla", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("scp.curriculum_course_id = cc.id");
    expect(q).toContain("scp.student_id = $1");
    expect(q).toContain("scp.curriculum_id = $2");
    expect(q).toContain("cc.category = 'elective'");
    expect(q).toContain("scp.status = 'approved'");
    expect(q).toContain("scp.curriculum_course_id <> all(");
  });

  test("nunca toca otros estados, otras categorias ni la simulacion", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const q = norm(consultas()[0]!.sql);
    for (const prohibido of [
      "in_progress", "failed", "withdrawn",
      "general_studies", "common", "faculty",
      "student_curriculum_simulation",
    ]) {
      expect(q).not.toContain(prohibido);
    }
  });

  test("los ids del respaldo viajan en UN solo parametro de texto", async () => {
    // Mismo defecto de 42809 que tumbo la primera importacion real: un arreglo
    // de JS interpolado se vuelve `all(($3, $4))`, un constructor de fila.
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const { sql: texto, params } = consultas()[0]!;
    expect(params).toEqual([77, 1, "5,6"]);
    expect(norm(texto)).not.toMatch(/all\(\s*\(\s*\$\d/);
    expect(norm(texto)).toContain("::int[]");
  });
});
