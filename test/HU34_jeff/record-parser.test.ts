import { describe, expect, test } from "bun:test";
import { normalizeCareerName, normalizeLabel } from "../../src/modules/portal-sync/parsers/html.js";
import {
  FOOTER_HEADER, RECORD_HEADER, labelMatches, parseRecordAcademico, parseRecordPage, recordRows,
} from "../../src/modules/portal-sync/parsers/record.js";
import type { RecordFooter, RecordRow } from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-19 y RS-BE-20 (specs/features/academic-record/academic-record.spec.md).
 *
 * El fixture es INVENTADO: el repo es público y el fixture de récord de HU31
 * trae notas reales, así que aquí no se usa. Copia la ESTRUCTURA de la página del
 * portal (tabla de 12 columnas con la celda CICLO vacía en las filas de
 * continuación, pie de 10 columnas) con valores de prueba: un curso jalado en VEZ 1
 * y aprobado en VEZ 2, un crédito 1.5, una observación con texto y el ciclo en curso
 * sin nota. Las variantes se arman en cada prueba con `variante`.
 */
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();

/** Reemplaza un fragmento que TIENE que estar UNA vez en el HTML: si el fixture
 *  cambia, la prueba falla aquí nombrando el fragmento, no con un conteo raro más
 *  abajo. La unicidad se exige porque `String.replace` con una cadena solo cambia
 *  la primera aparición. */
const variante = (html: string, antes: string, despues: string): string => {
  const i = html.indexOf(antes);
  if (i < 0) throw new Error(`el HTML no contiene: ${antes}`);
  if (html.indexOf(antes, i + 1) >= 0) throw new Error(`el HTML lo contiene mas de una vez: ${antes}`);
  return html.slice(0, i) + despues + html.slice(i + antes.length);
};

/** La página sin la tabla del pie (la segunda `<table>`). */
const sinPie = (html: string): string => {
  const inicio = html.indexOf("<table", html.indexOf("</table>"));
  const fin = html.indexOf("</table>", inicio) + "</table>".length;
  return html.slice(0, inicio) + html.slice(fin);
};

// Rótulos con tilde escritos con escapes, para que ningún editor los recomponga.
const TH_OBSERVACION = "<th>OBSERVACIÓN</th>";          // OBSERVACIÓN
const TH_CRD_VALIDOS = "<th>TOTAL CRD. VÁLIDOS</th>";    // TOTAL CRD. VÁLIDOS
const TH_ASIG_VALIDOS = "<th>TOTAL ASIG. VÁLIDOS</th>";  // TOTAL ASIG. VÁLIDOS

/** UTF-8 leído como windows-1252 (lo que hace `TextDecoder("iso-8859-1")`):
 *  Ó (C3 93) llega como "Ã“" y Á (C3 81) como "Ã" + U+0081. */
const conMojibakeWindows1252 = (html: string): string =>
  variante(variante(variante(html,
    TH_OBSERVACION, "<th>OBSERVACIÃ“N</th>"),
    TH_CRD_VALIDOS, "<th>TOTAL CRD. VÃLIDOS</th>"),
    TH_ASIG_VALIDOS, "<th>TOTAL ASIG. VÃLIDOS</th>");

/** ISO-8859-1 leído como UTF-8: la letra con tilde llega como U+FFFD. */
const conCaracterDeReemplazo = (html: string): string =>
  variante(variante(variante(html,
    TH_OBSERVACION, "<th>OBSERVACI�N</th>"),
    TH_CRD_VALIDOS, "<th>TOTAL CRD. V�LIDOS</th>"),
    TH_ASIG_VALIDOS, "<th>TOTAL ASIG. V�LIDOS</th>");

const FILAS_DEL_FIXTURE: RecordRow[] = [
  { periodCode: "2023-1", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 1, credits: 4,
    grade: 8, sectionCode: "101", gradeRaw: "08", observation: null },
  { periodCode: "2023-1", courseCode: "4901", courseName: "LENGUAJE DE PRUEBA", attempt: 1, credits: 3,
    grade: 14, sectionCode: "102", gradeRaw: "14", observation: null },
  { periodCode: "2023-2", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 2, credits: 4,
    grade: 12, sectionCode: "201", gradeRaw: "12", observation: null },
  { periodCode: "2023-2", courseCode: "659002", courseName: "TALLER DE PRUEBA", attempt: 1, credits: 1.5,
    grade: 17, sectionCode: "917", gradeRaw: "17", observation: "OBSERVACIÓN DE PRUEBA" },
  { periodCode: "2026-2", courseCode: "659003", courseName: "CURSO EN CURSO UNO", attempt: 1, credits: 3,
    grade: null, sectionCode: "301", gradeRaw: null, observation: null },
  { periodCode: "2026-2", courseCode: "659004", courseName: "CURSO EN CURSO DOS", attempt: 1, credits: 4,
    grade: null, sectionCode: "1302", gradeRaw: null, observation: null },
];

const PIE_DEL_FIXTURE: RecordFooter = {
  weightedAverage: 11.8, convalidatedCredits: 0, approvedCredits: 8.5, validCredits: 8.5,
  convalidatedCourses: 0, approvedCourses: 3, validCourses: 3, failedCredits: 4, failedCourses: 1,
};

describe("normalizeLabel", () => {
  test("quita tildes, pasa a mayusculas y colapsa espacios", () => {
    expect(normalizeLabel("OBSERVACIÓN")).toBe("OBSERVACION");
    expect(normalizeLabel("Observación")).toBe("OBSERVACION");
    expect(normalizeLabel("  total  crd.   válidos ")).toBe("TOTAL CRD. VALIDOS");
    expect(normalizeLabel("COD. CAR.")).toBe("COD. CAR.");
  });

  test("todo lo que no es letra, digito, punto o espacio sale y se vuelve a recortar", () => {
    expect(normalizeLabel("Relativa (*)")).toBe("RELATIVA");
    expect(normalizeLabel("Ubicación Relativa (*)")).toBe("UBICACION RELATIVA");
    expect(normalizeLabel("OBSERVACIÃ“N")).toBe("OBSERVACIA N");
  });

  test("normalizeCareerName se muda a html.ts sin cambiar lo que hace", () => {
    expect(normalizeCareerName("Ingeniería  de   Sistemas ")).toBe("INGENIERIA DE SISTEMAS");
    // No quita signos: eso es solo de normalizeLabel.
    expect(normalizeCareerName("Relativa (*)")).toBe("RELATIVA (*)");
  });
});

describe("labelMatches", () => {
  test("los rotulos comunes se comparan por igualdad", () => {
    expect(labelMatches("Cod.", "COD.")).toBe(true);
    expect(labelMatches("COD", "COD.")).toBe(false);
    expect(labelMatches("NOTA", "TOMO")).toBe(false);
  });

  test("OBSERVACION se compara por el prefijo OBSERVACI, tambien con mojibake", () => {
    expect(labelMatches("OBSERVACIÓN", "OBSERVACION")).toBe(true);
    expect(labelMatches("OBSERVACIÃ“N", "OBSERVACION")).toBe(true);
    expect(labelMatches("OBSERVACI�N", "OBSERVACION")).toBe(true);
    expect(labelMatches("OBSERV.", "OBSERVACION")).toBe(false);
  });

  test("los dos VALIDOS se comparan por posicion: su propio prefijo y el sufijo LIDOS", () => {
    expect(labelMatches("TOTAL CRD. VÃLIDOS", "TOTAL CRD. VALIDOS")).toBe(true);
    expect(labelMatches("TOTAL ASIG. V�LIDOS", "TOTAL ASIG. VALIDOS")).toBe(true);
    expect(labelMatches("TOTAL ASIG. VÁLIDOS", "TOTAL CRD. VALIDOS")).toBe(false);
    expect(labelMatches("TOTAL CRD. VIGENTES", "TOTAL CRD. VALIDOS")).toBe(false);
  });

  test("las cabeceras esperadas son exactamente las de la spec", () => {
    expect(RECORD_HEADER.join("|")).toBe("CICLO|COD.|ASIGNATURA|VIG.|FAC.|VEZ|CRD.|NOTA|SEC.|TOMO|FOLIO|OBSERVACION");
    expect(FOOTER_HEADER.join("|")).toBe(
      "COD. CAR.|PROM. POND.|CRD. CONV.|CRD. APROB.|TOTAL CRD. VALIDOS|ASIG. CONV.|ASIG. APR.|TOTAL ASIG. VALIDOS|CRD. DESAP.|ASIG. DESAP.",
    );
  });
});

describe("parseRecordPage con el fixture completo", () => {
  test("halla la tabla del record por su cabecera y lee las seis filas con sus columnas", () => {
    const page = parseRecordPage(record);
    expect(page.headerOk).toBe(true);
    expect(page.rows).toEqual(FILAS_DEL_FIXTURE);
  });

  test("la cabecera y la fila del pie no cuentan como descartadas", () => {
    const page = parseRecordPage(record);
    expect(page.discarded).toBe(0);
    expect(page.rows).toHaveLength(6);
  });

  test("arrastra el ciclo a las filas con la celda CICLO vacia", () => {
    const page = parseRecordPage(record);
    expect(page.rows.map((r) => r.periodCode)).toEqual(["2023-1", "2023-1", "2023-2", "2023-2", "2026-2", "2026-2"]);
  });

  test("los creditos conservan el decimal, sin redondear", () => {
    const taller = parseRecordPage(record).rows.find((r) => r.courseCode === "659002");
    expect(taller?.credits).toBe(1.5);
  });

  test("grade sigue la regla de hoy y gradeRaw guarda el texto de la celda", () => {
    const jalado = parseRecordPage(record).rows.find((r) => r.courseCode === "659001" && r.attempt === 1);
    expect(jalado?.grade).toBe(8);
    expect(jalado?.gradeRaw).toBe("08");
  });

  test("ciclo en curso: grade y gradeRaw null, nunca cadena vacia", () => {
    const enCurso = parseRecordPage(record).rows.filter((r) => r.periodCode === "2026-2");
    expect(enCurso).toHaveLength(2);
    for (const fila of enCurso) {
      expect(fila.grade).toBeNull();
      expect(fila.gradeRaw).toBeNull();
    }
  });

  test("la observacion solo aparece cuando la celda trae texto", () => {
    const rows = parseRecordPage(record).rows;
    expect(rows.find((r) => r.courseCode === "659002")?.observation).toBe("OBSERVACIÓN DE PRUEBA");
    expect(rows.filter((r) => r.courseCode !== "659002").every((r) => r.observation === null)).toBe(true);
  });

  test("lee el pie con sus nueve numeros e ignora COD. CAR.", () => {
    expect(parseRecordPage(record).footer).toEqual(PIE_DEL_FIXTURE);
  });
});

describe("parseRecordPage con cabeceras distintas", () => {
  test("mojibake UTF-8 leido como windows-1252: la cabecera coincide y el pie se lee", () => {
    const page = parseRecordPage(conMojibakeWindows1252(record));
    expect(page.headerOk).toBe(true);
    expect(page.discarded).toBe(0);
    expect(page.rows).toHaveLength(6);
    expect(page.footer).toEqual(PIE_DEL_FIXTURE);
  });

  test("mojibake con el caracter de reemplazo U+FFFD: la cabecera coincide y el pie se lee", () => {
    const page = parseRecordPage(conCaracterDeReemplazo(record));
    expect(page.headerOk).toBe(true);
    expect(page.rows).toHaveLength(6);
    expect(page.footer).toEqual(PIE_DEL_FIXTURE);
  });

  test("cabecera reordenada (NOTA y TOMO intercambiadas): headerOk false", () => {
    const reordenada = variante(variante(variante(record,
      "<th>NOTA</th>", "<th>@@</th>"), "<th>TOMO</th>", "<th>NOTA</th>"), "<th>@@</th>", "<th>TOMO</th>");
    const page = parseRecordPage(reordenada);
    expect(page.headerOk).toBe(false);
    expect(page.discarded).toBe(0);
  });

  test("pie con un rotulo cambiado: footer null y el record se lee igual", () => {
    const page = parseRecordPage(variante(record, "<th>ASIG. APR.</th>", "<th>ASIG. APROBADAS</th>"));
    expect(page.headerOk).toBe(true);
    expect(page.footer).toBeNull();
  });
});

describe("parseRecordPage sin pie o con la pagina incompleta", () => {
  test("sin la tabla del pie: footer null y la tabla del record se lee igual", () => {
    const page = parseRecordPage(sinPie(record));
    expect(page.headerOk).toBe(true);
    expect(page.rows).toHaveLength(6);
    expect(page.footer).toBeNull();
  });

  test("pie con una celda no numerica: footer null", () => {
    const page = parseRecordPage(variante(record, "11.8000", "S/N"));
    expect(page.headerOk).toBe(true);
    expect(page.footer).toBeNull();
  });

  test("tabla cortada a la mitad: no hay tabla del record ni pie", () => {
    const cortada = record.slice(0, record.indexOf("2023-2"));
    const page = parseRecordPage(cortada);
    expect(page.headerOk).toBe(false);
    expect(page.footer).toBeNull();
    // Modo compatible: lee las dos filas completas anteriores al corte, sin contar descartes.
    expect(page.rows.map((r) => r.courseCode)).toEqual(["659001", "4901"]);
    expect(page.discarded).toBe(0);
  });
});

describe("parseRecordPage descarta y cuenta las filas invalidas", () => {
  test("una fila con 11 celdas", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">0022</td>', ""));
    expect(page.discarded).toBe(1);
    expect(page.rows).toHaveLength(5);
    expect(page.rows.some((r) => r.courseCode === "4901")).toBe(false);
  });

  test("un codigo que no tiene de 4 a 6 digitos", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">4901</td>', '<td class="text-center">ABC</td>'));
    expect(page.discarded).toBe(1);
    expect(page.rows).toHaveLength(5);
  });

  test("una VEZ que no es un entero mayor o igual a 1", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">2</td>', '<td class="text-center">0</td>'));
    expect(page.discarded).toBe(1);
    expect(page.rows.some((r) => r.courseCode === "659001" && r.periodCode === "2023-2")).toBe(false);
  });

  test("un CRD. que no es numerico", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">1.5</td>', '<td class="text-center">UNO</td>'));
    expect(page.discarded).toBe(1);
    expect(page.rows.some((r) => r.courseCode === "659002")).toBe(false);
  });

  test("las filas anteriores al primer CICLO", () => {
    const page = parseRecordPage(variante(record, "2023-1", "&nbsp;"));
    expect(page.discarded).toBe(2);
    expect(page.rows).toHaveLength(4);
    expect(page.rows[0].periodCode).toBe("2023-2");
  });
});

describe("parseRecordPage sin la cabecera del record (modo compatible)", () => {
  test("lee las filas como hoy y no cuenta descartes", () => {
    // Así arma su récord la prueba de equivalencias de HU31: una tabla sin cabecera.
    const html = "<table>"
      + "<tr><td>2023-1</td><td>659001</td><td>CURSO 0</td><td>V</td><td>SIS</td><td>1</td><td>1.5</td>"
      + "<td>15</td><td>1000</td><td></td><td></td><td></td></tr>"
      + "<tr><td>&nbsp;</td><td>ABC</td><td>CURSO 1</td><td>V</td><td>SIS</td><td>1</td><td>3</td>"
      + "<td>11</td><td>1001</td><td></td><td></td><td></td></tr>"
      + "</table>";
    expect(parseRecordPage(html)).toEqual({
      rows: [{ periodCode: "2023-1", courseCode: "659001", courseName: "CURSO 0", attempt: 1, credits: 1.5,
        grade: 15, sectionCode: "1000", gradeRaw: "15", observation: null }],
      headerOk: false,
      discarded: 0,
      footer: null,
    });
  });

  test("nunca lanza: HTML vacio", () => {
    expect(parseRecordPage("")).toEqual({ rows: [], headerOk: false, discarded: 0, footer: null });
  });
});

describe("recordRows y parseRecordAcademico", () => {
  test("recordRows devuelve ok:false con el motivo de siempre si no hay filas", () => {
    expect(recordRows({ rows: [], headerOk: true, discarded: 0, footer: null }))
      .toEqual({ ok: false, reason: "no se encontraron filas de récord" });
  });

  test("parseRecordAcademico es recordRows sobre parseRecordPage", () => {
    const r = parseRecordAcademico(record);
    expect(r).toEqual(recordRows(parseRecordPage(record)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(6);
  });

  test("parseRecordAcademico falla con ok:false si no hay filas", () => {
    expect(parseRecordAcademico("<html></html>").ok).toBe(false);
  });
});
