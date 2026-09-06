import { describe, expect, test } from "bun:test";
import { partirNombre } from "../../src/shared/utils/nombre-persona.js";

/**
 * Partir un nombre en apellidos y nombres.
 *
 * Los nombres se guardan como los da miUlima: APELLIDOS y después NOMBRES, con
 * la convención peruana de dos apellidos ("SANCHEZ PALACIOS JEFFERSON ANGELO").
 * De los 367 usuarios, 310 tienen exactamente cuatro palabras.
 *
 * Antes esto vivía COPIADO en siete archivos del backend, todos tomando el
 * ÚLTIMO token como apellido. Con ese criterio la tarjeta de contacto mostraba
 * "ANGELO, SANCHEZ PALACIOS JEFFERSON".
 */
describe("partirNombre", () => {
  test("el caso reportado: dos apellidos y dos nombres", () => {
    expect(partirNombre("SANCHEZ PALACIOS JEFFERSON ANGELO"))
      .toEqual({ lastName: "SANCHEZ PALACIOS", firstName: "JEFFERSON ANGELO" });
  });

  test("dos apellidos y un nombre", () => {
    expect(partirNombre("RUIZ DELGADO MELISSA"))
      .toEqual({ lastName: "RUIZ DELGADO", firstName: "MELISSA" });
  });

  test("dos apellidos y tres nombres", () => {
    expect(partirNombre("GARAY SALINAS GABRIELA NICOLE SOFIA"))
      .toEqual({ lastName: "GARAY SALINAS", firstName: "GABRIELA NICOLE SOFIA" });
  });

  test("con dos palabras se asume un apellido y un nombre", () => {
    expect(partirNombre("PEREZ JUAN")).toEqual({ lastName: "PEREZ", firstName: "JUAN" });
  });

  test("una sola palabra queda como nombre, sin inventar un apellido", () => {
    expect(partirNombre("CHER")).toEqual({ lastName: "", firstName: "CHER" });
  });

  test("vacío o solo espacios no revientan", () => {
    expect(partirNombre("")).toEqual({ lastName: "", firstName: "" });
    expect(partirNombre("   ")).toEqual({ lastName: "", firstName: "" });
    expect(partirNombre(null)).toEqual({ lastName: "", firstName: "" });
  });

  test("los espacios de más no producen palabras fantasma", () => {
    expect(partirNombre("  SANCHEZ   PALACIOS  JEFFERSON ANGELO "))
      .toEqual({ lastName: "SANCHEZ PALACIOS", firstName: "JEFFERSON ANGELO" });
  });

  test("conserva tildes y eñes: es para mostrar, no para comparar", () => {
    expect(partirNombre("MUÑOZ IBÁÑEZ SEBASTIÁN ANDRÉS"))
      .toEqual({ lastName: "MUÑOZ IBÁÑEZ", firstName: "SEBASTIÁN ANDRÉS" });
  });

  test("juntar las dos partes en orden devuelve el nombre original", () => {
    // Invariante que protege el pie del horario: mostrar `lastName firstName`
    // tiene que dar exactamente lo que está guardado.
    for (const n of ["SANCHEZ PALACIOS JEFFERSON ANGELO", "RUIZ DELGADO MELISSA", "PEREZ JUAN"]) {
      const { lastName, firstName } = partirNombre(n);
      expect(`${lastName} ${firstName}`.trim()).toBe(n);
    }
  });

  test("con coma, ella manda: no hay nada que adivinar", () => {
    // Es como vienen las filas de docentes sembradas y el horario oficial.
    expect(partirNombre("DIEZ QUIÑONES PANDURO, PERCY"))
      .toEqual({ lastName: "DIEZ QUIÑONES PANDURO", firstName: "PERCY" });
    expect(partirNombre("MACHUCA DE PINA, JUAN MANUEL"))
      .toEqual({ lastName: "MACHUCA DE PINA", firstName: "JUAN MANUEL" });
  });

  test("la coma gana incluso cuando el apellido tiene tres palabras", () => {
    // Sin la coma, la convención de dos apellidos cortaría en "DIEZ QUIÑONES".
    expect(partirNombre("DIEZ QUIÑONES PANDURO, PERCY").lastName).toBe("DIEZ QUIÑONES PANDURO");
    expect(partirNombre("DIEZ QUIÑONES PANDURO PERCY").lastName).toBe("DIEZ QUIÑONES");
  });

  test("el criterio viejo (último token = apellido) queda descartado explícitamente", () => {
    const { lastName } = partirNombre("SANCHEZ PALACIOS JEFFERSON ANGELO");
    expect(lastName).not.toBe("ANGELO");
  });
});
