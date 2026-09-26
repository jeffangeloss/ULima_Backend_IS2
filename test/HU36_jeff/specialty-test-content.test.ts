import { describe, expect, test } from "bun:test";
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import type {
  ContentTask,
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
