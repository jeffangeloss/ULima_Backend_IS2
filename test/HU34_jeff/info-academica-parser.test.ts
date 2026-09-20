import { describe, expect, test } from "bun:test";
import {
  EMPTY_GENERAL,
  GENERAL_HEADER,
  PERIOD_HEADER,
  parseInfoAcademica,
} from "../../src/modules/portal-sync/parsers/info-academica.js";

// RS-BE-24 — Información académica de `layout.jsp`: general y por período.
// Fixture inventado de HU34: ningún valor sale de un alumno real.
const layout = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();

/** Datos del parser. Todas las variantes de este archivo siguen siendo `ok`:
 *  lo que cambia es cuántos campos quedan en `null`. */
const leer = (html: string) => {
  const r = parseInfoAcademica(html);
  if (!r.ok) throw new Error(`parser fallo: ${r.reason}`);
  return r.data;
};

// Literales del fixture sobre los que se arman las variantes.
const PPA = 'size="1">14.2500</font>';
const ROTULO_GENERAL = 'size="1">Cr&eacute;ditos Acumulados</font>';
const ROTULO_PERIODO = 'size="1">Desaprobados</font>';
const BLOQUE_PERIODO = "- Informaci&oacute;n por Per&iacute;odo";
const CICLO_PERIODO = "Acad&eacute;mico: Ciclo 2026-1</font>";
const UBICACION_PERIODO = 'size="1">MEDIO SUPERIOR</font>';
const NIVEL_PERIODO = 'size="1">4</font>';

/** El bloque por período cuando su cabecera no coincide: queda el ciclo y nada más. */
const PERIODO_VACIO = {
  periodCode: "2026-1",
  average: null,
  relativePosition: null,
  level: null,
  convalidated: { courses: null, credits: null },
  enrolled: { courses: null, credits: null },
  approved: { courses: null, credits: null },
  failed: { courses: null, credits: null },
};

describe("fixture HU34 de layout", () => {
  test("cada literal que usan las variantes aparece exactamente una vez", () => {
    for (const literal of [
      PPA, ROTULO_GENERAL, ROTULO_PERIODO, BLOQUE_PERIODO,
      CICLO_PERIODO, UBICACION_PERIODO, NIVEL_PERIODO,
    ]) {
      expect(layout.split(literal)).toHaveLength(2);
    }
  });
});

describe("parseInfoAcademica con el bloque completo", () => {
  test("devuelve carrera, general, periodo y los campos no leidos", () => {
    expect(Object.keys(leer(layout))).toEqual(["careerName", "general", "period", "unreadable"]);
  });

  test("la carrera se sigue leyendo como antes", () => {
    expect(leer(layout).careerName).toBe("INGENIERÍA INDUSTRIAL");
  });

  test("lee la informacion general completa", () => {
    expect(leer(layout).general).toEqual({
      ppa: 14.25,
      relativePosition: "TERCIO SUPERIOR",
      convalidated: { courses: 2, credits: 6 },
      approved: { courses: 30, credits: 100 },
      creditsAccumulated: 106,
      creditsRequired: 210,
    });
  });

  test("lee el bloque por periodo con el ciclo que el mismo declara", () => {
    expect(leer(layout).period).toEqual({
      periodCode: "2026-1",
      average: 13.25,
      relativePosition: "MEDIO SUPERIOR",
      level: 4,
      convalidated: { courses: 1, credits: 3 },
      enrolled: { courses: 7, credits: 23 },
      approved: { courses: 5, credits: 16 },
      failed: { courses: 2, credits: 7 },
    });
  });

  test("con todo leido unreadable queda vacio", () => {
    expect(leer(layout).unreadable).toEqual([]);
  });

  test("las etiquetas de cierre en mayusculas no rompen el corte del bloque", () => {
    const d = leer(layout.replaceAll("</table>", "</TABLE>"));
    expect(d.general.ppa).toBe(14.25);
    expect(d.period?.periodCode).toBe("2026-1");
    expect(d.unreadable).toEqual([]);
  });
});

describe("parseInfoAcademica sin bloque por periodo", () => {
  const sinRotulo = () => leer(layout.replace(BLOQUE_PERIODO, "- Otra secci&oacute;n"));

  test("sin el rotulo del bloque, period es null y se anota en unreadable", () => {
    expect(sinRotulo().period).toBeNull();
    expect(sinRotulo().unreadable).toEqual(["period"]);
  });

  test("sin codigo de ciclo tampoco hay bloque por periodo", () => {
    const d = leer(layout.replace(CICLO_PERIODO, "Acad&eacute;mico: Ciclo</font>"));
    expect(d.period).toBeNull();
    expect(d.unreadable).toEqual(["period"]);
  });

  test("el bloque general se sigue leyendo sin el bloque por periodo", () => {
    expect(sinRotulo().general.ppa).toBe(14.25);
  });
});

describe("parseInfoAcademica con una cabecera que no coincide", () => {
  const generalRota = () => leer(layout.replace(ROTULO_GENERAL, 'size="1">Cr&eacute;ditos Totales</font>'));

  test("un rotulo distinto en General deja todos sus campos en null", () => {
    expect(generalRota().general).toEqual(EMPTY_GENERAL);
    expect(generalRota().unreadable).toEqual(["general"]);
  });

  test("con la cabecera General rota el bloque por periodo se sigue leyendo", () => {
    expect(generalRota().period?.average).toBe(13.25);
  });

  test("un rotulo distinto por periodo deja el periodCode y el resto en null", () => {
    const d = leer(layout.replace(ROTULO_PERIODO, 'size="1">Jalados</font>'));
    expect(d.period).toEqual(PERIODO_VACIO);
    expect(d.unreadable).toEqual(["period"]);
  });

  test("las dos secuencias esperadas son las que publica el portal", () => {
    expect(GENERAL_HEADER).toEqual([
      "PROMEDIO PONDERADO ACUMULADO", "UBICACION RELATIVA", "CONVALIDADOS", "APROBADOS",
      "CREDITOS ACUMULADOS", "CREDITOS REQUERIDOS ESPECIALIDAD",
      "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
    ]);
    expect(PERIOD_HEADER).toEqual([
      "PROMEDIO PERIODO", "UBICACION RELATIVA", "NIVEL",
      "CONVALIDADOS", "MATRICULADOS", "APROBADOS", "DESAPROBADOS",
      "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
    ]);
  });
});

describe("parseInfoAcademica con valores que no se pueden leer", () => {
  const conRaya = () => leer(layout.replace(PPA, 'size="1">—</font>'));

  test("un valor con raya deja el campo en null y nunca en 0", () => {
    expect(conRaya().general.ppa).toBeNull();
    expect(conRaya().general.ppa).not.toBe(0);
    expect(conRaya().unreadable).toEqual(["general.ppa"]);
  });

  test("el resto del bloque se lee aunque un valor falle", () => {
    expect(conRaya().general.relativePosition).toBe("TERCIO SUPERIOR");
    expect(conRaya().general.creditsRequired).toBe(210);
  });

  test("nivel no entero y ubicacion vacia quedan en null y se anotan", () => {
    const d = leer(
      layout
        .replace(NIVEL_PERIODO, 'size="1">N/D</font>')
        .replace(UBICACION_PERIODO, 'size="1">&nbsp;</font>'),
    );
    expect(d.period?.level).toBeNull();
    expect(d.period?.relativePosition).toBeNull();
    expect(d.period?.average).toBe(13.25);
    expect(d.unreadable).toEqual(["period.relativePosition", "period.level"]);
  });
});

describe("EMPTY_GENERAL y las paginas sin tablas", () => {
  test("EMPTY_GENERAL tiene todo en null y esta congelado", () => {
    expect(EMPTY_GENERAL).toEqual({
      ppa: null,
      relativePosition: null,
      convalidated: { courses: null, credits: null },
      approved: { courses: null, credits: null },
      creditsAccumulated: null,
      creditsRequired: null,
    });
    expect(Object.isFrozen(EMPTY_GENERAL)).toBe(true);
    expect(Object.isFrozen(EMPTY_GENERAL.convalidated)).toBe(true);
    expect(Object.isFrozen(EMPTY_GENERAL.approved)).toBe(true);
  });

  test("con la carrera pero sin las tablas devuelve ok con todo en null", () => {
    const d = leer("<html>Información Académica INGENIERÍA INDUSTRIAL - Información General</html>");
    expect(d.careerName).toBe("INGENIERÍA INDUSTRIAL");
    expect(d.general).toEqual(EMPTY_GENERAL);
    expect(d.period).toBeNull();
    expect(d.unreadable).toEqual(["general", "period"]);
  });

  test("sin el bloque Informacion Academica el parser falla como hoy", () => {
    const r = parseInfoAcademica("<html>nada</html>");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no se encontró el bloque Información Académica");
  });
});
