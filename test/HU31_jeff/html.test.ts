import { describe, expect, test } from "bun:test";
import { cellsOf, clean, decodeEntities, stripTags, tdsOf, trsOf } from "../../src/modules/portal-sync/parsers/html.js";

describe("html utils", () => {
  test("decodeEntities convierte las entidades que emite layout.jsp", () => {
    expect(decodeEntities("DIEZ QUI&Ntilde;ONES")).toBe("DIEZ QUIÑONES");
    expect(decodeEntities("PLANEAMIENTO ESTRAT&Eacute;GICO")).toBe("PLANEAMIENTO ESTRATÉGICO");
    expect(decodeEntities("PARADIG. PROGRAMACI&Oacute;")).toBe("PARADIG. PROGRAMACIÓ");
    expect(decodeEntities("a&nbsp;b")).toBe("a b");
    expect(decodeEntities("A &amp; B")).toBe("A & B");
    expect(decodeEntities("&#209;")).toBe("Ñ");
  });

  test("clean decodifica, colapsa espacios y recorta", () => {
    expect(clean("  DIEZ &nbsp; QUI&Ntilde;ONES \n / PERCY ")).toBe("DIEZ QUIÑONES / PERCY");
    expect(clean("")).toBe("");
  });

  test("stripTags quita el marcado y clean normaliza el resultado", () => {
    expect(clean(stripTags("<td><font size=1><b>650033</b></font></td>"))).toBe("650033");
    // Sustituir por espacio, no por cadena vacía: dos textos adyacentes separados
    // solo por etiquetas deben quedar separados, nunca pegados.
    expect(clean(stripTags("<b>Nombre</b><b>Apellido</b>"))).toBe("Nombre Apellido");
  });

  test("trsOf devuelve las filas crudas y cellsOf su texto limpio", () => {
    const html = "<table><tr><td>a</td><th>b</th></tr><tr><td>&nbsp;c </td><td>d</td></tr></table>";
    const trs = trsOf(html);
    expect(trs).toHaveLength(2);
    expect(cellsOf(trs[0])).toEqual(["a", "b"]);
    expect(cellsOf(trs[1])).toEqual(["c", "d"]);
  });

  test("tdsOf conserva los atributos, que el horario necesita", () => {
    const tds = tdsOf('<tr><td width="10%"><font title="650033 X">v</font></td></tr>');
    expect(tds).toHaveLength(1);
    expect(tds[0]).toContain('title="650033 X"');
  });

  test("celda real del horario: el aula sobrevive a la normalizacion", () => {
    const celda =
      '<td align="left" width="15%" bgcolor="#EFEFEF">' +
      '<font face="Arial" size="1" title="650033 PLAN.ESTR&Aacute;T.">' +
      "<small>6500<br>33 PLAN.ESTR&Aacute;</small> <br>N-405</font> </td>";
    // El aula se lee del tramo posterior a </small>, que es como lo hara el
    // parser de horario de la Tarea 3.
    const trasSmall = celda.split(/<\/small>/i).pop() ?? "";
    expect(clean(stripTags(trasSmall))).toBe("N-405");
    // Y el codigo de curso se toma del atributo title, NO del texto partido por <br>.
    expect(clean("650033 PLAN.ESTR&Aacute;T.")).toBe("650033 PLAN.ESTRÁT.");
  });
});
