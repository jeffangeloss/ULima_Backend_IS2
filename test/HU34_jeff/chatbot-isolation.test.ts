import { describe, expect, test } from "bun:test";

/**
 * RS-BE-28: el récord queda fuera del alcance del chatbot.
 *
 * El chatbot manda su contexto a un proveedor externo (Cohere). Esta prueba fija
 * que ni el repository ni el service del chatbot nombran las tablas del récord
 * ni importan el módulo `academic-record`, para que nadie lo conecte después
 * "porque sería útil". Es un guardia: pasa desde el primer día.
 */

const ARCHIVOS = [
  "src/modules/chatbot/chatbot.repository.ts",
  "src/modules/chatbot/chatbot.service.ts",
];

// Los nombres SQL y los identificadores que tendrían esas tablas en schema.ts:
// con el constructor de consultas de Drizzle se puede leer una tabla sin
// escribir nunca su nombre SQL. No se busca el prefijo "student_": el chatbot
// lee legítimamente student_course_progress y student_score.
const PROHIBIDOS = [
  "student_record_entry", "student_academic_snapshot", "student_period_summary",
  "studentRecordEntry", "studentAcademicSnapshot", "studentPeriodSummary",
];

describe("RS-BE-28: el chatbot no ve el record", () => {
  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra las tablas del record`, async () => {
      // Si el archivo se renombra o se borra, Bun.file falla y el test también:
      // el guardia no se vuelve verde por desaparecer su objeto.
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });

    test(`${ruta} no importa el modulo academic-record`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(texto).not.toMatch(/from\s+["'][^"']*academic-record[^"']*["']/);
      expect(texto).not.toMatch(/import\s*\(\s*["'][^"']*academic-record/);
    });
  }
});
