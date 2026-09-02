import { describe, expect, test } from "bun:test";
import { teacherCodeFor, careerNamesDiffer} from "../../src/modules/portal-sync/portal-sync.repository.js";

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

describe("careerNamesDiffer", () => {
  // Caso real visto en el teléfono el 2026-09-02: el portal manda la carrera en
  // MAYÚSCULAS y ULima++ la tiene capitalizada, así que la comparación cruda
  // emitía un CAREER_MISMATCH en TODA importación. Esa advertencia debe
  // significar "el portal dice que estudias otra cosa"; con un falso positivo
  // permanente pierde todo su valor y el alumno aprende a ignorarla.
  test("MAYÚSCULAS vs capitalizado NO es una diferencia", () => {
    expect(careerNamesDiffer("INGENIERÍA DE SISTEMAS", "Ingeniería de Sistemas")).toBe(false);
  });

  test("tampoco lo son los acentos ausentes ni los espacios de más", () => {
    expect(careerNamesDiffer("INGENIERIA DE SISTEMAS", "Ingeniería de Sistemas")).toBe(false);
    expect(careerNamesDiffer("Ingeniería  de   Sistemas ", "Ingeniería de Sistemas")).toBe(false);
  });

  test("una carrera DISTINTA sí se reporta: para eso existe la advertencia", () => {
    expect(careerNamesDiffer("INGENIERÍA INDUSTRIAL", "Ingeniería de Sistemas")).toBe(true);
  });

  test("si falta cualquiera de los dos nombres no se advierte nada", () => {
    expect(careerNamesDiffer(null, "Ingeniería de Sistemas")).toBe(false);
    expect(careerNamesDiffer("INGENIERÍA DE SISTEMAS", null)).toBe(false);
    expect(careerNamesDiffer("", "Ingeniería de Sistemas")).toBe(false);
  });
});
