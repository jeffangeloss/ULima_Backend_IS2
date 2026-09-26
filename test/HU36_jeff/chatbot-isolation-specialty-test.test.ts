import { describe, expect, test } from "bun:test";

/**
 * RS-BE-47: el chatbot no lee el resultado del test de especialidad.
 *
 * El resultado dice qué le gusta al alumno y no sale hacia el proveedor del
 * chatbot (Cohere) sin una decisión aparte. Esta prueba fija que NINGÚN archivo
 * del módulo del chatbot nombra la tabla ni importa el módulo
 * `specialty-test`, igual que el guardia del récord
 * (`test/HU34_jeff/chatbot-isolation.test.ts`, RS-BE-28). Es un guardia: pasa
 * desde el primer día y solo lee el código del chatbot, sin tocarlo.
 *
 * Recorre TODO `*.ts` bajo `src/modules/chatbot/` con `Bun.Glob`, así que un
 * archivo nuevo del chatbot entra solo.
 */

const DIRECTORIO = "src/modules/chatbot";

const ARCHIVOS: string[] = [];
for await (const ruta of new Bun.Glob("**/*.ts").scan(DIRECTORIO)) {
  ARCHIVOS.push(`${DIRECTORIO}/${ruta}`);
}
ARCHIVOS.sort();

// El nombre SQL y el identificador de schema.ts: con el constructor de
// consultas de Drizzle se puede leer una tabla sin escribir su nombre SQL.
const PROHIBIDOS = ["student_specialty_test_result", "studentSpecialtyTestResult"];

describe("RS-BE-47: el chatbot no ve el resultado del test de especialidad", () => {
  test(`${DIRECTORIO} tiene al menos un archivo .ts para revisar`, () => {
    expect(ARCHIVOS.length).toBeGreaterThan(0);
    expect(ARCHIVOS).toContain(`${DIRECTORIO}/chatbot.repository.ts`);
    expect(ARCHIVOS).toContain(`${DIRECTORIO}/chatbot.service.ts`);
  });

  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra la tabla del resultado`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });

    test(`${ruta} no importa el modulo specialty-test`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(texto).not.toMatch(/from\s+["'][^"']*specialty-test[^"']*["']/);
      expect(texto).not.toMatch(/import\s*\(\s*["'][^"']*specialty-test/);
      expect(texto).not.toMatch(/require\s*\(\s*["'][^"']*specialty-test/);
      expect(texto).not.toMatch(/import\s+["'][^"']*specialty-test/);
    });
  }

  test("el guardia muerde: detecta la tabla y los imports en un texto sintetico", () => {
    const sintetico = [
      'import { SpecialtyTestService } from "../specialty-test/index.js";',
      'const m = await import("../specialty-test/specialty-test.repository.js");',
      "select * from student_specialty_test_result",
    ].join("\n");
    expect(PROHIBIDOS.some((p) => sintetico.includes(p))).toBe(true);
    expect(sintetico).toMatch(/from\s+["'][^"']*specialty-test[^"']*["']/);
    expect(sintetico).toMatch(/import\s*\(\s*["'][^"']*specialty-test/);
  });
});
