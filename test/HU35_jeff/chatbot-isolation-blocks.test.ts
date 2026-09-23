import { describe, expect, test } from "bun:test";

/**
 * RS-BE-35: los bloques de horario propios quedan fuera del alcance del chatbot.
 *
 * El chatbot manda su contexto a un proveedor externo (Cohere). Dónde trabaja
 * un alumno y a qué hora sale no tiene por qué salir de la app. Esta prueba
 * fija que NINGÚN archivo del módulo del chatbot nombra las tablas de los
 * bloques —ni el enum de sus excepciones— ni importa el módulo `time-blocks`,
 * para que nadie lo conecte después "porque sería útil".
 *
 * Es un guardia, como el del récord (`test/HU34_jeff/chatbot-isolation.test.ts`,
 * RS-BE-28): pasa desde el primer día. Recorre todos los `*.ts` bajo
 * `src/modules/chatbot/` con `Bun.Glob`, así que un archivo que se agregue
 * después al módulo entra solo al guardia, sin tocar esta lista.
 */

const DIRECTORIO = "src/modules/chatbot";

/** Todos los `.ts` del módulo, con la ruta completa desde la raíz del repo. */
const ARCHIVOS: string[] = [];
for await (const ruta of new Bun.Glob("**/*.ts").scan(DIRECTORIO)) {
  ARCHIVOS.push(`${DIRECTORIO}/${ruta}`);
}
ARCHIVOS.sort();

// Los nombres SQL y los identificadores que tienen en schema.ts (Tarea 1): con
// el constructor de consultas de Drizzle se puede leer una tabla sin escribir
// nunca su nombre SQL. `student_time_block` ya es prefijo de
// `student_time_block_exception`, y lo mismo pasa en camelCase; se listan las
// dos para que la lista diga en claro qué se protege. No se busca un prefijo
// más corto ("student_", "time"): el chatbot lee legítimamente otras tablas
// del alumno y habla de horas de clase.
const PROHIBIDOS = [
  "student_time_block",
  "student_time_block_exception",
  "time_block_exception_status",
  "studentTimeBlock",
  "studentTimeBlockException",
  "timeBlockExceptionStatusEnum",
];

describe("RS-BE-35: el chatbot no ve los bloques de horario propios", () => {
  // Si el directorio desaparece o se queda sin archivos `.ts` (se renombra el
  // módulo entero), el guardia tiene que fallar por quedarse sin nada que
  // recorrer, no volverse verde por un `describe` sin pruebas adentro.
  test(`${DIRECTORIO} tiene al menos un archivo .ts para revisar`, () => {
    expect(ARCHIVOS.length).toBeGreaterThan(0);
  });

  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra las tablas de los bloques`, async () => {
      // Si el archivo se renombra o se borra, Bun.file falla y el test también:
      // el guardia no se vuelve verde por desaparecer su objeto.
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });

    test(`${ruta} no importa el modulo time-blocks`, async () => {
      const texto = await Bun.file(ruta).text();
      // import ... from / export ... from
      expect(texto).not.toMatch(/from\s+["'][^"']*time-blocks[^"']*["']/);
      // import dinámico: import("../time-blocks/...")
      expect(texto).not.toMatch(/import\s*\(\s*["'][^"']*time-blocks/);
      // import solo por efecto: import "../time-blocks/..."
      expect(texto).not.toMatch(/import\s+["'][^"']*time-blocks/);
    });
  }
});
