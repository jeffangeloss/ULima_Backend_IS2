import { describe, expect, spyOn, test } from "bun:test";
import { parseAsistenciaCurso } from "../../src/modules/portal-sync/parsers/asistencia.js";
import { parseDetalleEvaluaciones, parseNotaCurso } from "../../src/modules/portal-sync/parsers/nota.js";
import { emparejarEvaluaciones } from "../../src/modules/portal-sync/refresh/emparejar.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HOJAS, PAGINA_ASISTENCIA, PAGINA_NOTA, marco } from "./recarga.dobles.js";
import { armar } from "./recarga.servicio.js";

/**
 * RS-BE-59 · privacidad y minimización de la recarga. Los lectores devuelven
 * solo los campos de su tipo, ningún registro lleva credenciales, cookies,
 * notas, nombres ni HTML, y los fixtures nuevos solo traen datos inventados.
 */

describe("RS-BE-59 · minimización", () => {
  test("cada lector devuelve exactamente los campos de su tipo", () => {
    const curso = parseNotaCurso(PAGINA_NOTA, "900101");
    expect(curso.ok && Object.keys(curso.data).sort()).toEqual(["agregados", "courseCode", "sectionCode"]);
    expect(curso.ok && Object.keys(curso.data.agregados[0]!).sort()).toEqual(["clave", "etiqueta", "valor"]);
    const tabla = parseDetalleEvaluaciones(marco());
    expect(tabla.ok && Object.keys(tabla.data[0]!).sort()).toEqual(["group", "key", "mark", "name", "value", "week", "weight"]);
    const asistencia = parseAsistenciaCurso(PAGINA_ASISTENCIA, "900101", "20230001", "2026-2");
    expect(asistencia.ok && Object.keys(asistencia.data).sort()).toEqual([
      "absentHours", "attendedHours", "courseCode", "sectionCode", "totalHours",
    ]);
    const emparejada = emparejarEvaluaciones(tabla.ok ? tabla.data : [], []);
    expect(Object.keys(emparejada[0]!).sort()).toEqual([
      "assessmentId", "group", "key", "mark", "match", "name", "value", "week", "weight",
    ]);
  });

  test("ningún registro de la recarga contiene credenciales, cookies, notas, nombres ni HTML", async () => {
    const lineas: string[] = [];
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((metodo) =>
      spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
        lineas.push(args.map(String).join(" "));
      }));
    try {
      const a = armar({
        log: (linea) => lineas.push(linea),
        paginas: {
          [PORTAL_PATHS.tareaAcademica("900101")]: marco(HOJAS.map((h, i) => ({ ...h, nota: i === 0 ? "14.5" : "" }))),
          [PORTAL_PATHS.asistenciaAlumno("900102")]: "<html><body>otra cosa</body></html>",
        },
      });
      await a.servicio.refresh(a.entrada({ credentials: { password: "Clave-Secreta-Prueba", passcode: "654321" } }));
    } finally {
      for (const espia of espias) espia.mockRestore();
    }
    expect(lineas.length).toBeGreaterThan(0);
    const todo = lineas.join("\n");
    for (const prohibido of [
      "Clave-Secreta-Prueba", "654321", "sesion-de-prueba", "ltpa-de-prueba", "14.5",
      "Examen escrito", "TALLER", "PRUEBA RAMOS", "20230001", "<",
    ]) {
      expect(todo).not.toContain(prohibido);
    }
  });

  test("los fixtures nuevos solo traen los códigos inventados de la spec", async () => {
    const permitidos = new Set([
      "20230001", "690417", "690418", "690419", "690420", "690421",
      "900101", "900102", "900103", "900104", "900105",
    ]);
    const archivos = [
      ...new Bun.Glob("test/HU37_jeff/fixtures/*.html").scanSync("."),
      "test/HU31_jeff/fixtures/menu-lista-nota.html",
    ];
    expect(archivos).toHaveLength(7);
    for (const ruta of archivos) {
      const texto = await Bun.file(ruta).text();
      expect(texto).toContain("FIXTURE ARMADO A MANO");
      for (const numero of texto.match(/\b\d{6,10}\b/g) ?? []) expect(permitidos.has(numero)).toBe(true);
    }
  });
});
