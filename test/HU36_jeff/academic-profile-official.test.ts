import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { EventBus } from "../../src/events/index.js";
import { AcademicProfileRepository } from "../../src/modules/academic-profile/academic-profile.repository.js";
import { AcademicProfileService } from "../../src/modules/academic-profile/academic-profile.service.js";

/**
 * BR-AP-07 (enmienda aprobada con `specialty-test.spec.md`): solo se muestran
 * y se eligen las especialidades con `is_active = true`.
 *
 * El repositorio y el service son los reales; la base es una tabla `specialty`
 * de mentira que interpreta el `and is_active = true` del SQL, así que la
 * prueba mide el efecto de la cláusula y no solo su texto. No toca los datos:
 * el filtro no hace UPDATE de `is_active` (decisión 6).
 *
 * Datos INVENTADOS: el alumno sintético 20230001 (`app_user.id` 1,
 * `student.id` 42) es de la carrera 1. «Ciencia de Datos» es una especialidad
 * antigua, inactiva.
 */

type Fila = { id: number; career_id: number; name: string; description: string | null; is_active: boolean };

const ESPECIALIDADES: Fila[] = [
  { id: 1, career_id: 1, name: "Ingeniería de Software", description: null, is_active: true },
  { id: 2, career_id: 1, name: "Ciencia de Datos", description: null, is_active: false },
  { id: 5, career_id: 1, name: "Tecnologías de la Información", description: null, is_active: true },
  { id: 9, career_id: 2, name: "Otra carrera", description: null, is_active: true },
];

const PERFIL = {
  id: 1, student_id: 42, code: "20230001", full_name: "Garcia Lopez, Maria",
  institutional_email: "20230001@aloe.ulima.edu.pe", current_level: 1, specialty_setup_completed: false,
  career_id: 1, career_code: "ING-SIS", career_name: "Ingeniería de Sistemas", faculty: "Ingeniería",
  curriculum_id: 1, curriculum_name: "2026-1",
};

const armar = () => {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const ejecutar = async (q: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(q);
    consultas.push({ sql, params });
    const t = sql.toLowerCase().replace(/\s+/g, " ").trim();
    const soloActivas = t.includes("and is_active = true");
    const filtrar = (f: (e: Fila) => boolean) =>
      ESPECIALIDADES.filter((e) => f(e) && (!soloActivas || e.is_active));

    if (t.includes("from app_user")) return [PERFIL];
    if (t.startsWith("select career_id from student")) return [{ career_id: 1 }];
    if (t.includes("from specialty where career_id = $1")) {
      return filtrar((e) => e.career_id === params[0]).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (t.includes("from specialty where id = $1 and career_id = $2")) {
      return filtrar((e) => e.id === params[0] && e.career_id === params[1]).map(() => ({ "?column?": 1 }));
    }
    if (t.includes("from specialty where id = $1")) {
      return filtrar((e) => e.id === params[0]).map(() => ({ "?column?": 1 }));
    }
    return [];
  };
  const database = {
    execute: ejecutar,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
  };
  const repository = new AcademicProfileRepository(database as never);
  return { repository, service: new AcademicProfileService(repository, new EventBus()), consultas };
};

describe("BR-AP-07: listado de especialidades", () => {
  test("con careerId trae solo las activas, con display_order despues del filtro e is_active true", async () => {
    const { service, consultas } = armar();
    const { specialties } = await service.getSpecialties(1, 1);
    expect(specialties.map((s) => [s.id, s.name, s.is_active, s.display_order])).toEqual([
      [1, "Ingeniería de Software", true, 1],
      [5, "Tecnologías de la Información", true, 2],
    ]);
    expect(consultas.at(-1)!.sql.toLowerCase().replace(/\s+/g, " ")).toContain(
      "where career_id = $1 and is_active = true order by name",
    );
  });

  test("sin careerId pasa por la carrera del alumno y trae las mismas", async () => {
    const { service } = armar();
    const { specialties } = await service.getSpecialties(1);
    expect(specialties.map((s) => s.id)).toEqual([1, 5]);
  });
});

describe("BR-AP-07: eleccion de especialidades", () => {
  test("specialtyBelongsToCareer exige is_active = true", async () => {
    const { repository, consultas } = armar();
    expect(await repository.specialtyBelongsToCareer(2, 1)).toBe(false);
    expect(await repository.specialtyBelongsToCareer(1, 1)).toBe(true);
    expect(consultas[0]!.sql.toLowerCase().replace(/\s+/g, " ")).toContain(
      "where id = $1 and career_id = $2 and is_active = true",
    );
  });

  test("elegir una inactiva como principal o de interes responde 404 SPECIALTY_NOT_FOUND", async () => {
    for (const cuerpo of [
      { primarySpecialtyId: 2, interestSpecialtyIds: [] },
      { primarySpecialtyId: 1, interestSpecialtyIds: [2] },
    ]) {
      const { service, consultas } = armar();
      await expect(service.updateSpecialties(1, cuerpo)).rejects.toMatchObject({
        statusCode: 404,
        code: "SPECIALTY_NOT_FOUND",
        message: "Especialidad no encontrada para la carrera del estudiante.",
      });
      expect(consultas.some((q) => q.sql.toLowerCase().includes("student_specialty"))).toBe(false);
    }
  });

  test("las activas de la carrera se siguen pudiendo elegir", async () => {
    const { service } = armar();
    await expect(service.updateSpecialties(1, { primarySpecialtyId: 1, interestSpecialtyIds: [5] })).resolves.toMatchObject({
      message: "Specialties updated",
    });
  });

  test("el filtro no escribe en specialty", async () => {
    const { service, consultas } = armar();
    await service.getSpecialties(1, 1);
    await service.updateSpecialties(1, { primarySpecialtyId: 1, interestSpecialtyIds: [] });
    expect(consultas.some((q) => /update\s+specialty\b/i.test(q.sql))).toBe(false);
  });
});
