import { describe, expect, test } from "bun:test";
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import {
  evaluateAnswers,
  rankKeys,
  roundAffinity,
  scoreOf,
  scores,
  tally,
  type Evaluation,
  type Score,
  type Step,
} from "../../src/modules/specialty-test/specialty-test.logic.js";
import {
  buildResultUlises,
  buildTemplateReason,
  fillTemplate,
  formatPoints,
} from "../../src/modules/specialty-test/specialty-test.templates.js";
import type {
  Answer,
  DuelAnswer,
} from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-40, RS-BE-41 y RS-BE-42 sobre la versión vigente, sin base ni red.
 *
 * Los ocho ejemplos del contenido se reproducen letra por letra en
 * `specialty-test-content.test.ts`. Aquí van los bordes que los ejemplos no
 * cubren: la aritmética exacta para todo h, n y e, el orden, el redondeo, los
 * umbrales de 10 y 11, el 10,83 tras el primer desempate, el segundo desempate
 * medido en el par aunque una tercera lo pase, y las líneas de Ulises. Las
 * respuestas de los casos de borde salen de una búsqueda sobre la versión
 * vigente; cada caso anota las afinidades que produce.
 */

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const ejemplo = (id: string) => c.weights.examples.find((e) => e.id === id)!;

/** Contesta los desempates que el cálculo va pidiendo, con `respuestas` en orden. */
const recorrer = (
  answers: Readonly<Record<string, Answer>>,
  respuestas: readonly DuelAnswer[],
): { pedidos: string[]; lineas: string[]; final: Step } => {
  const recibidos: Array<{ id: string; answer: DuelAnswer }> = [];
  const pedidos: string[] = [];
  const lineas: string[] = [];
  let paso = evaluateAnswers(c, answers, recibidos);
  while (paso.kind === "tiebreak") {
    pedidos.push(paso.tiebreaker.id);
    lineas.push(paso.line);
    recibidos.push({ id: paso.tiebreaker.id, answer: respuestas[recibidos.length]! });
    paso = evaluateAnswers(c, answers, recibidos);
  }
  return { pedidos, lineas, final: paso };
};

const evaluacion = (answers: Readonly<Record<string, Answer>>, respuestas: readonly DuelAnswer[]): Evaluation => {
  const { final } = recorrer(answers, respuestas);
  if (final.kind !== "result") throw new Error(`se esperaba un resultado y llego ${final.kind}`);
  return final.evaluation;
};

/** vj 62 y ti 51 tras las 14: diferencia de 11, sin desempate. */
const DIFERENCIA_11: Record<string, Answer> = {
  q01: "bottom", q02: "bottom", q03: "top", q04: "me_encantaria", q05: "top", q06: "both",
  q07: "bottom", q08: "bastante", q09: "top", q10: "bottom", q11: "top", q12: "nada",
  q13: "none", q14: "un_poco",
};

/** sw 49 y ti 44 tras las 14; con «top» en tb-sw-ti-1 quedan 52,5 y 41,67 (10,83). */
const DIEZ_83: Record<string, Answer> = {
  q01: "top", q02: "both", q03: "both", q04: "me_encantaria", q05: "bottom", q06: "top",
  q07: "both", q08: "nada", q09: "none", q10: "none", q11: "top", q12: "nada",
  q13: "none", q14: "nada",
};

/**
 * ti 45, si 41, vj 41 y sw 35 tras las 14. Con «none» en tb-ti-si-1 quedan
 * ti 39,17 y si 37,5, y vj (41) pasa a las dos; el par sigue a 1,67.
 */
const TERCERA_PASA: Record<string, Answer> = {
  q01: "top", q02: "none", q03: "bottom", q04: "un_poco", q05: "none", q06: "bottom",
  q07: "both", q08: "bastante", q09: "bottom", q10: "both", q11: "bottom", q12: "bastante",
  q13: "both", q14: "nada",
};

describe("afinidad exacta (RS-BE-40)", () => {
  test("S y U son enteros e iguales a 210·A y 210·D para todo h, n y e", () => {
    for (const n of [5, 6, 7]) {
      for (let h = 0; h <= 2 * n; h++) {
        for (let e = 0; e <= 3; e++) {
          const { S, U } = scoreOf(h, n, e);
          expect(Number.isInteger(S)).toBe(true);
          expect(Number.isInteger(U)).toBe(true);
          // 210·A = 210·(35h/n + 10e) y 210·D = 210·(50h/n), comparadas en enteros.
          expect(S * n).toBe(210 * 35 * h + 210 * 10 * e * n);
          expect(U * n).toBe(210 * 50 * h);
        }
      }
    }
  });

  test("un numero de duelos fuera de 5, 6 o 7 que no divide exacto es un error", () => {
    expect(() => scoreOf(1, 4, 0)).toThrow();
  });

  test("el redondeo lleva el medio hacia arriba: 17,5 se muestra como 18", () => {
    expect(roundAffinity(17.5 * 210)).toBe(18);
    expect(roundAffinity(17.4 * 210)).toBe(17);
    expect(roundAffinity(0)).toBe(0);
    expect(roundAffinity(100 * 210)).toBe(100);
  });
});

describe("orden (RS-BE-40)", () => {
  const s = (S: number, U: number, e: number): Score => ({ S, U, e });

  test("S descendente manda", () => {
    expect(rankKeys({ sw: s(1, 0, 0), ti: s(4, 0, 0), si: s(3, 0, 0), vj: s(2, 0, 0) })).toEqual([
      "ti", "si", "vj", "sw",
    ]);
  });

  test("con la misma S decide U, luego e y por ultimo el orden fijo", () => {
    expect(rankKeys({ sw: s(9, 1, 0), ti: s(9, 2, 0), si: s(9, 2, 1), vj: s(9, 2, 1) })).toEqual([
      "si", "vj", "ti", "sw",
    ]);
  });
});

describe("desempates (RS-BE-41)", () => {
  test("una diferencia de 10 exacta pide el desempate 1 del par, con la linea first", () => {
    // ejemplo-2: si 79 y vj 69 tras las 14.
    const { pedidos, lineas } = recorrer(ejemplo("ejemplo-2").answers, ["bottom", "top"]);
    expect(pedidos).toEqual(["tb-si-vj-1", "tb-si-vj-2"]);
    expect(lineas).toEqual(["first", "second"]);
  });

  test("una diferencia de 11 no pide desempate", () => {
    const { pedidos, final } = recorrer(DIFERENCIA_11, []);
    expect(pedidos).toEqual([]);
    expect(final.kind).toBe("result");
  });

  test("10,83 tras el primer desempate ya no pide el segundo", () => {
    const { pedidos } = recorrer(DIEZ_83, ["top"]);
    expect(pedidos).toEqual(["tb-sw-ti-1"]);
    const ev = evaluacion(DIEZ_83, ["top"]);
    expect(ev.scores.sw.S - ev.scores.ti.S).toBe(2275); // 10,83 · 210
  });

  test("el segundo desempate se mide en el par aunque una tercera lo pase", () => {
    const tras1 = scores(
      tally(c, TERCERA_PASA, [{ tiebreaker: c.tiebreakers.find((t) => t.id === "tb-ti-si-1")!, answer: "none" }]),
    );
    expect(rankKeys(tras1)[0]).toBe("vj");
    const { pedidos } = recorrer(TERCERA_PASA, ["none", "top"]);
    expect(pedidos).toEqual(["tb-ti-si-1", "tb-ti-si-2"]);
  });

  test("no hay tercer desempate aunque la diferencia siga en 10 o menos", () => {
    // ejemplo-2 termina a 10 exactos (vj 75, si 65) tras el segundo desempate.
    const ev = evaluacion(ejemplo("ejemplo-2").answers, ["bottom", "top"]);
    expect(ev.shown).toHaveLength(2);
    expect(ev.scores.vj.S - ev.scores.si.S).toBe(2100);
  });

  test("un desempate que no toca, con otro id o de mas es mismatch con el id esperado", () => {
    const a = ejemplo("ejemplo-2").answers;
    expect(evaluateAnswers(c, a, [{ id: "tb-sw-ti-1", answer: "top" }])).toEqual({
      kind: "mismatch", expected: "tb-si-vj-1",
    });
    expect(evaluateAnswers(c, a, [
      { id: "tb-si-vj-1", answer: "bottom" }, { id: "tb-si-vj-1", answer: "top" },
    ])).toEqual({ kind: "mismatch", expected: "tb-si-vj-2" });
    expect(evaluateAnswers(c, ejemplo("ejemplo-1").answers, [{ id: "tb-sw-si-1", answer: "top" }])).toEqual({
      kind: "mismatch", expected: null,
    });
    expect(evaluateAnswers(c, a, [
      { id: "tb-si-vj-1", answer: "bottom" },
      { id: "tb-si-vj-2", answer: "top" },
      { id: "tb-si-vj-2", answer: "top" },
    ])).toEqual({ kind: "mismatch", expected: null });
  });

  test("la misma entrada da siempre el mismo paso y el mismo ranking", () => {
    const a = ejemplo("ejemplo-3").answers;
    const r = [{ id: "tb-sw-ti-1", answer: "bottom" as const }];
    expect(evaluateAnswers(c, a, r)).toEqual(evaluateAnswers(c, a, r));
  });
});

describe("motivo con plantillas (RS-BE-42)", () => {
  test("los puntos van con coma decimal: 4 y 3,5", () => {
    expect(formatPoints(8)).toBe("4");
    expect(formatPoints(7)).toBe("3,5");
    expect(formatPoints(0)).toBe("0");
  });

  test("cada plantilla main se alcanza al menos una vez en los ejemplos", () => {
    const usadas = new Set(
      c.weights.examples.flatMap((e) => {
        const ev = evaluacion(e.answers, e.tiebreakAnswers);
        const m = buildTemplateReason(c, e.answers, ev).main;
        return m ? [m] : [];
      }),
    );
    expect([...usadas].sort()).toEqual(
      ["duelsOverScale", "general", "low", "noMainPoints", "scaleOverDuels", "strong"],
    );
  });

  test("con empate se usa solo la plantilla tie", () => {
    const e = ejemplo("ejemplo-8");
    const motivo = buildTemplateReason(c, e.answers, evaluacion(e.answers, e.tiebreakAnswers));
    expect(motivo.used).toEqual(["tie"]);
    expect(motivo.main).toBeNull();
  });

  test("{electivos} no repite un curso aunque dos tareas lo compartan", () => {
    const e = ejemplo("ejemplo-2");
    const motivo = buildTemplateReason(c, e.answers, evaluacion(e.answers, e.tiebreakAnswers));
    expect(motivo.text.match(/«Proyecto de Videojuegos»/g)).toHaveLength(1);
  });

  test("una llave sin reemplazar es un error de la implementacion", () => {
    expect(() => fillTemplate("Hola {nadie}.", {})).toThrow();
  });
});

describe("lineas de Ulises del resultado (RS-BE-42)", () => {
  const lineas = c.ulisesLines;

  test("titular winner con afinidad de 50 o mas, y resolved tras un desempate", () => {
    const e = ejemplo("ejemplo-2");
    const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
    expect(u.headline).toBe("Lo tuyo apunta a Desarrollo de Videojuegos, con 75 % de afinidad.");
    expect(u.tiebreakOutcome).toBe(lineas.tiebreak.resolved);
  });

  test("titular low con afinidad menor que 50", () => {
    const e = ejemplo("ejemplo-4");
    const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
    expect(u.headline).toBe(
      "Esta vez ninguna despegó del todo. Por ahora, Tecnologías de la Información va adelante, con 20 %.",
    );
  });

  test("con empate el titular es tie y el desenlace stillTied", () => {
    const e = ejemplo("ejemplo-8");
    const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
    expect(u.headline).toBe(
      "Empate. Ingeniería de Software y Tecnologías de la Información quedaron igualitas, con 60 %.",
    );
    expect(u.tiebreakOutcome).toBe(lineas.tiebreak.stillTied);
  });

  test("empate con afinidad menor que 50: manda tie y no low", () => {
    // TERCERA_PASA con «bottom» y «bottom»: ti y si terminan en 45 exactos.
    const ev = evaluacion(TERCERA_PASA, ["bottom", "bottom"]);
    expect(ev.tie).toBe(true);
    expect(ev.scores.ti.S).toBeLessThan(50 * 210);
    expect(buildResultUlises(c, ev).headline).toBe(
      "Empate. Tecnologías de la Información y Sistemas de Información quedaron igualitas, con 45 %.",
    );
  });

  test("sin desempate no hay desenlace", () => {
    const e = ejemplo("ejemplo-1");
    expect(buildResultUlises(c, evaluacion(e.answers, [])).tiebreakOutcome).toBeNull();
  });

  test("closing y retake van en todo resultado y la linea second de Ulises en ninguno", () => {
    const segunda = lineas.result.second.split("{")[0]!;
    for (const e of c.weights.examples) {
      const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
      expect(u.intro).toBe(lineas.result.intro);
      expect(u.closing).toBe(lineas.result.closing);
      expect(u.retake).toBe(lineas.result.retake);
      for (const texto of Object.values(u)) {
        if (texto) expect(texto.startsWith(segunda)).toBe(false);
      }
    }
  });
});
