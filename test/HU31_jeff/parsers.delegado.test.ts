import { describe, expect, test } from "bun:test";
import { parseAulas, parseDelegados } from "../../src/modules/portal-sync/parsers/delegado.js";
import { cellsOf, inputValueByName, trsOf } from "../../src/modules/portal-sync/parsers/html.js";

/**
 * FIXTURES ANONIMIZADOS (RS-23). Los seis archivos salen de las 10 nóminas y los
 * 2 sidebars capturados del portal real el 2026-09-04 con dos cuentas distintas.
 * Cada código de alumno se reemplazó por `2020NNNN` y cada nombre por uno
 * ficticio, con un mapeo determinista y estable entre archivos: el mismo alumno
 * real da siempre el mismo par ficticio, así que las nóminas siguen compartiendo
 * alumnos entre sí, igual que en el original. Quedaron intactos el número de
 * Orden, los `name=` de los campos, la cantidad de celdas, el marcado y el
 * encoding. Los HTML crudos viven fuera de todo repositorio.
 *
 * - delegado-sidebar.html          cuenta A, 5 cursos (aCurs de 6 dígitos)
 * - delegado-sidebar-cuenta2.html  cuenta B, 5 cursos (2 con aCurs de 4 dígitos)
 * - delegado-nomina-154508.html    40 alumnos, delegado 029, subdelegado 026
 * - delegado-nomina-154516.html    18 alumnos, delegado 007, subdelegado 001
 * - delegado-nomina-sin-cargos.html  = 154516 con las 2 casillas QUITADAS
 * - delegado-nomina-habilitada.html  = 154516 SIN el atributo DISABLED
 *
 * Los dos últimos son derivados y el último es además SINTÉTICO: en las 20
 * casillas reales observadas (2 cuentas, 10 nóminas) TODAS vinieron `DISABLED
 * checked`, incluida la de la cuenta que sí ostenta un cargo, así que no existe
 * muestra real de una casilla habilitada. Se construyó a mano quitando el
 * atributo para probar RS-4 justamente donde no hay muestra.
 */
const F = "test/HU31_jeff/fixtures/";
const sidebar = await Bun.file(F + "delegado-sidebar.html").text();
const sidebar2 = await Bun.file(F + "delegado-sidebar-cuenta2.html").text();
const nomina = await Bun.file(F + "delegado-nomina-154508.html").text();
const nomina2 = await Bun.file(F + "delegado-nomina-154516.html").text();
const sinCargos = await Bun.file(F + "delegado-nomina-sin-cargos.html").text();
const habilitada = await Bun.file(F + "delegado-nomina-habilitada.html").text();

/** Marcado exacto de las dos casillas de `delegado-nomina-154516.html`. */
const CASILLA_DLGD = '<INPUT type="CHECKBOX" name="prm_sFgDlgd_7" value="1" DISABLED checked';
const CASILLA_SDLG = '<INPUT type="CHECKBOX" name="prm_sFgSdlg_1" value="1" DISABLED checked';

const datos = <T,>(r: { ok: true; data: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(`el parser falló: ${r.reason}`);
  return r.data;
};
const motivo = (r: { ok: true } | { ok: false; reason: string }): string => {
  if (r.ok) throw new Error("se esperaba ok:false");
  return r.reason;
};

describe("parseAulas (RS-1)", () => {
  test("saca las 5 aulas del sidebar con su par curso/sección", () => {
    expect(datos(parseAulas(sidebar))).toEqual([
      { aula: "154508", courseCode: "650033", sectionCode: "952" },
      { aula: "154516", courseCode: "650035", sectionCode: "958" },
      { aula: "154604", courseCode: "650067", sectionCode: "952" },
      { aula: "154607", courseCode: "650070", sectionCode: "654" },
      { aula: "154621", courseCode: "650084", sectionCode: "1051" },
    ]);
  });

  test("acepta aCurs de 4 dígitos: no todo código de curso tiene 6", () => {
    const aulas = datos(parseAulas(sidebar2));
    expect(aulas).toHaveLength(5);
    expect(aulas.map((a) => a.courseCode)).toEqual(["1327", "5674", "650028", "650066", "650078"]);
    // Dos cursos distintos comparten sectionCode: por eso el empate del service
    // es por el PAR (courseCode, sectionCode) y nunca por la sección sola.
    expect(aulas.filter((a) => a.sectionCode === "853")).toHaveLength(2);
  });

  test("un índice incompleto se descarta SOLO, sin desplazar a los demás", () => {
    // Al índice 2 le falta aSecc. Emparejar por posición en vez de por subíndice
    // le daría a 154503 la sección de 154597 y correría todo lo posterior.
    const roto = sidebar2.replace(/aSecc\[2\]="853";/, "");
    const aulas = datos(parseAulas(roto));
    expect(aulas.map((a) => a.aula)).toEqual(["150730", "151008", "154597", "154615"]);
    expect(aulas.find((a) => a.aula === "154597")).toEqual({
      aula: "154597",
      courseCode: "650066",
      sectionCode: "851",
    });
  });

  test("un aula sin OpenDelegado no se pide", () => {
    const aulas = datos(parseAulas(sidebar.replace("OpenDelegado('154508')", "OpenNota('154508')")));
    expect(aulas.map((a) => a.aula)).toEqual(["154516", "154604", "154607", "154621"]);
  });

  test("no se filtra por aTipAV: solo se ha visto el valor 002", () => {
    const aulas = datos(parseAulas(sidebar.replace('aTipAV[0]="002"', 'aTipAV[0]="003"')));
    expect(aulas).toHaveLength(5);
  });

  test("aCurs no se confunde con aCoordCurs ni con aNomCurs", () => {
    // Renombrado solo el array bueno: quedan aCoordCurs (="0") y aNomCurs (texto
    // truncado). Una regex sin frontera de identificador leería alguno de esos.
    const sinCurso = sidebar.replace(/aCurs\[/g, "aOtroArray[");
    expect(sinCurso).toContain("aCoordCurs[0]");
    expect(sinCurso).toContain("aNomCurs[0]");
    expect(parseAulas(sinCurso).ok).toBe(false);
  });

  test("un aCurs inválido tumba su aula y deja intactas las otras cuatro", () => {
    const aulas = datos(parseAulas(sidebar.replace('aCurs[0]="650033"', 'aCurs[0]="X"')));
    expect(aulas.map((a) => a.aula)).toEqual(["154516", "154604", "154607", "154621"]);
  });

  test("falla con ok:false si no hay arrays: la página de login llega con HTTP 200", () => {
    expect(parseAulas("<html><body>Ingrese su usuario</body></html>").ok).toBe(false);
    expect(motivo(parseAulas("<html></html>"))).toContain("aula");
  });

  test("es puro: dos llamadas seguidas dan lo mismo", () => {
    expect(parseAulas(sidebar)).toEqual(parseAulas(sidebar));
  });
});

describe("parseDelegados (RS-2, RS-3)", () => {
  test("lee delegado y subdelegado de la nómina de 40 alumnos", () => {
    expect(datos(parseDelegados(nomina, "154508"))).toEqual({
      delegate: { code: "20200029", fullName: "ROJAS RAMIREZ LUCIA BEATRIZ" },
      subdelegate: { code: "20200026", fullName: "FLORES RAMIREZ JORGE ENRIQUE" },
    });
  });

  test("y de la de 18, donde el subdelegado es la fila 001", () => {
    expect(datos(parseDelegados(nomina2, "154516"))).toEqual({
      delegate: { code: "20200046", fullName: "FLORES MUÑOZ JORGE ENRIQUE" },
      subdelegate: { code: "20200041", fullName: "PEREZ MUÑOZ CLAUDIA PATRICIA" },
    });
  });

  test("el dato NO está en el texto de la celda, solo en el value del input", () => {
    const fila = trsOf(nomina).find((tr) => /name="prm_sCoUser_29"/.test(tr));
    expect(fila).toBeDefined();
    // 9 celdas —el portal intercala espaciadoras— y solo la de Orden trae texto.
    // Un parser basado en cellsOf/stripTags sacaría cadena vacía de Código y de
    // Apellidos y Nombres.
    expect(cellsOf(fila ?? "")).toEqual(["029", "", "", "", "", "", "", "", ""]);
    expect(datos(parseDelegados(nomina, "154508")).delegate?.code).toBe("20200029");
  });

  test("la celda Orden va rellena a 3 dígitos y el sufijo del campo no: nunca se comparan", () => {
    expect(nomina).toContain('<strong class="textos">029</strong>');
    expect(nomina).toContain('name="prm_sFgDlgd_29"');
  });

  test("prm_sFgInsert_ y prm_sFgUpdate_ no son casillas aunque traigan checked", () => {
    // Comparten el prefijo prm_sFg con las casillas y viven en la MISMA fila:
    // sin el ancla ^...$ la regex los tomaría como cargos de todas las filas.
    const trampa = nomina2
      .replace('name="prm_sFgInsert_5" value="0"', 'name="prm_sFgInsert_5" value="1" checked')
      .replace('name="prm_sFgUpdate_9" value="0"', 'name="prm_sFgUpdate_9" value="1" CHECKED');
    expect(datos(parseDelegados(trampa, "154516"))).toEqual(
      datos(parseDelegados(nomina2, "154516")),
    );
  });

  test("prm_sCoUserDlgd no se confunde con prm_sCoUser_<n>", () => {
    // Los dos hidden del tope del formulario comparten prefijo con el input de
    // código de cada fila; vienen vacíos en las 10 capturas, pero si el portal
    // los llenara una regex sin anclar al sufijo numérico leería el equivocado.
    const trampa = nomina2
      .replace('name="prm_sCoUserDlgd" value=""', 'name="prm_sCoUserDlgd" value="99999999"')
      .replace('name="prm_sCoUserSdlg" value=""', 'name="prm_sCoUserSdlg" value="88888888"');
    expect(datos(parseDelegados(trampa, "154516")).delegate?.code).toBe("20200046");
    expect(datos(parseDelegados(trampa, "154516")).subdelegate?.code).toBe("20200041");
  });

  test("el nombre conserva la Ñ hasta el resultado", () => {
    expect(datos(parseDelegados(nomina2, "154516")).delegate?.fullName).toContain("Ñ");
  });

  test("y una Ñ escrita como entidad se decodifica", () => {
    const html =
      "<title>Aula Delegado 9001</title>" +
      '<INPUT type="hidden" name="prm_sNuAula" value="9001" size="4">' +
      '<INPUT type="TEXT" name="prm_sCoUser_3" value="20209999" size="10" readonly>' +
      '<INPUT type="TEXT" name="prm_sNoCmpUser_3" value="QUI&Ntilde;ONES MU&Ntilde;OZ ANA" size="50" readonly>' +
      '<INPUT type="CHECKBOX" name="prm_sFgDlgd_3" value="1" DISABLED checked>';
    expect(datos(parseDelegados(html, "9001")).delegate).toEqual({
      code: "20209999",
      fullName: "QUIÑONES MUÑOZ ANA",
    });
  });

  test("es puro: dos llamadas seguidas dan lo mismo", () => {
    expect(parseDelegados(nomina, "154508")).toEqual(parseDelegados(nomina, "154508"));
  });
});

describe("parseDelegados: se mira checked y nunca DISABLED (RS-4)", () => {
  test("una casilla marcada y HABILITADA se lee igual (fixture SINTÉTICO)", () => {
    // No hay muestra real: las 20 casillas observadas vinieron DISABLED. El
    // fixture se construyó quitando ese atributo a mano. Apoyarse en DISABLED
    // ataría el parser a un detalle de presentación que no aporta información.
    expect(habilitada).not.toContain("DISABLED");
    expect(datos(parseDelegados(habilitada, "154516"))).toEqual(
      datos(parseDelegados(nomina2, "154516")),
    );
  });

  test('acepta checked, CHECKED y checked="checked"', () => {
    const variantes = nomina2
      .replace(CASILLA_DLGD, '<INPUT type="CHECKBOX" name="prm_sFgDlgd_7" value="1" CHECKED')
      .replace(
        CASILLA_SDLG,
        '<INPUT type="CHECKBOX" name="prm_sFgSdlg_1" value="1" checked="checked"',
      );
    expect(datos(parseDelegados(variantes, "154516"))).toEqual(
      datos(parseDelegados(nomina2, "154516")),
    );
  });

  test("una casilla sin checked no otorga el cargo", () => {
    const sinDlgd = nomina2.replace(
      CASILLA_DLGD,
      '<INPUT type="CHECKBOX" name="prm_sFgDlgd_7" value="1" DISABLED',
    );
    const r = datos(parseDelegados(sinDlgd, "154516"));
    expect(r.delegate).toBeUndefined();
    expect(r.subdelegate?.code).toBe("20200041");
  });

  test("la palabra checked dentro de otro atributo no marca nada", () => {
    const falso = nomina2.replace(
      CASILLA_DLGD,
      '<INPUT type="CHECKBOX" name="prm_sFgDlgd_7" value="1" DISABLED class="is-checked"',
    );
    expect(datos(parseDelegados(falso, "154516")).delegate).toBeUndefined();
  });
});

describe("parseDelegados: sección sin cargos (RS-5)", () => {
  test("cero casillas con filas de alumno es ok:true con ambos ausentes", () => {
    // Es una sección que todavía no eligió, no un error: el service borrará el
    // claim que hubiera (RS-5a) en vez de conservar uno rancio.
    const r = datos(parseDelegados(sinCargos, "154516"));
    expect(r.delegate).toBeUndefined();
    expect(r.subdelegate).toBeUndefined();
    expect(r.warnings).toBeUndefined();
    expect(sinCargos).not.toContain("CHECKBOX");
  });

  test("solo uno de los dos cargos elegido también es ok:true", () => {
    const soloSdlg = sinCargos.replace(
      '<INPUT type="TEXT" name="prm_sNoCmpUser_1"',
      '<INPUT type="CHECKBOX" name="prm_sFgSdlg_1" value="1" DISABLED checked class="textos">' +
        '<INPUT type="TEXT" name="prm_sNoCmpUser_1"',
    );
    const r = datos(parseDelegados(soloSdlg, "154516"));
    expect(r.delegate).toBeUndefined();
    expect(r.subdelegate?.code).toBe("20200041");
  });
});

describe("parseDelegados: los cuatro casos de ok:false (RS-6)", () => {
  test("dos casillas del mismo cargo marcadas", () => {
    const dosDlgd = nomina2.replace('name="prm_sFgSdlg_1"', 'name="prm_sFgDlgd_1"');
    expect(motivo(parseDelegados(dosDlgd, "154516"))).toContain("2 casillas de delegado");
  });

  test("dos subdelegados también", () => {
    const dosSdlg = nomina2.replace('name="prm_sFgDlgd_7"', 'name="prm_sFgSdlg_7"');
    expect(motivo(parseDelegados(dosSdlg, "154516"))).toContain("casillas de subdelegado");
  });

  test("la fila de una casilla marcada no trae código", () => {
    const sinCodigo = nomina2.replace(
      'name="prm_sCoUser_7" value="20200046"',
      'name="prm_sCoUser_7" value=""',
    );
    const razon = motivo(parseDelegados(sinCodigo, "154516"));
    expect(razon).toContain("no trae código");
    expect(razon).toContain("7");
  });

  test("la respuesta no contiene ninguna fila de alumno", () => {
    // Este portal devuelve la página de login con HTTP 200: cero filas NO es una
    // sección sin delegado, es una respuesta que no es la nómina.
    const vacia = nomina2.replace(/name="prm_sCoUser_\d+"/g, 'name="prm_sOtroCampo"');
    expect(motivo(parseDelegados(vacia, "154516"))).toContain("ninguna fila de alumno");
    expect(motivo(parseDelegados("<html>Ingrese su usuario</html>", "154516"))).toContain(
      "ninguna fila de alumno",
    );
  });

  test("el aula de la respuesta no es la pedida", () => {
    // Las 5 nóminas se piden en paralelo: sin esta guarda dos respuestas
    // cruzadas escribirían los delegados de una sección dentro de otra.
    expect(motivo(parseDelegados(nomina, "154516"))).toContain("aula 154508");
    expect(motivo(parseDelegados(nomina2, "154508"))).toContain("aula 154516");
  });

  test("el título y el hidden prm_sNuAula tienen que coincidir los dos", () => {
    const tituloMentiroso = nomina2.replace(
      "<title>Aula Delegado 154516</title>",
      "<title>Aula Delegado 154508</title>",
    );
    expect(motivo(parseDelegados(tituloMentiroso, "154516"))).toContain("154508");
    const hiddenMentiroso = nomina2.replace(
      'name="prm_sNuAula" value="154516"',
      'name="prm_sNuAula" value="154508"',
    );
    expect(motivo(parseDelegados(hiddenMentiroso, "154516"))).toContain("154508");
  });

  test("una respuesta que no declara aula por ningún lado tampoco se acepta", () => {
    const anonima = nomina2
      .replace("<title>Aula Delegado 154516</title>", "<title>Aula Virtual</title>")
      .replace('name="prm_sNuAula" value="154516"', 'name="prm_sNuAula" value=""');
    expect(motivo(parseDelegados(anonima, "154516"))).toContain("no declara");
  });

  test("ante ok:false no se devuelve el otro cargo a medias", () => {
    const dosDlgd = nomina2.replace('name="prm_sFgSdlg_1"', 'name="prm_sFgDlgd_1"');
    const r = parseDelegados(dosDlgd, "154516");
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("data");
  });
});

describe("parseDelegados: dato que la BD rechazaría (RS-6a)", () => {
  test("un nombre de más de 150 caracteres deja el cargo AUSENTE, no ok:false", () => {
    // full_name es varchar(150). Intentar escribirlo dentro de la transacción de
    // la importación daría 22001 y haría rollback de notas, horario y matrícula.
    const largo = nomina2.replace(
      'name="prm_sNoCmpUser_7" value="FLORES MUÑOZ JORGE ENRIQUE"',
      `name="prm_sNoCmpUser_7" value="${"A".repeat(151)}"`,
    );
    const r = datos(parseDelegados(largo, "154516"));
    expect(r.delegate).toBeUndefined();
    expect(r.subdelegate?.code).toBe("20200041");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings?.[0].position).toBe("delegate");
    expect(r.warnings?.[0].reason).toContain("delegado");
  });

  test("un nombre de exactamente 150 sí se devuelve", () => {
    const justo = nomina2.replace(
      'name="prm_sNoCmpUser_7" value="FLORES MUÑOZ JORGE ENRIQUE"',
      `name="prm_sNoCmpUser_7" value="${"A".repeat(150)}"`,
    );
    expect(datos(parseDelegados(justo, "154516")).delegate?.fullName).toHaveLength(150);
  });

  test("un código de más de 30 caracteres deja el cargo ausente", () => {
    const largo = nomina2.replace(
      'name="prm_sCoUser_7" value="20200046"',
      `name="prm_sCoUser_7" value="${"9".repeat(31)}"`,
    );
    const r = datos(parseDelegados(largo, "154516"));
    expect(r.delegate).toBeUndefined();
    expect(r.warnings).toHaveLength(1);
  });

  test("un nombre vacío también deja el cargo ausente", () => {
    // Un claim sin nombre le haría mostrar un número a la app, que es justo lo
    // que la feature evita. El problema es del nombre y no de la identidad, así
    // que no invalida al otro cargo de la misma nómina.
    const sinNombre = nomina2.replace(
      'name="prm_sNoCmpUser_7" value="FLORES MUÑOZ JORGE ENRIQUE"',
      'name="prm_sNoCmpUser_7" value=""',
    );
    const r = datos(parseDelegados(sinNombre, "154516"));
    expect(r.delegate).toBeUndefined();
    expect(r.subdelegate?.code).toBe("20200041");
    expect(r.warnings).toHaveLength(1);
  });
});

describe("inputValueByName (RS-7)", () => {
  test("devuelve el value crudo del input con ese name exacto", () => {
    expect(inputValueByName(nomina, "prm_sCoUser_29")).toBe("20200029");
    expect(inputValueByName(nomina, "prm_sNuAula")).toBe("154508");
  });

  test("prm_sCoUser_1 no devuelve el value de prm_sCoUser_10", () => {
    expect(inputValueByName(nomina, "prm_sCoUser_1")).toBe("20200001");
    expect(inputValueByName(nomina, "prm_sCoUser_10")).toBe("20200010");
  });

  test("prm_sCoUser_2 no devuelve el de prm_sCoUserDlgd", () => {
    expect(inputValueByName(nomina, "prm_sCoUserDlgd")).toBe("");
    expect(inputValueByName(nomina, "prm_sCoUser_2")).toMatch(/^2020\d{4}$/);
  });

  test("null si no existe el input, cadena vacía si existe con value vacío", () => {
    expect(inputValueByName(nomina, "prm_sNoExiste")).toBeNull();
    expect(inputValueByName(nomina, "prm_sCoUserSdlg")).toBe("");
  });

  test("null si el tag no trae value=", () => {
    // El sidebar tiene un `value""` sin `=`: hay que devolver null y no adivinar.
    expect(sidebar).toContain('name="prm_sNuAula" value""');
    expect(inputValueByName(sidebar, "prm_sNuAula")).toBeNull();
  });

  test("tolera comillas simples y mayúsculas en el marcado", () => {
    expect(inputValueByName("<INPUT NAME='prm_x' VALUE='7'>", "prm_x")).toBe("7");
    expect(inputValueByName("<input name=prm_x value=7>", "prm_x")).toBe("7");
  });
});

describe("los fixtures están anonimizados (RS-23)", () => {
  const todos = { sidebar, sidebar2, nomina, nomina2, sinCargos, habilitada };

  test("ningún código de 8 dígitos fuera de la convención 2020NNNN", () => {
    for (const [nombre, html] of Object.entries(todos)) {
      const ajenos = [...new Set(html.match(/\b\d{8}\b/g) ?? [])].filter(
        (c) => !/^2020\d{4}$/.test(c),
      );
      expect({ nombre, ajenos }).toEqual({ nombre, ajenos: [] });
    }
  });

  test("las nóminas conservan las 353 filas repartidas y su estructura", () => {
    expect(nomina.match(/name="prm_sCoUser_\d+"/g)).toHaveLength(40);
    expect(nomina2.match(/name="prm_sCoUser_\d+"/g)).toHaveLength(18);
    // Cada fila de alumno trae sus 9 celdas, como las 353 medidas en el spike.
    const filas = trsOf(nomina).filter((tr) => /name="prm_sCoUser_\d+"/.test(tr));
    expect(filas).toHaveLength(40);
    expect(filas.every((tr) => cellsOf(tr).length === 9)).toBe(true);
  });
});
