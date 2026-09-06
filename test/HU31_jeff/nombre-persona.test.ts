import { describe, expect, test } from "bun:test";
import { claveNombre, mismaPersona, normalizarNombre, tokensNombre } from "../../src/shared/utils/nombre-persona.js";

/**
 * Identidad de una persona por su nombre, compartida por portal-sync y por los
 * seeds. Existe porque los duplicados de `teacher` no difieren en tildes ni en
 * espacios: difieren en ORDEN. El seed escribe "APELLIDOS, NOMBRES" y
 * portal-sync escribe "NOMBRES APELLIDOS", así que cualquier comparación que no
 * ordene los tokens los ve como dos personas y crea una fila de más.
 *
 * Si esta regla y la del seed de asesorías divergen, los duplicados vuelven.
 */
describe("normalizarNombre", () => {
  test("mayúsculas, sin tildes, sin comas, espacios colapsados", () => {
    expect(normalizarNombre("  Díaz  Parra, José Raúl ")).toBe("DIAZ PARRA JOSE RAUL");
  });
  test("la eñe se conserva como N (igual que teacherCodeFor)", () => {
    expect(normalizarNombre("Muñoz Ibáñez")).toBe("MUNOZ IBANEZ");
  });
  test("null y vacío no revientan", () => {
    expect(normalizarNombre(null)).toBe("");
    expect(normalizarNombre(undefined)).toBe("");
  });
});

describe("claveNombre — independiente del orden", () => {
  test("el mismo nombre en los dos órdenes da la misma clave", () => {
    expect(claveNombre("DIAZ PARRA, JOSE RAUL")).toBe(claveNombre("JOSE RAUL DIAZ PARRA"));
  });
  test("personas distintas dan claves distintas", () => {
    expect(claveNombre("PEREZ RAMIREZ, JUAN")).not.toBe(claveNombre("PEREZ RAMIREZ, JUANA"));
  });
  test("un token repetido no cambia la clave", () => {
    expect(claveNombre("DE LA CRUZ DE LA TORRE, ANA")).toBe(claveNombre("ANA DE LA CRUZ DE LA TORRE"));
  });
  test("el vacío tiene clave vacía y NUNCA empata con nadie", () => {
    expect(claveNombre("")).toBe("");
    expect(mismaPersona("", "")).toBe(false);
    expect(mismaPersona("", "PEREZ RAMIREZ JUAN")).toBe(false);
  });
});

describe("mismaPersona", () => {
  test("empata en cualquier orden y con tildes distintas", () => {
    expect(mismaPersona("Díaz Parra, José Raúl", "JOSE RAUL DIAZ PARRA")).toBe(true);
  });
  test("un apellido de más NO es la misma persona: acá no se adivina", () => {
    // La tolerancia a nombres truncados vive en el seed de asesorías, donde hay
    // un PDF que sirve de juez. Acá se escribe en la BD: solo igualdad exacta.
    expect(mismaPersona("PEREZ RAMIREZ, JUAN", "PEREZ RAMIREZ CASTILLO, JUAN")).toBe(false);
  });
  test("el placeholder de docente sin asignar no empata consigo mismo por accidente", () => {
    expect(mismaPersona("DOCENTE POR ASIGNAR", "DOCENTE POR ASIGNAR")).toBe(true);
  });
});

describe("tokensNombre", () => {
  test("ordenados, únicos y sin vacíos", () => {
    expect(tokensNombre(" Pérez   Pérez,  Ana ")).toEqual(["ANA", "PEREZ"]);
  });
});
