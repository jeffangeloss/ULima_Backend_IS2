import { describe, expect, test } from "bun:test";
import {
  emparejarEvaluaciones, nombreBase, silaboNoCoincide,
} from "../../src/modules/portal-sync/refresh/emparejar.js";
import type {
  EvaluacionEmparejada, EvaluacionSilabo, EvaluacionUlima,
} from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-54 · emparejamiento con el sílabo. Los patrones son los del hallazgo 5
 * de la spec, con nombres, semanas, pesos e ids inventados.
 */
const u = (key: string, name: string, week: number | null, weight: number): EvaluacionUlima =>
  ({ key, group: "EVC", name, week, weight, value: null, mark: "pending" });
const s = (assessmentId: number, name: string, week: number, weight: number, typeName = "Otro tipo"): EvaluacionSilabo =>
  ({ assessmentId, name, typeName, week, weight });
const parejas = (r: EvaluacionEmparejada[]) => r.map((e) => [e.key, e.assessmentId, e.match]);

describe("nombre base", () => {
  test("minúsculas, sin tildes, espacios colapsados y sin un ordinal final", () => {
    expect(nombreBase("Examen escrito 2")).toBe("examen escrito");
    expect(nombreBase("Trabajo de investigación N1")).toBe("trabajo de investigacion");
    expect(nombreBase("Control N° 3")).toBe("control");
    expect(nombreBase("Práctica calificada III")).toBe("practica calificada");
    expect(nombreBase("  Exposición   Final  ")).toBe("exposicion final");
    expect(nombreBase("Semana 100")).toBe("semana 100");
  });
});

describe("R1, exacta", () => {
  test("ordinal final contra el nombre sin ordinal del sílabo", () => {
    const r = emparejarEvaluaciones(
      [u("a", "Examen escrito 1", 3, 15), u("b", "Examen escrito 2", 8, 15), u("c", "Examen escrito 3", 13, 15)],
      [s(1, "Examen escrito", 3, 15), s(2, "Examen escrito", 8, 15), s(3, "Examen escrito", 13, 15)],
    );
    expect(parejas(r)).toEqual([["a", 1, "exact"], ["b", 2, "exact"], ["c", 3, "exact"]]);
  });

  test("ordinal con N y ordinal sin repetición", () => {
    const r = emparejarEvaluaciones(
      [u("a", "Trabajo de investigación N1", 5, 10), u("b", "Trabajo de investigación N2", 10, 10), u("c", "Exposición 1", 9, 20)],
      [s(1, "Trabajo de investigación", 5, 10), s(2, "Trabajo de investigación", 10, 10), s(3, "Exposición", 9, 20)],
    );
    expect(parejas(r)).toEqual([["a", 1, "exact"], ["b", 2, "exact"], ["c", 3, "exact"]]);
  });

  test("una sola candidata con otro nombre es exact_other_name", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Trabajo final", 15, 30)], [s(4, "Proyecto integrador", 15, 30)])))
      .toEqual([["a", 4, "exact_other_name"]]);
  });

  test("el nombre del tipo de evaluación también calza", () => {
    const r = emparejarEvaluaciones([u("a", "Examen parcial", 8, 25)], [s(9, "Evaluación intermedia", 8, 25, "Examen parcial")]);
    expect(parejas(r)).toEqual([["a", 9, "exact"]]);
  });

  test("dos candidatas en la misma semana las desempata el nombre", () => {
    const r = emparejarEvaluaciones(
      [u("a", "Control de lectura 2", 6, 10)],
      [s(1, "Laboratorio", 6, 10), s(2, "Control de lectura", 6, 10)],
    );
    expect(parejas(r)).toEqual([["a", 2, "exact"]]);
  });

  test("un empate sin salida queda none", () => {
    const r = emparejarEvaluaciones([u("a", "Evaluación", 6, 10)], [s(1, "Control", 6, 10), s(2, "Laboratorio", 6, 10)]);
    expect(parejas(r)).toEqual([["a", null, "none"]]);
  });

  test("el peso es condición dura, con 0,01 de tolerancia", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 20)], [s(1, "Examen", 5, 25)]))).toEqual([["a", null, "none"]]);
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 12.5)], [s(1, "Examen", 5, 12.51)]))).toEqual([["a", 1, "exact"]]);
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 12.5)], [s(1, "Examen", 5, 12.52)]))).toEqual([["a", null, "none"]]);
  });
});

describe("R2, semana corrida", () => {
  test("una semana de diferencia es week_shift, como la exposición del hallazgo 5", () => {
    expect(parejas(emparejarEvaluaciones([u("07.15", "Exposición", 10, 20)], [s(3, "Exposición", 11, 20)])))
      .toEqual([["07.15", 3, "week_shift"]]);
  });

  test("tres semanas de diferencia quedan none", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 20)], [s(1, "Examen", 8, 20)]))).toEqual([["a", null, "none"]]);
  });

  test("el ordinal cuenta dentro del mismo nombre y no por posición en la lista", () => {
    const r = emparejarEvaluaciones(
      [u("p1", "Práctica 1", 4, 10), u("e1", "Examen 1", 6, 20), u("p2", "Práctica 2", 9, 10)],
      [s(1, "Práctica", 5, 10), s(2, "Examen", 7, 20), s(3, "Práctica", 10, 10)],
    );
    expect(parejas(r)).toEqual([["p1", 1, "week_shift"], ["e1", 2, "week_shift"], ["p2", 3, "week_shift"]]);
  });

  test("una evaluación de la ULima sin semana que R1 no empareja pasa directo a R3", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Participación", null, 10)], [s(1, "Participación", 1, 10)])))
      .toEqual([["a", null, "none"]]);
  });
});

describe("reglas generales", () => {
  test("una evaluación del sílabo se empareja a lo sumo una vez", () => {
    const r = emparejarEvaluaciones([u("a", "Examen 1", 6, 20), u("b", "Examen 2", 6, 20)], [s(1, "Examen", 6, 20)]);
    expect(parejas(r)).toEqual([["a", 1, "exact"], ["b", null, "none"]]);
  });

  test("un sílabo vacío deja todo en none y conserva los siete campos de cada evaluación", () => {
    const r = emparejarEvaluaciones([u("a", "Examen", 5, 20)], []);
    expect(r).toEqual([{ key: "a", group: "EVC", name: "Examen", week: 5, weight: 20, value: null, mark: "pending", assessmentId: null, match: "none" }]);
  });

  test("la guarda del curso salta con el sílabo vacío o con la mitad o más sin pareja", () => {
    const dos = [u("a", "Examen", 5, 20), u("b", "Proyecto", 15, 80)];
    expect(silaboNoCoincide(emparejarEvaluaciones(dos, []), [])).toBe(true);
    const silabo = [s(1, "Examen", 5, 20)];
    expect(silaboNoCoincide(emparejarEvaluaciones(dos, silabo), silabo)).toBe(true);
    const completo = [s(1, "Examen", 5, 20), s(2, "Proyecto", 15, 80)];
    expect(silaboNoCoincide(emparejarEvaluaciones(dos, completo), completo)).toBe(false);
  });
});
