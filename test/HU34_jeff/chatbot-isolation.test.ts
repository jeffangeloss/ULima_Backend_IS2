import { describe, expect, test } from "bun:test";

/**
 * RS-BE-28: el récord queda fuera del alcance del chatbot.
 *
 * El chatbot manda su contexto a un proveedor externo (Cohere). Esta prueba fija
 * que NINGÚN archivo del módulo del chatbot nombra las tablas del récord ni
 * importa el módulo `academic-record`, para que nadie lo conecte después
 * "porque sería útil". Es un guardia: pasa desde el primer día.
 *
 * Arreglo 5 de la revisión final (minor): antes esto miraba una lista fija de
 * dos archivos (`chatbot.repository.ts`, `chatbot.service.ts`) elegida a mano.
 * Un tercer archivo del módulo —o uno nuevo que se agregue después— quedaba
 * fuera del guardia sin que nada lo avisara. Ahora recorre TODO `*.ts` bajo
 * `src/modules/chatbot/` con `Bun.Glob`, así que un archivo nuevo entra solo.
 */

const DIRECTORIO = "src/modules/chatbot";

/** Todos los `.ts` del módulo, con la ruta completa desde la raíz del repo. */
const ARCHIVOS: string[] = [];
for await (const ruta of new Bun.Glob("**/*.ts").scan(DIRECTORIO)) {
  ARCHIVOS.push(`${DIRECTORIO}/${ruta}`);
}

// Los nombres SQL y los identificadores que tendrían esas tablas en schema.ts:
// con el constructor de consultas de Drizzle se puede leer una tabla sin
// escribir nunca su nombre SQL. No se busca el prefijo "student_": el chatbot
// lee legítimamente student_course_progress y student_score.
const PROHIBIDOS = [
  "student_record_entry", "student_academic_snapshot", "student_period_summary",
  "studentRecordEntry", "studentAcademicSnapshot", "studentPeriodSummary",
];

describe("RS-BE-28: el chatbot no ve el record", () => {
  // Si el directorio desaparece o se queda sin archivos `.ts` (se renombra el
  // módulo entero), el guardia tiene que fallar por quedarse sin nada que
  // recorrer, no volverse verde por un `describe` sin pruebas adentro.
  test(`${DIRECTORIO} tiene al menos un archivo .ts para revisar`, () => {
    expect(ARCHIVOS.length).toBeGreaterThan(0);
  });

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
