import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { AuthRepository } from "../../src/modules/auth/auth.repository.js";

/**
 * ============================================================================
 * El progreso que HU31 importa tiene que LLEGAR a la malla.
 * Fuente: src/modules/auth/auth.repository.ts buildUser()
 * ============================================================================
 *
 * `portal-sync` escribe `student_course_progress` curso por curso (aprobado /
 * desaprobado / en curso) y esa tabla es el ÚNICO registro real de qué aprobó
 * el alumno. Pero durante meses `buildUser` la ignoró y fabricó el progreso a
 * partir de un solo número, `student.current_level`:
 *
 *     approvedLevels: [1 .. current_level - 1]
 *     approvedElectives: []            // literal vacío
 *
 * El frontend (lib/domain/malla/malla_logic.dart, approvedCourseIdsForProgress)
 * marca aprobado todo obligatorio cuyo nivel esté en `approvedLevels`, más lo
 * que venga en la lista de ids. Con la lista siempre vacía, el resultado era
 * que **un curso se veía aprobado solo si su ciclo era MENOR al ciclo del
 * alumno**, sin importar su nota real. Eso rompía dos cosas a la vez:
 *
 *   - Ciclo >= current_level: 20233903 (ciclo 8) aprobó AUDITORÍA Y CONTROL DE
 *     SISTEMAS, que es ciclo 8, y la malla se lo mostraba pendiente. Igual
 *     20235218 (ciclo 9) con GESTIÓN DE PROYECTOS, ciclo 9.
 *   - Electivos: NINGÚN electivo aprobado aparecía nunca, porque la única
 *     puerta para un electivo era esa lista vacía.
 *
 * El nivel del alumno no es una cota de lo que aprobó. El plan de estudios
 * 2026-1 pide requisitos POR CURSO, no por ciclo: AUDITORÍA (ciclo 8) solo
 * exige GESTIÓN FINANCIERA (ciclo 6), y GESTIÓN DE PROYECTOS (ciclo 9) solo
 * exige AUDITORÍA. Adelantarse de ciclo es normal y la malla debe reflejarlo.
 *
 * Por qué el nivel NO se elimina, solo deja de ser techo: la tabla está
 * incompleta en los ciclos bajos. De los obligatorios de 20233903 los ciclos
 * 1..5 tienen 0/6, 2/6, 0/6, 2/6 y 3/6 filas aprobadas, porque su récord trae
 * esos cursos con códigos que no calzan con la malla (convalidaciones, códigos
 * antiguos: el warning PROGRESS_SKIPPED de la importación). Quien está en ciclo
 * 8 aprobó el ciclo 1 aunque no haya fila que lo diga. Por eso los niveles
 * cumplidos siguen siendo un PISO para lo que no se pudo emparejar, y el
 * progreso real se SUMA encima. Es el mismo recorte que ya hace
 * `levelFromCoverage` en portal-sync.repository.ts y por la misma razón.
 */

/** Fila de `student_course_progress` tal como la devuelve la consulta nueva. */
type FilaProgreso = { curriculum_course_id: number };

/**
 * Base falsa que responde según QUÉ consulta le llega, no según el orden: las
 * de `buildUser` salen de un `Promise.all` y encadenar respuestas por posición
 * haría que el test pasara o fallara según quién gane la carrera.
 */
const fakeDb = (opts: { currentLevel: number | null; aprobados: FilaProgreso[] }) => {
  const capturadas: SQL[] = [];
  const database = {
    execute: async (q: SQL) => {
      capturadas.push(q);
      const sqlText = new PgDialect().sqlToQuery(q).sql.toLowerCase();

      if (sqlText.includes("student_course_progress")) return opts.aprobados;
      if (sqlText.includes("student_specialty")) return [];
      if (sqlText.includes("from enrollment")) return [];
      if (sqlText.includes("academic_period")) return [{ code: "2026-2" }];

      // La de findById: el alumno.
      return [{
        id: 7,
        code: "20233903",
        full_name: "GARAY SALINAS GABRIELA NICOLE",
        institutional_email: "20233903@aloe.ulima.edu.pe",
        token_version: 1,
        student_id: 8,
        career_id: 1,
        curriculum_id: 1,
        current_level: opts.currentLevel,
        specialty_setup_completed: true,
      }];
    },
  } as never;

  return {
    repo: new AuthRepository(database),
    sqlDeProgreso: () => capturadas
      .map((q) => new PgDialect().sqlToQuery(q))
      .find((q) => q.sql.toLowerCase().includes("student_course_progress")),
  };
};

describe("buildUser: el progreso real de la malla sale de student_course_progress", () => {
  test("CASO REPORTADO (20233903, ciclo 8): AUDITORÍA es ciclo 8 y aprobada; tiene que llegar al cliente", async () => {
    // 33 = curriculum_course de AUDITORÍA Y CONTROL DE SISTEMAS (ciclo 8).
    // Antes del arreglo approvedLevels era [1..7] y la lista de ids venía
    // vacía, así que el 33 no viajaba por ningún lado y la malla lo pintaba
    // pendiente pese a estar aprobado en la base.
    const { repo } = fakeDb({ currentLevel: 8, aprobados: [{ curriculum_course_id: 33 }] });

    const user = await repo.findById(7, "student");

    expect(user?.courseProgress.approvedCourseIds).toContain("33");
  });

  test("CASO REPORTADO (20235218, ciclo 9): GESTIÓN DE PROYECTOS es ciclo 9 y aprobada", async () => {
    // 90 = curriculum_course de GESTIÓN DE PROYECTOS (ciclo 9).
    const { repo } = fakeDb({ currentLevel: 9, aprobados: [{ curriculum_course_id: 90 }] });

    const user = await repo.findById(7, "student");

    expect(user?.courseProgress.approvedCourseIds).toContain("90");
  });

  test("un electivo aprobado ya no es invisible", async () => {
    // Con `approvedElectives: []` hardcodeado, los 4 electivos aprobados de
    // 20233903 y los 8 de 20235218 no se veían NUNCA, en ningún ciclo.
    const { repo } = fakeDb({ currentLevel: 8, aprobados: [{ curriculum_course_id: 41 }] });

    const user = await repo.findById(7, "student");

    expect(user?.courseProgress.approvedCourseIds).toContain("41");
  });

  test("los niveles cumplidos siguen viajando como PISO, no se reemplazan", async () => {
    // Sin este piso, los ~23 obligatorios de ciclos bajos que el récord trae
    // con códigos no emparejables (convalidaciones) pasarían a figurar
    // pendientes y bloquearían la malla entera por prerrequisitos.
    const { repo } = fakeDb({ currentLevel: 8, aprobados: [{ curriculum_course_id: 33 }] });

    const user = await repo.findById(7, "student");

    expect(user?.courseProgress.approvedLevels).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("los clientes ya instalados reciben los ids por el campo antiguo", async () => {
    // `approvedElectives` es el único campo de ids que lee el Flutter ya
    // publicado (malla_logic.dart hace `approved.addAll(progress.approvedElectives)`).
    // Mandar ahí TODOS los ids aprobados arregla la malla sin obligar a
    // reinstalar la app. Ver el comentario de compatibilidad en buildUser.
    const { repo } = fakeDb({ currentLevel: 8, aprobados: [{ curriculum_course_id: 33 }] });

    const user = await repo.findById(7, "student");

    expect(user?.courseProgress.approvedElectives).toContain("33");
  });

  test("un alumno sin ninguna fila de progreso no se rompe: listas vacías", async () => {
    // 194 de los 201 alumnos con nivel todavía no han importado su récord.
    // Para ellos el piso por nivel es TODO lo que hay, y las listas de ids
    // tienen que salir vacías en vez de undefined.
    const { repo } = fakeDb({ currentLevel: 8, aprobados: [] });

    const user = await repo.findById(7, "student");

    expect(user?.courseProgress.approvedCourseIds).toEqual([]);
    expect(user?.courseProgress.approvedElectives).toEqual([]);
    expect(user?.courseProgress.approvedLevels).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("solo cuenta lo aprobado: 'in_progress' y 'failed' quedan fuera del SQL", async () => {
    // Un curso que se está llevando o que se desaprobó NO es progreso
    // cumplido; si entrara, la malla desbloquearía cursos por un requisito
    // que el alumno todavía no cumple.
    const { repo, sqlDeProgreso } = fakeDb({ currentLevel: 8, aprobados: [] });

    await repo.findById(7, "student");

    expect(sqlDeProgreso()?.sql.toLowerCase()).toContain("status = 'approved'");
  });

  test("sin nivel guardado el piso es vacío, pero el progreso real igual llega", async () => {
    const { repo } = fakeDb({ currentLevel: null, aprobados: [{ curriculum_course_id: 33 }] });

    const user = await repo.findById(7, "student");

    expect(user?.courseProgress.approvedLevels).toEqual([]);
    expect(user?.courseProgress.approvedCourseIds).toContain("33");
  });
});
