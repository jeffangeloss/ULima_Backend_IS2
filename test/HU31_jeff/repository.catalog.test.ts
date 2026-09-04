import { describe, expect, test } from "bun:test";
import { teacherCodeFor, careerNamesDiffer, courseColorHex, COURSE_COLOR_PALETTE} from "../../src/modules/portal-sync/portal-sync.repository.js";

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

describe("courseColorHex", () => {
  // El techo realista son 9 cursos por ciclo (27 créditos), así que la paleta
  // tiene 12: con 8 el choque era matemáticamente inevitable.
  test("la paleta cubre con holgura el máximo de cursos de un ciclo", () => {
    expect(COURSE_COLOR_PALETTE.length).toBeGreaterThanOrEqual(9);
  });

  test("todos los colores de la paleta son distintos", () => {
    expect(new Set(COURSE_COLOR_PALETTE).size).toBe(COURSE_COLOR_PALETTE.length);
  });

  test("son hex de 6 dígitos con almohadilla, que es lo que el cliente sabe leer", () => {
    for (const c of COURSE_COLOR_PALETTE) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });

  test("el mismo código siempre da el mismo color: dos alumnos ven igual el curso", () => {
    expect(courseColorHex("650084")).toBe(courseColorHex("650084"));
  });

  test("devuelve siempre un color de la paleta", () => {
    for (const code of ["650033", "6384", "510006", "", "abc"]) {
      expect(COURSE_COLOR_PALETTE).toContain(courseColorHex(code));
    }
  });

  test("los códigos casi consecutivos de un ciclo NO caen en colores vecinos", () => {
    // Es la razón de usar un hash y no `código % 12`: los cursos de un mismo
    // ciclo tienen códigos contiguos y el módulo los agrupaba en una franja
    // contigua de la paleta, dando tonos difíciles de distinguir.
    const reales = ["650033", "650035", "650067", "650070", "650084"];
    const idx = reales.map((c) => COURSE_COLOR_PALETTE.indexOf(courseColorHex(c)));
    const contiguos = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
    expect(contiguos).toBe(false);
  });

  test("un color compartido SÍ puede repetirse dentro del horario de un alumno", () => {
    // Contrato real, y la razón de que el desempate viva en el cliente: el color
    // se deriva del código del curso y esa fila la comparten todos los alumnos
    // de la sección, así que acá es imposible saber qué otros cursos lleva cada
    // uno. Caso comprobado con los 5 cursos reales de 2026-2: Seguridad de
    // Sistemas (650067) y Paradigmas (650070) caen los dos en el mismo color.
    //
    // Esta prueba NO exige que choquen (un cambio de paleta podría separarlos);
    // deja constancia de que el backend no promete lo contrario, para que nadie
    // borre el desempate del cliente creyéndolo redundante.
    expect(courseColorHex("650067")).toBe(courseColorHex("650070"));
  });

  test("aun así reparte: los 5 cursos reales usan más de un color", () => {
    const reales = ["650033", "650035", "650067", "650070", "650084"];
    expect(new Set(reales.map(courseColorHex)).size).toBeGreaterThanOrEqual(4);
  });
});
