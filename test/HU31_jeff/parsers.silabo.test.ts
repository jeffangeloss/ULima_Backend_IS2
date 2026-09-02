import { describe, expect, test } from "bun:test";
import { parseSyllabusEntry } from "../../src/modules/portal-sync/parsers/silabo.js";
import { config } from "../../src/config/app-config.js";

const silabo = await Bun.file("test/HU31_jeff/fixtures/silabo.json").text();

/** Construye una respuesta de vSyllabusXCicloAV válida (JSON.stringify no
 *  produce los escapes inválidos que sí trae la respuesta real de Domino;
 *  esa forma cruda se cubre aparte contra el fixture comprometido). */
const makeSilaboJson = (unid: string, fileName: string): string =>
  JSON.stringify({
    "@timestamp": "20260902T193518,00Z",
    "@toplevelentries": "1",
    viewentry: [
      {
        "@position": "1",
        "@unid": unid,
        "@noteid": "13D8E2",
        "@siblings": "1",
        entrydata: [
          {
            "@columnnumber": "0", "@name": "$17",
            text: { "0": `<SCRIPT LANGUAGE="JavaScript">\r<!--\r AbreArchivo('vSyllabusXCicloAV/${unid}/$File/${fileName}');\r//-->\r</SCRIPT>` },
          },
          { "@columnnumber": "1", "@name": "SyllaArchiPDF_TX", text: { "0": "" } },
        ],
      },
    ],
  });

/** Respuesta CRUDA al estilo Domino: los escapes `\<`, `\>`, `\!` no son
 *  válidos en JSON estricto (igual que en el fixture real), así que no se
 *  puede construir con `JSON.stringify`. `fileNameCrudo` se inserta tal cual
 *  dentro del snippet, con los escapes que Domino emitiría. */
const makeSilaboCrudo = (unid: string, fileNameCrudo: string): string =>
  `{"@toplevelentries":"1","viewentry":[{"@position":"1","@unid":"${unid}","entrydata":[` +
  `{"@columnnumber":"0","@name":"$17","text":{"0":"<SCRIPT LANGUAGE=\\"JavaScript\\"\\>\\r<\\!--\\r ` +
  `AbreArchivo('vSyllabusXCicloAV/${unid}/$File/${fileNameCrudo}');\\r//--\\>\\r<\\/SCRIPT\\>"}}]}]}`;

const emptyViewJson = JSON.stringify({ "@timestamp": "20260902T193518,00Z", "@toplevelentries": "0", viewentry: [] });

describe("parseSyllabusEntry", () => {
  test("extrae UNID, filename y arma la URL contra el fixture real", () => {
    const r = parseSyllabusEntry(silabo);
    expect(r).not.toBeNull();
    expect(r?.unid).toBe("E86886A81087A25805258E4F00502E2C");
    expect(r?.fileName).toBe("2026-2 SIL PLANEAMIENTO ESTRATÉGICO.pdf");
    expect(r?.url).toBe(
      `${config.syllabus.baseUrl}/ac/ac_bd001.nsf/vSyllabusXCicloAV/E86886A81087A25805258E4F00502E2C/$File/` +
      `${encodeURIComponent("2026-2 SIL PLANEAMIENTO ESTRATÉGICO.pdf")}`,
    );
  });

  test("el fixture real trae escapes NO válidos en JSON estricto (\\! y \\>) y aun así parsea", () => {
    // JSON.parse crudo sobre el fixture debe fallar: si esto deja de ser
    // cierto, la normalización de sanitizeJson dejó de ser necesaria y el
    // comentario en silabo.ts debe revisarse.
    expect(() => JSON.parse(silabo)).toThrow();
    expect(parseSyllabusEntry(silabo)).not.toBeNull();
  });

  test("respuesta con viewentry vacío (sin sílabo para el curso) => null, no falla", () => {
    expect(parseSyllabusEntry(emptyViewJson)).toBeNull();
  });

  test("JSON malformado => null, no lanza", () => {
    expect(parseSyllabusEntry("{ esto no es json")).toBeNull();
    expect(parseSyllabusEntry("")).toBeNull();
  });

  test("sin snippet AbreArchivo reconocible => null", () => {
    const json = JSON.stringify({
      viewentry: [{ "@unid": "ABC123", entrydata: [{ text: { "0": "sin nada util aqui" } }] }],
    });
    expect(parseSyllabusEntry(json)).toBeNull();
  });

  test("construye bien con un unid y filename simples (caso feliz sintético)", () => {
    const r = parseSyllabusEntry(makeSilaboJson("1A2B3C", "2026-1 SIL BASE DE DATOS.pdf"));
    expect(r).toEqual({
      unid: "1A2B3C",
      fileName: "2026-1 SIL BASE DE DATOS.pdf",
      url: `${config.syllabus.baseUrl}/ac/ac_bd001.nsf/vSyllabusXCicloAV/1A2B3C/$File/2026-1%20SIL%20BASE%20DE%20DATOS.pdf`,
    });
  });

  describe("normalización de escapes de Domino (sanitizeJson)", () => {
    test("un filename con `\\<PARTE 1\\>` sale limpio, sin barras invertidas en el título ni en la URL", () => {
      // Domino escapa `<` y `>` con barra invertida y ese escape NO es válido
      // en JSON estricto. La barra sobrante debe ELIMINARSE, no duplicarse:
      // duplicándola quedaba literal en `syllabus.title` y percent-codificada
      // (%5C) en `drive_file_url`, apuntando a un adjunto que no existe.
      const r = parseSyllabusEntry(makeSilaboCrudo("AB12CD", "2026-2 SIL SISTEMAS \\<PARTE 1\\>.pdf"));
      expect(r).not.toBeNull();
      expect(r?.fileName).toBe("2026-2 SIL SISTEMAS <PARTE 1>.pdf");
      expect(r?.fileName).not.toContain("\\");
      expect(r?.url).not.toContain("%5C");
      expect(r?.url).toBe(
        `${config.syllabus.baseUrl}/ac/ac_bd001.nsf/vSyllabusXCicloAV/AB12CD/$File/` +
        `${encodeURIComponent("2026-2 SIL SISTEMAS <PARTE 1>.pdf")}`,
      );
    });

    test("una entrada que YA era JSON válido no se rompe: la barra invertida escapada se conserva", () => {
      // `\\\\!` en el cuerpo es una barra invertida legítimamente escapada
      // seguida de `!`. Normalizarla como si fuera un escape inválido producía
      // JSON que ya no parsea, y el sílabo se perdía por completo.
      const json = makeSilaboJson("AB34EF", "2026-2 SIL A\\!B.pdf");
      expect(() => JSON.parse(json)).not.toThrow();
      const r = parseSyllabusEntry(json);
      expect(r?.fileName).toBe("2026-2 SIL A\\!B.pdf");
    });

    test("un `\\u` que no inicia un escape unicode válido no rompe el parseo", () => {
      // `\\usuarios` no es `\\uXXXX`: la barra debe descartarse igual que
      // cualquier otro escape inválido, en vez de dejarse pasar como si el
      // escape fuera válido (con lo que JSON.parse fallaba y no había sílabo).
      const r = parseSyllabusEntry(makeSilaboCrudo("AB56AB", "C:\\usuarios SIL.pdf"));
      expect(r?.fileName).toBe("C:usuarios SIL.pdf");
    });
  });

  describe("guardas de longitud (drive_file_id varchar(120), title varchar(150), drive_file_url varchar(255))", () => {
    // Los UNID de prueba deben ser hex válido (como los reales de Domino):
    // el regex que extrae el filename de AbreArchivo(...) exige
    // vSyllabusXCicloAV/[0-9A-Fa-f]+/$File/..., así que un UNID con letras
    // fuera de A-F haría fallar el match por una razón AJENA a la guarda de
    // longitud que estas pruebas quieren ejercitar.
    test("filename de mas de 150 caracteres => null (excede title)", () => {
      const largo = "A".repeat(151) + ".pdf";
      expect(parseSyllabusEntry(makeSilaboJson("AB1234", largo))).toBeNull();
    });

    test("filename bajo 150 caracteres pero cuya URL codificada excede 255 => null", () => {
      // 100 "á" (bajo el tope de title) codifican a 6 caracteres cada uno
      // (%C3%A1): 600 caracteres solo de nombre, muy por encima de 255.
      const conAcentos = "á".repeat(100) + ".pdf";
      expect(conAcentos.length).toBeLessThanOrEqual(150);
      expect(parseSyllabusEntry(makeSilaboJson("AB5678", conAcentos))).toBeNull();
    });

    test("un filename dentro de ambos topes se acepta normalmente", () => {
      const normal = "2026-2 SIL SISTEMAS DE INFORMACIÓN.pdf";
      expect(parseSyllabusEntry(makeSilaboJson("AB9ABC", normal))).not.toBeNull();
    });

    test("un unid de mas de 120 caracteres => null (excede drive_file_id)", () => {
      // Un UNID real de Domino son 32 hex, así que esto no debería ocurrir;
      // la guarda existe porque la escritura va DENTRO de la transacción de
      // la importación: una fila que la BD rechace no perdería solo el
      // sílabo, abortaría la importación entera.
      const unidLargo = "AB".repeat(61); // 122 caracteres, hex válido
      expect(unidLargo.length).toBeGreaterThan(120);
      expect(parseSyllabusEntry(makeSilaboJson(unidLargo, "corto.pdf"))).toBeNull();
    });

    test("un unid de 120 caracteres justos se acepta", () => {
      const unidTope = "AB".repeat(60); // exactamente 120
      expect(unidTope.length).toBe(120);
      expect(parseSyllabusEntry(makeSilaboJson(unidTope, "corto.pdf"))).not.toBeNull();
    });
  });
});
