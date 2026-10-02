/**
 * Sonda del cableado de RF-EST-7. La corre `modo-estatico.silabos.test.ts` en un proceso
 * aparte, porque `MODO_ESTATICO` se lee una sola vez al importar `src/config/env.ts`.
 *
 * Importa la instancia real `gradesService` de `src/modules/grades/index.ts`, le sustituye la
 * consulta a la base por filas sintéticas y escribe en la salida estándar una línea JSON con
 * el `silaboUrl` de cada curso. No toca la base.
 */
const { gradesService } = await import("../../src/modules/grades/index.js");

const fila = (id: number, url: string | null) => ({
  curriculum_course_id: id, course_id: id, course_name: `Curso ${id}`, period_code: "2026-1",
  syllabus_url: url, section_id: null,
});
(gradesService.repository as { findCoursesAndAssessments: unknown }).findCoursesAndAssessments = async () => [
  fila(1, "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view"),
  fila(2, "https://cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV/ABC123/$File/silabo.pdf"),
];

const { cursos } = await gradesService.getCoursesAndSyllabi();
console.log("RESULTADOS=" + JSON.stringify(Object.fromEntries(cursos.map((c: any) => [c.id, c.silaboUrl]))));
process.exit(0);
