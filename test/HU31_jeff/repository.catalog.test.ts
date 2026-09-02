import { describe, expect, test } from "bun:test";
import { teacherCodeFor } from "../../src/modules/portal-sync/portal-sync.repository.js";

describe("teacherCodeFor", () => {
  test("genera una clave natural estable y unica por docente", () => {
    expect(teacherCodeFor("PERCY DIEZ QUIÑONES PANDURO")).toBe("PORTAL:PERCY-DIEZ-QUINONES-PANDURO");
    expect(teacherCodeFor("  javier   more  sanchez ")).toBe("PORTAL:JAVIER-MORE-SANCHEZ");
  });

  test("el mismo nombre con distinto espaciado o acentos da la misma clave", () => {
    expect(teacherCodeFor("JOSÉ RAÚL DIAZ PARRA")).toBe(teacherCodeFor("JOSE  RAUL DIAZ PARRA"));
  });

  test("sin nombre devuelve el placeholder", () => {
    expect(teacherCodeFor("")).toBe("PORTAL:SIN-DOCENTE");
  });

  test("respeta el limite de 50 caracteres de teacher_code", () => {
    const largo = teacherCodeFor("MARIA DE LOS ANGELES FERNANDEZ DE LA TORRE Y QUISPE");
    expect(largo.length).toBeLessThanOrEqual(50);
    expect(largo.startsWith("PORTAL:")).toBe(true);
  });
});
