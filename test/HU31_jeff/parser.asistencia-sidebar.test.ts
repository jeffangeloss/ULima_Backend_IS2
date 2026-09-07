import { describe, expect, test } from "bun:test";
import { parseAulas } from "../../src/modules/portal-sync/parsers/delegado.js";

/**
 * RS-BE-15 · el sidebar de Asistencia usa los MISMOS arrays JS que el de
 * delegados (`aNuAula`/`aCurs`/`aSecc`), así que se reusa `parseAulas` en vez
 * de escribir un parser gemelo. Lo único que cambia es el nombre de la función
 * del enlace: `OpenAsistenciaAlumno` en vez de `OpenDelegado`.
 */
const sidebar = await Bun.file("test/HU31_jeff/fixtures/asistencia-sidebar.html").text();

describe("parseAulas sobre el sidebar de Asistencia", () => {
  test("saca las 5 aulas con su curso y su sección", () => {
    const r = parseAulas(sidebar, "OpenAsistenciaAlumno");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([
      { aula: "154508", courseCode: "650033", sectionCode: "952" },
      { aula: "154516", courseCode: "650035", sectionCode: "958" },
      { aula: "154604", courseCode: "650067", sectionCode: "952" },
      { aula: "154607", courseCode: "650070", sectionCode: "654" },
      { aula: "154621", courseCode: "650084", sectionCode: "1051" },
    ]);
  });

  test("con el nombre de enlace por defecto NO encuentra nada", () => {
    // Prueba que el filtro por enlace sigue vivo: este sidebar no tiene ningún
    // OpenDelegado, así que pedirlo con el default debe fallar, no colar las 5.
    expect(parseAulas(sidebar).ok).toBe(false);
  });

  test("el sidebar de delegados sigue funcionando sin pasar el nombre", async () => {
    const deleg = await Bun.file("test/HU31_jeff/fixtures/delegado-sidebar.html").text();
    expect(parseAulas(deleg).ok).toBe(true);
  });
});
