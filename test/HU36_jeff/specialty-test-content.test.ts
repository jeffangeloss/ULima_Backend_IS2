import { describe, expect, test } from "bun:test";
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import {
  DUELS_PER_SPECIALTY, DUELS_WEIGHT_TENTHS, HALF_POINTS, MAX_TIEBREAKS, SCALE_MAX, SCALE_VALUE,
  SCALE_WEIGHT_TENTHS, TIEBREAK_THRESHOLD, evaluateAnswers, roundAffinity,
} from "../../src/modules/specialty-test/specialty-test.logic.js";
import {
  MAIN_ORDER, TEMPLATE_CONDITIONS, TIEBREAK_TEMPLATE_ORDER, buildTemplateReason,
} from "../../src/modules/specialty-test/specialty-test.templates.js";
import type {
  ContentTask,
  DuelAnswer,
  SpecialtyTestContent,
} from "../../src/modules/specialty-test/specialty-test.types.js";
import {
  DUEL_ANSWERS,
  SCALE_ANSWERS,
  SPECIALTY_KEYS,
} from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-37: cada versión del registro cumple las invariantes del contenido.
 *
 * Recorre TODAS las versiones de `CONTENT_BY_VERSION`, así que una versión
 * nueva entra sola a esta prueba. La comprobación de los íconos contra la
 * lista de `lucide_icons_flutter` 3.1.15 queda en `generar.py` (decisión 8):
 * aquí solo la forma, el camelCase y que ningún nombre se repita.
 */

const VERSION = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const camel = (kebab: string): string =>
  kebab.split("-").map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");

/** Las 48 tareas de una versión: 20 de duelo, 4 de escala y 24 de desempate. */
const tareas = (c: SpecialtyTestContent): Array<{ donde: string; tarea: ContentTask }> => [
  ...c.questions.flatMap((q) =>
    q.type === "duel"
      ? [{ donde: `${q.id}.top`, tarea: q.top }, { donde: `${q.id}.bottom`, tarea: q.bottom }]
      : [{ donde: `${q.id}.task`, tarea: q.task }],
  ),
  ...c.tiebreakers.flatMap((t) => [
    { donde: `${t.id}.top`, tarea: t.top },
    { donde: `${t.id}.bottom`, tarea: t.bottom },
  ]),
];

describe("registro de versiones (RS-BE-37)", () => {
  test("la vigente es la 2026-09-25.4 y esta en el registro", () => {
    expect(CURRENT_VERSION).toBe("2026-09-25.4");
    expect(CONTENT_BY_VERSION.has(CURRENT_VERSION)).toBe(true);
  });

  test("ni la .2 ni la .3 entran al registro, porque ningun alumno las recibe", () => {
    expect([...CONTENT_BY_VERSION.keys()]).toEqual(["2026-09-25.4"]);
  });
});

/**
 * RS-BE-37: el registro importa cada JSON de forma estática, sin leer el disco
 * en tiempo de ejecución, y el arranque del servidor llega a ese import sin
 * rodeos. Es un guardia que pasa desde el primer día y solo lee el código.
 *
 * El empaquetado de Vercel sigue los `import` para decidir qué archivos sube,
 * así que un JSON leído del disco o importado con `import()` puede quedar
 * fuera. Con la cadena estática, un JSON que falte impide arrancar la función
 * (ERR_MODULE_NOT_FOUND), y por eso un `401 MISSING_TOKEN` de
 * `GET /specialty-test/content` sin token, que no llega a la base, basta en la
 * vista previa para saber que el contenido entró en el paquete.
 */
const CARPETA_CONTENIDO = "src/modules/specialty-test/content";

/** El código sin comentarios: la cabecera del registro explica que no lee el disco. */
const sinComentarios = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const codigoDe = async (ruta: string): Promise<string> => sinComentarios(await Bun.file(ruta).text());

/** Un `import` de valor, no `import type`, que TypeScript borra al compilar. */
const importaDeValor = (desde: string): RegExp =>
  new RegExp(`^import (?!type\\b)[^;]+ from "${desde.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}";$`, "m");

const JSON_DEL_REGISTRO: string[] = [];
for await (const nombre of new Bun.Glob("*.json").scan(CARPETA_CONTENIDO)) {
  JSON_DEL_REGISTRO.push(nombre);
}
JSON_DEL_REGISTRO.sort();

describe("el registro entra al paquete de Vercel (RS-BE-37)", () => {
  test("la carpeta del contenido tiene un JSON por version registrada", () => {
    expect(JSON_DEL_REGISTRO).toEqual([...CONTENT_BY_VERSION.keys()].map((v) => `${v}.json`).sort());
  });

  test("cada JSON se importa de forma estatica con el atributo type json", async () => {
    const registro = await codigoDe(`${CARPETA_CONTENIDO}/index.ts`);
    const importsJson = registro.match(/^import .+\.json".*$/gm) ?? [];
    expect(importsJson).toHaveLength(JSON_DEL_REGISTRO.length);
    for (const nombre of JSON_DEL_REGISTRO) {
      const esperado = new RegExp(
        `^import \\w+ from "\\./${nombre.replace(/\./g, "\\.")}" with \\{ type: "json" \\};$`,
        "m",
      );
      expect(registro).toMatch(esperado);
    }
  });

  test("el registro no lee el disco ni importa en tiempo de ejecucion", async () => {
    const registro = await codigoDe(`${CARPETA_CONTENIDO}/index.ts`);
    for (const prohibido of [/\bimport\s*\(/, /\brequire\s*\(/, /readFile/, /Bun\.file/, /from "(node:)?fs/]) {
      expect(registro).not.toMatch(prohibido);
    }
  });

  test("el arranque llega al registro con imports de valor", async () => {
    expect(await codigoDe("src/server.ts")).toMatch(importaDeValor("./modules/index.js"));
    expect(await codigoDe("src/modules/index.ts")).toMatch(importaDeValor("./specialty-test/index.js"));
    expect(await codigoDe("src/modules/specialty-test/index.ts")).toMatch(importaDeValor("./content/index.js"));
  });
});

for (const [clave, c] of CONTENT_BY_VERSION) {
  describe(`contenido ${clave} (RS-BE-37)`, () => {
    test("la version tiene la forma AAAA-MM-DD.N y coincide con su clave en el registro", () => {
      expect(clave).toMatch(VERSION);
      expect(c.version).toBe(clave);
    });

    test("las cuatro especialidades con sus claves en el orden fijo", () => {
      expect(c.specialties.map((s) => s.key)).toEqual([...SPECIALTY_KEYS]);
    });

    test("14 preguntas q01 a q14 en orden, 10 duelos y 4 escalas", () => {
      expect(c.questions.map((q) => q.id)).toEqual(
        Array.from({ length: 14 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`),
      );
      expect(c.questions.map((q) => q.n)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
      expect(c.questions.filter((q) => q.type === "duel")).toHaveLength(10);
      expect(c.questions.filter((q) => q.type === "scale")).toHaveLength(4);
    });

    test("cada especialidad sale en exactamente 5 duelos y tiene una sola escala", () => {
      for (const k of SPECIALTY_KEYS) {
        const duelos = c.questions.filter(
          (q) => q.type === "duel" && (q.top.specialty === k || q.bottom.specialty === k),
        );
        const escalas = c.questions.filter((q) => q.type === "scale" && q.task.specialty === k);
        expect(duelos).toHaveLength(5);
        expect(escalas).toHaveLength(1);
      }
    });

    test("los dos lados de cada duelo son de especialidades distintas", () => {
      for (const q of c.questions) {
        if (q.type === "duel") expect(q.top.specialty).not.toBe(q.bottom.specialty);
      }
    });

    test("12 desempates, dos por par, con id tb-a-b-orden y las dos del par a los lados", () => {
      expect(c.tiebreakers).toHaveLength(12);
      for (let i = 0; i < SPECIALTY_KEYS.length; i++) {
        for (let j = i + 1; j < SPECIALTY_KEYS.length; j++) {
          const [a, b] = [SPECIALTY_KEYS[i]!, SPECIALTY_KEYS[j]!];
          const delPar = c.tiebreakers.filter((t) => t.pair[0] === a && t.pair[1] === b);
          expect(delPar.map((t) => t.order).sort()).toEqual([1, 2]);
          for (const t of delPar) {
            expect(t.id).toBe(`tb-${a}-${b}-${t.order}`);
            expect([t.top.specialty, t.bottom.specialty].sort()).toEqual([a, b].sort());
          }
        }
      }
    });

    test("cada tarea tiene de 6 a 14 palabras, resumen, icono y electivos de su especialidad", () => {
      const electivosDe = new Map(c.specialties.map((s) => [s.key, new Set(s.electives.map((e) => e.code))]));
      const todas = tareas(c);
      expect(todas).toHaveLength(48);
      for (const { donde, tarea } of todas) {
        const palabras = tarea.text.trim().split(/\s+/).length;
        expect({ donde, ok: palabras >= 6 && palabras <= 14 }).toEqual({ donde, ok: true });
        expect(tarea.summary.length).toBeGreaterThan(0);
        expect(tarea.electives.length).toBeGreaterThan(0);
        for (const codigo of tarea.electives) {
          expect({ donde, codigo, ok: electivosDe.get(tarea.specialty)!.has(codigo) }).toEqual({
            donde, codigo, ok: true,
          });
        }
        for (const signo of [":", "—", "–"]) {
          expect(tarea.text).not.toContain(signo);
          expect(tarea.summary).not.toContain(signo);
        }
      }
    });

    test("el icono de cada tarea es { lucide, flutter } con flutter igual al camelCase", () => {
      for (const { donde, tarea } of tareas(c)) {
        expect(Object.keys(tarea.icon).sort()).toEqual(["flutter", "lucide"]);
        expect({ donde, lucide: tarea.icon.lucide }).toEqual({ donde, lucide: expect.stringMatching(KEBAB) });
        expect(tarea.icon.flutter).toBe(`LucideIcons.${camel(tarea.icon.lucide)}`);
      }
    });

    test("ninguna tarea usa el icono de una especialidad ni repite el de otra tarea", () => {
      const deEspecialidad = new Set(c.specialties.map((s) => s.icon.lucide));
      const vistos = new Set<string>();
      for (const { donde, tarea } of tareas(c)) {
        expect({ donde, deEspecialidad: deEspecialidad.has(tarea.icon.lucide) }).toEqual({
          donde, deEspecialidad: false,
        });
        expect({ donde, repetido: vistos.has(tarea.icon.lucide) }).toEqual({ donde, repetido: false });
        vistos.add(tarea.icon.lucide);
      }
      expect(vistos.size).toBe(48);
    });

    test("el icono de cada especialidad tambien tiene la forma { lucide, flutter }", () => {
      for (const s of c.specialties) {
        expect(s.icon.lucide).toMatch(KEBAB);
        expect(s.icon.flutter).toBe(`LucideIcons.${camel(s.icon.lucide)}`);
      }
    });

    test("las opciones del duelo y de la escala son las de la spec, con sus valores", () => {
      expect(c.meta.duelOptions.map((o) => o.id)).toEqual([...DUEL_ANSWERS]);
      expect(c.weights.scale.options.map((o) => [o.id, o.value])).toEqual(
        SCALE_ANSWERS.map((id, valor) => [id, valor]),
      );
    });
  });
}

// ── Pesos, plantillas y ejemplos contra la lógica del módulo ────────────────

/** Variables que cada grupo de plantillas puede usar (RS-BE-42). */
const VARIABLES = new Set([
  "nombre", "afinidad", "puntos", "duelos", "tareas", "escalaTarea", "escalaRespuesta",
  "rival", "tareaDesempate", "segunda", "afinidadSegunda", "electivos",
]);
const VARIABLES_DEL_EMPATE = new Set(["a", "b", "puntosA", "duelosA", "puntosB", "duelosB"]);
const VARIABLES_DE_ULISES = new Set(["nombre", "afinidad", "segunda", "afinidadSegunda", "a", "b"]);

const variablesDe = (texto: string): string[] => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);

for (const [clave, c] of CONTENT_BY_VERSION) {
  describe(`contenido ${clave} contra la logica (RS-BE-37, RS-BE-40 a RS-BE-42)`, () => {
    test("los pesos y el umbral del archivo son las constantes del modulo", () => {
      const w = c.weights;
      expect([w.duel.pick * 2, w.duel.both * 2, w.duel.none * 2]).toEqual([
        HALF_POINTS.pick, HALF_POINTS.both, HALF_POINTS.none,
      ]);
      expect(w.duel.duelsPerSpecialty).toBe(DUELS_PER_SPECIALTY);
      expect(w.scale.max).toBe(SCALE_MAX);
      expect(Object.fromEntries(w.scale.options.map((o) => [o.id, o.value]))).toEqual(SCALE_VALUE);
      expect([w.affinity.duelsWeight * 10, w.affinity.scaleWeight * 10]).toEqual([
        DUELS_WEIGHT_TENTHS, SCALE_WEIGHT_TENTHS,
      ]);
      expect(w.tiebreak.threshold).toBe(TIEBREAK_THRESHOLD);
      expect(w.tiebreak.maxDuels).toBe(MAX_TIEBREAKS);
    });

    test("las condiciones y el orden de las plantillas son los del modulo", () => {
      const t = c.reasonTemplates;
      expect(t.main.map((p) => p.id)).toEqual([...MAIN_ORDER]);
      expect(t.tiebreak.map((p) => p.id)).toEqual([...TIEBREAK_TEMPLATE_ORDER]);
      expect(t.second.map((p) => p.id)).toEqual(["second"]);
      expect(t.electives.map((p) => p.id)).toEqual(["electives"]);
      expect(t.tie.map((p) => p.id)).toEqual(["tie"]);
      for (const p of [...t.main, ...t.tiebreak, ...t.second, ...t.electives, ...t.tie]) {
        expect({ id: p.id, when: p.when }).toEqual({
          id: p.id,
          when: TEMPLATE_CONDITIONS[p.id as keyof typeof TEMPLATE_CONDITIONS],
        });
      }
    });

    test("las plantillas y las lineas de Ulises solo usan variables conocidas", () => {
      const t = c.reasonTemplates;
      for (const p of [...t.main, ...t.tiebreak, ...t.second, ...t.electives]) {
        for (const v of variablesDe(p.text)) expect({ id: p.id, v, ok: VARIABLES.has(v) }).toEqual({ id: p.id, v, ok: true });
      }
      for (const v of variablesDe(t.tie[0]!.text)) expect(VARIABLES_DEL_EMPATE.has(v)).toBe(true);
      const r = c.ulisesLines.result;
      for (const linea of [r.winner, r.low, r.tie, r.second]) {
        for (const v of variablesDe(linea)) expect(VARIABLES_DE_ULISES.has(v)).toBe(true);
      }
    });

    for (const ej of c.weights.examples) {
      test(`${ej.id} reproduce ranking, afinidades, empate, desempates, plantillas y motivo`, () => {
        const recibidos: Array<{ id: string; answer: DuelAnswer }> = [];
        let paso = evaluateAnswers(c, ej.answers, recibidos);
        while (paso.kind === "tiebreak") {
          const respuesta = ej.tiebreakAnswers[recibidos.length];
          expect(respuesta).toBeDefined();
          recibidos.push({ id: paso.tiebreaker.id, answer: respuesta! });
          paso = evaluateAnswers(c, ej.answers, recibidos);
        }
        expect(paso.kind).toBe("result");
        if (paso.kind !== "result") return;
        const ev = paso.evaluation;
        const motivo = buildTemplateReason(c, ej.answers, ev);

        expect(recibidos).toHaveLength(ej.tiebreakAnswers.length);
        expect(ev.ranking).toEqual(ej.result.ranking);
        expect(Object.fromEntries(SPECIALTY_KEYS.map((k) => [k, roundAffinity(ev.scores[k].S)]))).toEqual(
          ej.result.display,
        );
        expect(ev.tie).toBe(ej.result.tie);
        expect(motivo.used).toEqual(ej.reasonTemplatesUsed);
        expect(motivo.text).toBe(ej.reasonText);
      });
    }
  });
}
