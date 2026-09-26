import { describe, expect, test } from "bun:test";
import { parseAulas } from "../../src/modules/portal-sync/parsers/delegado.js";

/**
 * RS-BE-48 · el menú lateral del Aula Virtual en sus dos formatos.
 *
 * La ULima deja de emitir los arreglos `aNuAula`, `aCurs` y `aSecc`, y el menú
 * nuevo trae por cada curso un `<li class="curso">` con la carrera, el nombre
 * truncado y la sección, seguido del enlace `Open…('<aula>')`. Los dos fixtures
 * están armados a mano con datos inventados (aulas 900101 a 900105, cursos
 * 690417 a 690421) y reproducen solo la estructura de cada formato.
 */
const F = "test/HU31_jeff/fixtures/";
const lista = await Bun.file(F + "menu-lista-asistencia.html").text();
const arreglos = await Bun.file(F + "menu-arreglos-asistencia.html").text();
const FN = "OpenAsistenciaAlumno";

const datos = <T,>(r: { ok: true; data: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(`el parser falló: ${r.reason}`);
  return r.data;
};
const aulasDe = (html: string, fn = FN): string[] => datos(parseAulas(html, fn)).map((a) => a.aula);

/** Enlace de asistencia tal como lo emite el menú nuevo. */
const enlace = (arg: string, fn = FN): string =>
  `&nbsp;&nbsp;&nbsp;- <a href="javascript:${fn}('${arg}');">Asistencia</a><br><br>`;
/** Un curso completo del menú nuevo, con su `<li>` y su enlace. */
const curso = (seccion: string, ...args: string[]): string =>
  `<li class="curso">CARRERA ING.SI. / CURSO INVENTADO / ${seccion}</li>\n${args.map((a) => enlace(a)).join("\n")}\n`;
/** Inserta cursos justo antes del cierre de la lista. */
const conCursos = (...extra: string[]): string => lista.replace("</ul>", `${extra.join("")}</ul>`);

describe("parseAulas, formato de lista (RS-BE-48)", () => {
  test("da las aulas en el orden del documento, sin curso y con la sección del <li>", () => {
    expect(datos(parseAulas(lista, FN))).toEqual([
      { aula: "900101", courseCode: null, sectionCode: "812", origen: "lista" },
      { aula: "900102", courseCode: null, sectionCode: "812", origen: "lista" },
      { aula: "900103", courseCode: null, sectionCode: "815", origen: "lista" },
      { aula: "900104", courseCode: null, sectionCode: "1020", origen: "lista" },
      { aula: "900105", courseCode: null, sectionCode: "903", origen: "lista" },
    ]);
  });

  test("un <li> sin enlace se salta y no mueve a los demás", () => {
    const html = lista.replace(
      '<li class="curso">CARRERA ING.SI. / ANALITICA DE DATOS / 812</li>',
      '<li class="curso">CARRERA ING.SI. / SIN PANEL / 700</li>\n'
        + '<li class="curso">CARRERA ING.SI. / ANALITICA DE DATOS / 812</li>',
    );
    expect(aulasDe(html)).toEqual(["900101", "900102", "900103", "900104", "900105"]);
  });

  test("un tramo con dos aulas distintas se descarta entero", () => {
    const html = lista.replace(enlace("900102"), `${enlace("900102")}\n${enlace("900199")}`);
    expect(aulasDe(html)).toEqual(["900101", "900103", "900104", "900105"]);
  });

  test("también cuando la segunda aula tiene letras", () => {
    const html = lista.replace(enlace("900102"), `${enlace("900102")}\n${enlace("9001AB")}`);
    expect(aulasDe(html)).toEqual(["900101", "900103", "900104", "900105"]);
  });

  test("la misma aula enlazada dos veces en su tramo cuenta como una sola", () => {
    const html = lista.replace(enlace("900102"), `${enlace("900102")}\n${enlace("900102")}`);
    expect(aulasDe(html)).toEqual(["900101", "900102", "900103", "900104", "900105"]);
  });

  test("el enlace de otra función no cuenta", () => {
    const html = lista.replace(enlace("900103"), enlace("900103", "OpenNotaAlumnoPrePost"));
    expect(aulasDe(html)).toEqual(["900101", "900102", "900104", "900105"]);
    // Y pedido con la función de Nota, el menú de Asistencia no ofrece ningún aula.
    expect(parseAulas(lista, "OpenNotaAlumnoPrePost").ok).toBe(false);
  });

  test("un nombre de función que solo termina igual tampoco cuenta", () => {
    const html = lista.replace(enlace("900103"), enlace("900103", `Mi${FN}`));
    expect(aulasDe(html)).toEqual(["900101", "900102", "900104", "900105"]);
  });

  test("acepta el argumento entre comillas dobles", () => {
    const html = lista.replace(`${FN}('900104')`, `${FN}("900104")`);
    expect(aulasDe(html)).toContain("900104");
  });

  test("un aula con letras, con 3 dígitos o con 9 descarta su tramo", () => {
    for (const mala of ["9001A1", "901", "900101234"]) {
      const html = lista.replace(enlace("900104"), enlace(mala));
      expect(aulasDe(html)).toEqual(["900101", "900102", "900103", "900105"]);
    }
  });

  test("una sección no numérica queda null y el aula se conserva", () => {
    for (const texto of ["CARRERA ING.SI. / ETICA PROFESIONAL / A1", "CARRERA ING.SI. / ETICA / 12345", "SIN BARRAS"]) {
      const html = lista.replace("CARRERA ING.SI. / ETICA PROFESIONAL / 1020", texto);
      const aula = datos(parseAulas(html, FN)).find((a) => a.aula === "900104");
      expect(aula).toEqual({ aula: "900104", courseCode: null, sectionCode: null, origen: "lista" });
    }
  });

  test("un número dentro del nombre nunca pasa por código de curso", () => {
    const html = lista.replace("TALLER DE PROTOTIPAD", "TALLER 690417 PROTO");
    expect(datos(parseAulas(html, FN))[0]).toEqual(
      { aula: "900101", courseCode: null, sectionCode: "812", origen: "lista" },
    );
  });

  test("la misma aula con secciones en conflicto se descarta en los dos tramos", () => {
    const html = conCursos(curso("813", "900101"));
    expect(aulasDe(html)).toEqual(["900102", "900103", "900104", "900105"]);
  });

  test("la misma aula con la misma sección, o con una sección null, conserva la primera aparición", () => {
    expect(datos(parseAulas(conCursos(curso("812", "900101")), FN))).toHaveLength(5);
    const conNull = datos(parseAulas(conCursos(curso("SIN SECCION", "900101")), FN));
    expect(conNull.map((a) => a.aula)).toEqual(["900101", "900102", "900103", "900104", "900105"]);
    expect(conNull[0]).toEqual({ aula: "900101", courseCode: null, sectionCode: "812", origen: "lista" });
  });

  test('class="curso open" empieza un curso y class="curso-body" no', () => {
    const abierto = lista.replace(
      '<li class="curso">CARRERA ING.SI. / GESTION DE PROYECTOS / 815</li>',
      '<li class="curso open">CARRERA ING.SI. / GESTION DE PROYECTOS / 815</li>',
    );
    expect(aulasDe(abierto)).toEqual(["900101", "900102", "900103", "900104", "900105"]);

    // Sin un curso que lo abra, el enlace de 900101 no pertenece a ningún tramo.
    const cuerpo = lista.replace(
      '<li class="curso">CARRERA ING.SI. / TALLER DE PROTOTIPAD / 812</li>',
      '<li class="curso-body">CARRERA ING.SI. / TALLER DE PROTOTIPAD / 812</li>',
    );
    expect(aulasDe(cuerpo)).toEqual(["900102", "900103", "900104", "900105"]);
  });

  test("el tramo termina en el primer </ul>", () => {
    // Un enlace suelto después de la lista no se suma al último curso, que
    // de lo contrario quedaría con dos aulas y se descartaría.
    const html = lista.replace("</ul>", `</ul>\n${enlace("900199")}`);
    expect(aulasDe(html)).toEqual(["900101", "900102", "900103", "900104", "900105"]);
  });

  test("las entidades HTML del <li> se limpian antes de leer la sección", () => {
    const html = lista.replace(
      "CARRERA ING.SI. / TALLER DE PROTOTIPAD / 812",
      "CARRERA ING.SI. / TALLER DE PROTOTIP&Aacute;D /&nbsp;812&nbsp;",
    );
    expect(datos(parseAulas(html, FN))[0]).toEqual(
      { aula: "900101", courseCode: null, sectionCode: "812", origen: "lista" },
    );
  });

  test("la página de inicio de sesión da ok:false con el motivo de hoy", () => {
    const r = parseAulas("<html><body><form name=\"loginForm\"></form></body></html>", FN);
    expect(r).toEqual({ ok: false, reason: "el sidebar no trae ninguna aula utilizable" });
  });
});

describe("parseAulas, elección del formato (RS-BE-48)", () => {
  test("el menú de arreglos armado a mano da cada aula con su curso y origen arreglos", () => {
    expect(datos(parseAulas(arreglos, FN))).toEqual([
      { aula: "900101", courseCode: "690417", sectionCode: "812", origen: "arreglos" },
      { aula: "900102", courseCode: "690418", sectionCode: "812", origen: "arreglos" },
      { aula: "900103", courseCode: "690419", sectionCode: "815", origen: "arreglos" },
      { aula: "900104", courseCode: "690420", sectionCode: "1020", origen: "arreglos" },
      { aula: "900105", courseCode: "690421", sectionCode: "903", origen: "arreglos" },
    ]);
  });

  test("una página con los dos formatos usa los arreglos", () => {
    const ambos = arreglos.replaceAll("<li>", '<li class="curso">');
    const r = datos(parseAulas(ambos, FN));
    expect(r.map((a) => a.origen)).toEqual(["arreglos", "arreglos", "arreglos", "arreglos", "arreglos"]);
    expect(r[0]!.courseCode).toBe("690417");
  });

  test("si los arreglos no dejan ningún aula utilizable, manda la lista", () => {
    // Arreglos declarados pero sin ningún curso válido, junto a un menú de lista.
    const ambos = arreglos
      .replace(/aCurs\[(\d)\]="\d+"/g, 'aCurs[$1]="X"')
      .replaceAll("<li>", '<li class="curso">');
    const r = datos(parseAulas(ambos, FN));
    expect(r.map((a) => a.origen)).toEqual(["lista", "lista", "lista", "lista", "lista"]);
    expect(r.map((a) => a.courseCode)).toEqual([null, null, null, null, null]);
  });
});
