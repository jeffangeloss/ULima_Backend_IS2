import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { SpecialtyTestRepository } from "../../src/modules/specialty-test/specialty-test.repository.js";
import type { StoredRankingEntry } from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-38, RS-BE-44 y RS-BE-45 vistos desde el repositorio.
 *
 * Miran el SQL RENDERIZADO además del resultado, como
 * `test/HU35_jeff/time-blocks.repository.test.ts`: la clase de defecto que
 * importa aquí la produce Postgres al ejecutar (un arreglo JS interpolado que
 * da 42809, un `where student_id` que se cae, un `do update` que no refresca la
 * fecha) y no el código al armar. No abren ninguna conexión: la base es falsa.
 * La prueba contra un Postgres real es `specialty-test.postgres.test.ts`.
 *
 * Datos INVENTADOS: el alumno sintético 20230001 tiene `student.id` 42.
 */

const baseFalsa = (filas: unknown[]) => {
  const capturadas: SQL[] = [];
  const database = {
    execute: async (q: SQL) => {
      capturadas.push(q);
      return filas;
    },
  } as never;
  return {
    repo: new SpecialtyTestRepository(database),
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
  };
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const ALUMNO = 42;

const RANKING: StoredRankingEntry[] = [
  { key: "vj", specialtyId: 7, affinity: 75 },
  { key: "si", specialtyId: 6, affinity: 65 },
  { key: "ti", specialtyId: 5, affinity: 28 },
  { key: "sw", specialtyId: 1, affinity: 24 },
];

const FECHA = "2026-09-25T20:15:00.000Z";

describe("findStudentCareer", () => {
  test("lee la carrera del alumno con su id como parametro", async () => {
    const { repo, consultas } = baseFalsa([{ career_id: 3 }]);
    expect(await repo.findStudentCareer(ALUMNO)).toEqual({ careerId: 3 });
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toBe("select career_id from student where id = $1 limit 1");
    expect(params).toEqual([ALUMNO]);
  });

  test("sin fila en student devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.findStudentCareer(ALUMNO)).toBeNull();
  });
});

describe("findActiveSpecialties", () => {
  test("solo las activas de la carrera, por id", async () => {
    const { repo, consultas } = baseFalsa([{ id: 1, name: "Ingeniería de Software" }]);
    expect(await repo.findActiveSpecialties(3)).toEqual([{ id: 1, name: "Ingeniería de Software" }]);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toBe(
      "select id, name from specialty where career_id = $1 and is_active = true order by id",
    );
    expect(params).toEqual([3]);
  });
});

describe("saveResult (RS-BE-44)", () => {
  test("upsert por student_id que reescribe todo y fija completed_at = now()", async () => {
    const { repo, consultas } = baseFalsa([{ completed_at: FECHA }]);
    expect(await repo.saveResult(ALUMNO, "2026-09-25.4", RANKING, false)).toEqual({ completedAt: FECHA });
    const { sql: texto, params } = consultas()[0]!;
    const t = norm(texto);
    expect(t).toContain(
      "insert into student_specialty_test_result (student_id, content_version, ranking, is_tie) values ($1, $2, $3::jsonb, $4)",
    );
    expect(t).toContain("on conflict (student_id) do update set");
    expect(t).toContain("content_version = excluded.content_version");
    expect(t).toContain("ranking = excluded.ranking");
    expect(t).toContain("is_tie = excluded.is_tie");
    expect(t).toContain("completed_at = now()");
    expect(t).toContain(
      `returning to_char(completed_at at time zone 'utc', 'yyyy-mm-dd"t"hh24:mi:ss.ms"z"') as completed_at`,
    );
    expect(params).toEqual([ALUMNO, "2026-09-25.4", JSON.stringify(RANKING), false]);
  });

  test("el ranking viaja como texto JSON y nunca como arreglo interpolado", async () => {
    const { repo, consultas } = baseFalsa([{ completed_at: FECHA }]);
    await repo.saveResult(ALUMNO, "2026-09-25.4", RANKING, true);
    for (const p of consultas()[0]!.params) expect(Array.isArray(p)).toBe(false);
  });

  test("un ranking con otra forma no llega a la base", async () => {
    const { repo, consultas } = baseFalsa([{ completed_at: FECHA }]);
    const malo = [...RANKING.slice(0, 3)];
    await expect(repo.saveResult(ALUMNO, "2026-09-25.4", malo, false)).rejects.toThrow();
    expect(consultas()).toHaveLength(0);
  });
});

describe("findResult (RS-BE-45)", () => {
  test("lee la fila del alumno con la fecha en ISO UTC", async () => {
    const { repo, consultas } = baseFalsa([
      { content_version: "2026-09-25.4", ranking: RANKING, is_tie: false, completed_at: FECHA },
    ]);
    expect(await repo.findResult(ALUMNO)).toEqual({
      contentVersion: "2026-09-25.4",
      ranking: RANKING,
      isTie: false,
      completedAt: FECHA,
    });
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("from student_specialty_test_result where student_id = $1 limit 1");
    expect(params).toEqual([ALUMNO]);
  });

  test("el ranking que llega como texto tambien se lee", async () => {
    const { repo } = baseFalsa([
      { content_version: "2026-09-25.4", ranking: JSON.stringify(RANKING), is_tie: true, completed_at: FECHA },
    ]);
    expect((await repo.findResult(ALUMNO))?.ranking).toEqual(RANKING);
  });

  test("sin fila devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.findResult(ALUMNO)).toBeNull();
  });

  test("un ranking corrupto es un error, no un resultado vacio", async () => {
    for (const corrupto of [
      [{ key: "xx", specialtyId: 1, affinity: 10 }],
      RANKING.map((e) => ({ ...e, affinity: 101 })),
      RANKING.map((e) => ({ ...e, key: "sw" })),
    ]) {
      const { repo } = baseFalsa([
        { content_version: "2026-09-25.4", ranking: corrupto, is_tie: false, completed_at: FECHA },
      ]);
      await expect(repo.findResult(ALUMNO)).rejects.toThrow("no tiene la forma esperada");
    }
  });
});
