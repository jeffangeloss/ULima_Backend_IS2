import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

const cap = (filas: unknown[] = []) => {
  const qs: SQL[] = [];
  const repo = new PortalSyncRepository({} as never);
  const tx = { execute: async (q: SQL) => { qs.push(q); return filas; } } as never;
  const sqlDe = (i = 0) => new PgDialect().sqlToQuery(qs[i]).sql.toLowerCase();
  return { repo, tx, qs, sqlDe };
};

describe("findSoleCareerAndCurriculum", () => {
  test("devuelve la unica carrera y malla", async () => {
    const { repo, tx } = cap([{ careerId: 1, curriculumId: 1, careerName: "Ingeniería de Sistemas" }]);
    expect(await repo.findSoleCareerAndCurriculum(tx)).toEqual({
      careerId: 1, curriculumId: 1, careerName: "Ingeniería de Sistemas",
    });
  });

  test("si no hay ninguna devuelve null, no revienta", async () => {
    const { repo, tx } = cap([]);
    expect(await repo.findSoleCareerAndCurriculum(tx)).toBeNull();
  });
});

describe("createStudentAccount", () => {
  const entrada = {
    code: "20230001", fullName: "Garcia Lopez, Maria",
    email: "20230001@aloe.ulima.edu.pe", passwordHash: "$2a$10$hash",
    careerId: 1, curriculumId: 1, careerName: "Ingeniería de Sistemas",
  };

  test("devuelve la MISMA forma que findStudent", async () => {
    const { repo, tx } = cap([{ id: 7, userId: 3 }]);
    const r = await repo.createStudentAccount(tx, entrada);
    expect(Object.keys(r).sort()).toEqual(
      ["careerId", "careerName", "currentLevel", "curriculumId", "id", "userId"],
    );
    expect(r.currentLevel).toBeNull();
  });

  test("inserta primero app_user y despues student", async () => {
    const { repo, tx, sqlDe } = cap([{ id: 7, userId: 3 }]);
    await repo.createStudentAccount(tx, entrada);
    expect(sqlDe(0)).toContain("insert into app_user");
    expect(sqlDe(1)).toContain("insert into student");
  });

  test("nunca escribe la contrasena en claro: solo el hash viaja", async () => {
    const { repo, tx, qs } = cap([{ id: 7, userId: 3 }]);
    await repo.createStudentAccount(tx, entrada);
    const params = qs.flatMap((q) => new PgDialect().sqlToQuery(q).params);
    expect(params).toContain("$2a$10$hash");
  });

  test("los valores viajan parametrizados, no concatenados", async () => {
    const { repo, tx, sqlDe } = cap([{ id: 7, userId: 3 }]);
    await repo.createStudentAccount(tx, entrada);
    expect(sqlDe(0)).not.toContain("20230001");
  });
});
