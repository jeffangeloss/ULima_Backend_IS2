import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { EventBus } from "../../src/events/index.js";
import { AcademicProfileRepository } from "../../src/modules/academic-profile/academic-profile.repository.js";
import { AcademicProfileService } from "../../src/modules/academic-profile/academic-profile.service.js";

/**
 * BR-AP-08 (enmienda aprobada con `specialty-test.spec.md`): el reemplazo de
 * especialidades corre en una sola transacción.
 *
 * La base es de mentira pero transaccional: guarda `student_specialty` y el
 * flag de `student` en memoria, y `transaction(fn)` corre `fn` sobre una copia
 * que solo reemplaza al estado si `fn` termina bien, como un COMMIT; si lanza,
 * la copia se descarta, como un ROLLBACK. Una escritura hecha fuera de la
 * transacción iría directo al estado y la prueba la vería.
 *
 * Datos INVENTADOS: el alumno sintético 20230001 (`app_user.id` 1,
 * `student.id` 42), carrera 1, con Software (1) como principal y TI (5) como
 * interés antes del cambio.
 */

type Seleccion = { specialty_id: number; selection_type: "primary" | "interest"; is_active: boolean };
type Estado = { seleccion: Seleccion[]; setupCompleto: boolean };

const PERFIL = {
  id: 1, student_id: 42, code: "20230001", full_name: "Garcia Lopez, Maria",
  institutional_email: "20230001@aloe.ulima.edu.pe", current_level: 1, specialty_setup_completed: false,
  career_id: 1, career_code: "ING-SIS", career_name: "Ingeniería de Sistemas", faculty: "Ingeniería",
  curriculum_id: 1, curriculum_name: "2026-1",
};

const inicial = (): Estado => ({
  seleccion: [
    { specialty_id: 1, selection_type: "primary", is_active: true },
    { specialty_id: 5, selection_type: "interest", is_active: true },
  ],
  setupCompleto: false,
});

const copiar = (e: Estado): Estado => ({ seleccion: e.seleccion.map((s) => ({ ...s })), setupCompleto: e.setupCompleto });

const armar = (opciones: { fallaAlInsertar?: number; codigoDeFalla?: string } = {}) => {
  let estado = inicial();
  const fuera: string[] = [];
  let transacciones = 0;

  const ejecutarSobre = (e: Estado, enTransaccion: boolean) => async (q: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(q);
    const t = sql.toLowerCase().replace(/\s+/g, " ").trim();
    const escribe = t.startsWith("update") || t.startsWith("insert");
    if (escribe && !enTransaccion) fuera.push(t);

    if (t.includes("from app_user")) return [PERFIL];
    if (t.includes("from specialty")) return [{ "?column?": 1 }];
    if (t.startsWith("update student_specialty set is_active = false")) {
      for (const s of e.seleccion) s.is_active = false;
      return [];
    }
    if (t.startsWith("insert into student_specialty")) {
      const [, id, tipo] = params as [number, number, "primary" | "interest"];
      if (id === opciones.fallaAlInsertar) {
        throw Object.assign(new Error("fallo a mitad"), { code: opciones.codigoDeFalla ?? "XX000" });
      }
      const previa = e.seleccion.find((s) => s.specialty_id === id);
      if (previa) Object.assign(previa, { selection_type: tipo, is_active: true });
      else e.seleccion.push({ specialty_id: id, selection_type: tipo, is_active: true });
      return [];
    }
    if (t.startsWith("update student set specialty_setup_completed")) {
      e.setupCompleto = true;
      return [];
    }
    if (t.includes("from student_specialty")) {
      return e.seleccion.filter((s) => s.is_active).map((s) => ({ specialty_id: s.specialty_id, selection_type: s.selection_type }));
    }
    return [];
  };

  const database = {
    execute: (q: SQL) => ejecutarSobre(estado, false)(q),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transacciones++;
      const borrador = copiar(estado);
      const resultado = await fn({ execute: ejecutarSobre(borrador, true) });
      estado = borrador;
      return resultado;
    },
  };
  const repository = new AcademicProfileRepository(database as never);
  return {
    service: new AcademicProfileService(repository, new EventBus()),
    repository,
    estado: () => estado,
    fuera,
    transacciones: () => transacciones,
  };
};

describe("BR-AP-08: reemplazo atomico de especialidades", () => {
  test("un fallo a mitad del reemplazo deja intactas las especialidades previas", async () => {
    const { service, estado, fuera } = armar({ fallaAlInsertar: 7 });
    await expect(
      service.updateSpecialties(1, { primarySpecialtyId: 6, interestSpecialtyIds: [7] }),
    ).rejects.toThrow("fallo a mitad");
    expect(estado()).toEqual(inicial());
    expect(fuera).toEqual([]);
  });

  test("el 23505 dentro de la transaccion sigue saliendo como 409 DUPLICATE_PRIMARY, sin cambios", async () => {
    const { service, estado } = armar({ fallaAlInsertar: 6, codigoDeFalla: "23505" });
    await expect(
      service.updateSpecialties(1, { primarySpecialtyId: 6, interestSpecialtyIds: [] }),
    ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_PRIMARY" });
    expect(estado()).toEqual(inicial());
  });

  test("sin fallos, todo el reemplazo entra en una sola transaccion", async () => {
    const { service, estado, fuera, transacciones } = armar();
    const r = await service.updateSpecialties(1, { primarySpecialtyId: 6, interestSpecialtyIds: [7, 1] });
    expect(transacciones()).toBe(1);
    expect(fuera).toEqual([]);
    expect(estado()).toEqual({
      seleccion: [
        { specialty_id: 1, selection_type: "interest", is_active: true },
        { specialty_id: 5, selection_type: "interest", is_active: false },
        { specialty_id: 6, selection_type: "primary", is_active: true },
        { specialty_id: 7, selection_type: "interest", is_active: true },
      ],
      setupCompleto: true,
    });
    expect(r).toEqual({
      message: "Specialties updated",
      setupComplete: true,
      specialties: [
        { specialtyId: 1, selectionType: "interest" },
        { specialtyId: 6, selectionType: "primary" },
        { specialtyId: 7, selectionType: "interest" },
      ],
    });
  });

  test("replaceStudentSpecialties corre las cuatro escrituras en orden sobre la transaccion", async () => {
    const sentencias: string[] = [];
    const tx = {
      execute: async (q: SQL) => {
        sentencias.push(new PgDialect().sqlToQuery(q).sql.toLowerCase().replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" "));
        return [];
      },
    };
    const database = {
      execute: async () => {
        throw new Error("escritura fuera de la transaccion");
      },
      transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    };
    await new AcademicProfileRepository(database as never).replaceStudentSpecialties(42, 6, [7]);
    expect(sentencias).toEqual([
      "update student_specialty set",
      "insert into student_specialty",
      "insert into student_specialty",
      "update student set",
    ]);
  });
});
