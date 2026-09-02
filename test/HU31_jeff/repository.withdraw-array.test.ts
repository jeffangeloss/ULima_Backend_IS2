import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * Regresión de la primera importación REAL contra el portal (2026-09-02).
 *
 * `withdrawMissingEnrollments` interpolaba el arreglo de JS directamente:
 * `<> all(${keep})`. La plantilla `sql` de Drizzle NO liga un arreglo como
 * arreglo de Postgres: lo expande como lista de valores entre paréntesis, o sea
 * un constructor de fila. La consulta salía `all(($1, $2, $3, $4, $5))` y
 * Postgres la rechazaba con 42809 ("op ANY/ALL (array) requires array on right
 * side"), tumbando la importación entera con un 500.
 *
 * Ninguna prueba con dobles podía verlo: el fallo lo produce el motor al
 * ejecutar, no el código al armar. Por eso estas pruebas se hacen sobre el SQL
 * RENDERIZADO, que es lo más cerca de Postgres que se puede llegar sin base.
 */
/**
 * `tx` de mentira que además distingue la consulta de conteo: la función hace
 * tres consultas distintas (candidatos, conteo de activas, update) y devolverle
 * lo mismo a las tres haría que `countActiveEnrollments` leyera `n` undefined,
 * viera cero activas y cortara por la guarda anti-bloqueo antes del UPDATE.
 */
const fakeTx = (rows: unknown[], activas = 0) => {
  const capturadas: SQL[] = [];
  return {
    tx: {
      execute: async (q: SQL) => {
        capturadas.push(q);
        return new PgDialect().sqlToQuery(q).sql.includes("count(*)") ? [{ n: activas }] : rows;
      },
    } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
  };
};

const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

describe("withdrawMissingEnrollments: arreglos en SQL", () => {
  test("el `all(...)` recibe un arreglo de verdad, no un constructor de fila", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.withdrawMissingEnrollments(tx, 6, 2, [294, 295, 296, 297, 298]);
    const q = norm(consultas()[0]!.sql);

    // Lo que fallaba: all( seguido de un paréntesis con la lista de $n.
    expect(q).not.toMatch(/all\(\s*\(\s*\$\d/);
    // Lo que debe haber: una conversión explícita a arreglo de enteros.
    expect(q).toContain("::int[]");
  });

  test("manda UN solo parámetro con los ids, no uno por id: sigue parametrizada", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.withdrawMissingEnrollments(tx, 6, 2, [294, 295, 296, 297, 298]);
    const { params } = consultas()[0]!;

    // studentId, periodId y UN parámetro de texto con los ids.
    expect(params).toEqual([6, 2, "294,295,296,297,298"]);
    // Nada de ids concatenados dentro del SQL.
    expect(consultas()[0]!.sql).not.toContain("294");
  });

  test("con UN solo curso tampoco degenera en escalar", async () => {
    // `all(($1))` era igual de inválido que con cinco: el error no dependía de
    // la cantidad. Un alumno con un solo curso fallaba idéntico.
    const { tx, consultas } = fakeTx([]);
    await repo.withdrawMissingEnrollments(tx, 6, 2, [294]);
    const q = norm(consultas()[0]!.sql);
    expect(q).not.toMatch(/all\(\s*\(\s*\$\d/);
    expect(q).toContain("::int[]");
    expect(consultas()[0]!.params).toEqual([6, 2, "294"]);
  });

  test("sin secciones que conservar usa el centinela -1, también como arreglo", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.withdrawMissingEnrollments(tx, 6, 2, []);
    expect(consultas()[0]!.params).toEqual([6, 2, "-1"]);
    expect(norm(consultas()[0]!.sql)).toContain("::int[]");
  });

  test("el UPDATE que retira usa el mismo arreglo bien formado", async () => {
    // Segunda instancia del mismo bug, en la misma función: `id = any(${ids})`.
    // Nunca llegó a ejecutarse en producción porque el SELECT de arriba moría
    // antes, pero habría fallado igual.
    // 2 candidatos a retirar sobre 9 activas: quedan 7, así que la guarda
    // anti-bloqueo no se dispara y el UPDATE sí se emite.
    const { tx, consultas } = fakeTx([{ id: 11 }, { id: 12 }], 9);
    expect(await repo.withdrawMissingEnrollments(tx, 6, 2, [294])).toBe(2);
    const update = consultas().find((c) => norm(c.sql).includes("update enrollment"));
    expect(update).toBeDefined();
    expect(norm(update!.sql)).not.toMatch(/any\(\s*\(\s*\$\d/);
    expect(norm(update!.sql)).toContain("::int[]");
  });
});
