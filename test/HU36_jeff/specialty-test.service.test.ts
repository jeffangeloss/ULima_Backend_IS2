import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import {
  CONTENT_BY_VERSION,
  CONTENT_REGISTRY,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import type { CohereChat } from "../../src/modules/specialty-test/specialty-test.reason.js";
import type { SpecialtyTestRepository } from "../../src/modules/specialty-test/specialty-test.repository.js";
import {
  evaluateBodySchema,
  type EvaluateBody,
} from "../../src/modules/specialty-test/specialty-test.schemas.js";
import { SpecialtyTestService } from "../../src/modules/specialty-test/specialty-test.service.js";
import type {
  ContentRegistry,
  StoredRankingEntry,
  StoredResult,
} from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-38, RS-BE-39, RS-BE-41, RS-BE-44 y RS-BE-45 en el service, con un
 * repositorio y un cliente de Cohere falsos que anotan cada llamada en una
 * sola lista, para poder exigir el orden (guardar antes de Cohere, validar
 * antes de consultar).
 *
 * Datos INVENTADOS: el alumno sintético 20230001 tiene `student.id` 42 y su
 * carrera es la 3. Los ids de especialidad 1, 5, 6 y 7 son ilustrativos.
 */

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const ALUMNO = 42;
const FECHA = "2026-09-25T20:15:00.000Z";
const ejemplo = (id: string) => c.weights.examples.find((e) => e.id === id)!;

/** Las cuatro activas de la carrera, con los nombres escritos distinto a propósito. */
const ACTIVAS = [
  { id: 1, name: "  INGENIERIA DE SOFTWARE " },
  { id: 5, name: "tecnologías de la información" },
  { id: 6, name: "Sistemas de Informacion" },
  { id: 7, name: "Desarrollo de Videojuegos" },
];

/** El motivo que el Cohere falso devuelve para el ejemplo-2; cumple las siete reglas. */
const MOTIVO_IA =
  "Desarrollo de Videojuegos va contigo porque elegiste diseñar niveles que se ponen difíciles poco a poco. " +
  "Con Sistemas de Información estuvo parejo, y en el desempate te quedaste con escribir finales distintos. " +
  "Mira cursos como «Storytelling» y «Proyecto de Videojuegos».";

interface Opciones {
  alumno?: boolean;
  activas?: Array<{ id: number; name: string }>;
  fila?: StoredResult | null;
  guardadoFalla?: boolean;
  cohere?: () => Promise<string>;
  registro?: ContentRegistry;
}

const armar = (opciones: Opciones = {}) => {
  const llamadas: string[] = [];
  const guardados: Array<{ studentId: number; version: string; ranking: StoredRankingEntry[]; isTie: boolean }> = [];
  const repo = {
    findStudentCareer: async (studentId: number) => {
      llamadas.push(`findStudentCareer:${studentId}`);
      return opciones.alumno === false ? null : { careerId: 3 };
    },
    findActiveSpecialties: async (careerId: number) => {
      llamadas.push(`findActiveSpecialties:${careerId}`);
      return opciones.activas ?? ACTIVAS;
    },
    saveResult: async (studentId: number, version: string, ranking: StoredRankingEntry[], isTie: boolean) => {
      llamadas.push("saveResult");
      if (opciones.guardadoFalla) throw new Error("fallo de la base");
      guardados.push({ studentId, version, ranking, isTie });
      return { completedAt: FECHA };
    },
    findResult: async () => {
      llamadas.push("findResult");
      return opciones.fila ?? null;
    },
  } as unknown as SpecialtyTestRepository;
  const cohere: CohereChat = {
    chatWithHistory: async () => {
      llamadas.push("cohere");
      return (opciones.cohere ?? (async () => MOTIVO_IA))();
    },
  };
  const service = new SpecialtyTestService(repo, new EventBus(), cohere, opciones.registro ?? CONTENT_REGISTRY);
  return { service, llamadas, guardados };
};

const cuerpo = (id: string, tiebreakAnswers: EvaluateBody["tiebreakAnswers"] = []): EvaluateBody => ({
  version: CURRENT_VERSION,
  answers: { ...ejemplo(id).answers },
  tiebreakAnswers,
});

let avisos: ReturnType<typeof spyOn>;
beforeEach(() => {
  avisos = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  avisos.mockRestore();
});

describe("GET /specialty-test/content en el service (RS-BE-38)", () => {
  test("resuelve cada clave a su specialtyId por nombre, sin tildes, mayusculas ni espacios al borde", async () => {
    const { service, llamadas } = armar();
    const contenido = await service.getContent(ALUMNO);
    expect(contenido.specialties.map((s) => [s.key, s.specialtyId])).toEqual([
      ["sw", 1], ["ti", 5], ["si", 6], ["vj", 7],
    ]);
    expect(llamadas).toEqual([`findStudentCareer:${ALUMNO}`, "findActiveSpecialties:3"]);
  });

  test("viaja lo que la app necesita, con los campos del contrato", async () => {
    const contenido = await armar().service.getContent(ALUMNO);
    expect(Object.keys(contenido)).toEqual(["version", "specialties", "ulises", "duelOptions", "scaleOptions", "questions"]);
    expect(contenido.version).toBe(CURRENT_VERSION);
    expect(Object.keys(contenido.specialties[0]!)).toEqual([
      "key", "specialtyId", "name", "tagline", "color", "icon", "totalCredits", "electives",
    ]);
    expect(contenido.specialties[0]!.icon).toBe("code-xml");
    expect(Object.keys(contenido.specialties[0]!.electives[0]!)).toEqual([
      "code", "name", "shortName", "credits", "prerequisite",
    ]);
    expect(Object.keys(contenido.ulises)).toEqual([
      "welcome", "startButton", "duelHelp", "scaleHelp", "reactions", "loading",
    ]);
    expect(Object.keys(contenido.ulises.reactions)).toEqual(["pick", "both", "none", "scale"]);
    expect(contenido.ulises.loading).toBe(c.ulisesLines.result.loading);
    expect(contenido.duelOptions.map((o) => o.id)).toEqual(["top", "bottom", "both", "none"]);
    expect(contenido.scaleOptions).toEqual([
      { id: "nada", label: "Nada" }, { id: "un_poco", label: "Un poco" },
      { id: "bastante", label: "Bastante" }, { id: "me_encantaria", label: "Me encantaría" },
    ]);
    expect(contenido.questions).toHaveLength(14);
    expect(contenido.questions[0]).toEqual({
      id: "q01", n: 1, type: "duel", prompt: "¿Cuál harías con más ganas?",
      top: {
        id: "q01.top", specialty: "sw",
        text: "Programar la app con la que una bodega recibe pedidos del barrio",
        illustration: c.questions[0]!.type === "duel" ? c.questions[0]!.top.illustration : "",
        icon: "shopping-cart",
      },
      bottom: expect.objectContaining({ id: "q01.bottom", specialty: "si", icon: "shelving-unit" }),
      reaction: c.questions[0]!.type === "duel" ? c.questions[0]!.reaction : "",
    });
    expect(contenido.questions[3]).toMatchObject({
      id: "q04", n: 4, type: "scale", task: { id: "q04.task", specialty: "ti", icon: "drumstick" },
      blockClose: "Primer tramo listo. Van 4 de 14.",
    });
  });

  test("no viaja nada del calculo ni del motivo", async () => {
    const texto = JSON.stringify(await armar().service.getContent(ALUMNO));
    for (const prohibido of [
      "LucideIcons.", "summary", "electives\":[\"", "weights", "threshold", "reasonTemplates",
      "tiebreakers", "examples", "balance", "sources", "diplomaName", "sharedWith", "wordCount",
      c.ulisesLines.result.intro, c.ulisesLines.result.closing, c.ulisesLines.tiebreak.first,
      c.reasonTemplates.main[0]!.text,
    ]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  test("sin fila en student responde 404 USER_NOT_FOUND", async () => {
    await expect(armar({ alumno: false }).service.getContent(ALUMNO)).rejects.toMatchObject({
      statusCode: 404, code: "USER_NOT_FOUND",
    });
  });

  test("si falta una de las cuatro activas responde 404 SPECIALTY_TEST_NOT_AVAILABLE", async () => {
    const { service } = armar({ activas: ACTIVAS.filter((a) => a.id !== 6) });
    await expect(service.getContent(ALUMNO)).rejects.toMatchObject({
      statusCode: 404,
      code: "SPECIALTY_TEST_NOT_AVAILABLE",
      message: "El test de especialidad no está disponible para tu carrera.",
    });
  });
});

describe("POST /specialty-test/me/evaluate en el service (RS-BE-39)", () => {
  test("una version fuera del registro responde 409 con la vigente, sin consultar nada", async () => {
    const { service, llamadas } = armar();
    await expect(service.evaluate(ALUMNO, { ...cuerpo("ejemplo-1"), version: "2026-09-25.3", answers: {} })).rejects.toMatchObject({
      statusCode: 409,
      code: "SPECIALTY_TEST_VERSION_OUTDATED",
      message: "El test se actualizó. Vuelve a empezarlo.",
      details: { currentVersion: CURRENT_VERSION },
    });
    expect(llamadas).toEqual([]);
  });

  test("respuestas que faltan, de mas y del otro tipo, cada una en orden, antes de mirar al alumno", async () => {
    const { service, llamadas } = armar({ alumno: false });
    const answers: Record<string, string> = { ...ejemplo("ejemplo-1").answers };
    delete answers.q14;
    delete answers.q02;
    answers.q20 = "top";
    answers.q15 = "nada";
    answers.q04 = "top";
    answers.q01 = "bastante";
    await expect(service.evaluate(ALUMNO, { version: CURRENT_VERSION, answers: answers as EvaluateBody["answers"] })).rejects.toMatchObject({
      statusCode: 400,
      code: "SPECIALTY_TEST_INVALID_ANSWERS",
      message: "Las respuestas no corresponden a esta versión del test.",
      details: { missing: ["q02", "q14"], unexpected: ["q15", "q20"], invalid: ["q01", "q04"] },
    });
    expect(llamadas).toEqual([]);
  });

  test("con respuestas validas, un alumno sin fila da 404 USER_NOT_FOUND", async () => {
    await expect(armar({ alumno: false }).service.evaluate(ALUMNO, cuerpo("ejemplo-1"))).rejects.toMatchObject({
      statusCode: 404, code: "USER_NOT_FOUND",
    });
  });

  test("sin sus cuatro especialidades activas da 404 SPECIALTY_TEST_NOT_AVAILABLE y no guarda", async () => {
    const { service, llamadas } = armar({ activas: ACTIVAS.slice(0, 3) });
    await expect(service.evaluate(ALUMNO, cuerpo("ejemplo-1"))).rejects.toMatchObject({
      statusCode: 404, code: "SPECIALTY_TEST_NOT_AVAILABLE",
    });
    expect(llamadas).not.toContain("saveResult");
  });

  test("un desempate que no toca da 400 SPECIALTY_TEST_TIEBREAK_MISMATCH con el esperado", async () => {
    const { service, llamadas } = armar();
    await expect(
      service.evaluate(ALUMNO, cuerpo("ejemplo-2", [{ id: "tb-sw-ti-1", answer: "top" }])),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SPECIALTY_TEST_TIEBREAK_MISMATCH",
      message: "Los desempates enviados no son los que corresponden a estas respuestas.",
      details: { expected: "tb-si-vj-1" },
    });
    await expect(
      service.evaluate(ALUMNO, cuerpo("ejemplo-1", [{ id: "tb-sw-si-1", answer: "top" }])),
    ).rejects.toMatchObject({ details: { expected: null } });
    expect(llamadas).not.toContain("saveResult");
  });

  test("acepta cualquier version del registro y calcula con su contenido", async () => {
    const anterior = { ...c, version: "2026-09-24.1" };
    const registro: ContentRegistry = {
      currentVersion: CURRENT_VERSION,
      byVersion: new Map([[CURRENT_VERSION, c], ["2026-09-24.1", anterior]]),
    };
    const { service, guardados } = armar({ registro });
    const r = await service.evaluate(ALUMNO, { ...cuerpo("ejemplo-1"), version: "2026-09-24.1" });
    expect(r.status).toBe("result");
    if (r.status === "result") expect(r.result.version).toBe("2026-09-24.1");
    expect(guardados[0]!.version).toBe("2026-09-24.1");
  });
});

describe("paso de desempate (RS-BE-41)", () => {
  test("devuelve el desempate 1 con sus dos tareas y la linea first, sin guardar ni llamar a Cohere", async () => {
    const { service, llamadas } = armar();
    const r = await service.evaluate(ALUMNO, cuerpo("ejemplo-2"));
    expect(r).toEqual({
      status: "tiebreak",
      tiebreak: {
        id: "tb-si-vj-1",
        order: 1,
        prompt: "¿Cuál harías con más ganas?",
        top: expect.objectContaining({ id: "tb-si-vj-1.top", specialty: "si", icon: "soup" }),
        bottom: expect.objectContaining({ id: "tb-si-vj-1.bottom", specialty: "vj", icon: "map-pinned" }),
      },
      ulisesLine: c.ulisesLines.tiebreak.first,
    });
    if (r.status === "tiebreak") {
      expect(Object.keys(r.tiebreak.top)).toEqual(["id", "specialty", "text", "illustration", "icon"]);
    }
    expect(llamadas).not.toContain("saveResult");
    expect(llamadas).not.toContain("cohere");
  });

  test("el desempate 2 lleva la linea second", async () => {
    const r = await armar().service.evaluate(ALUMNO, cuerpo("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }]));
    expect(r).toMatchObject({ status: "tiebreak", tiebreak: { id: "tb-si-vj-2", order: 2 }, ulisesLine: c.ulisesLines.tiebreak.second });
  });
});

describe("resultado final (RS-BE-42 a RS-BE-44)", () => {
  const FINAL = () => cuerpo("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }, { id: "tb-si-vj-2", answer: "top" }]);

  test("guarda antes de llamar a Cohere y responde con el contrato", async () => {
    const { service, llamadas, guardados } = armar();
    const r = await service.evaluate(ALUMNO, FINAL());
    expect(llamadas).toEqual([`findStudentCareer:${ALUMNO}`, "findActiveSpecialties:3", "saveResult", "cohere"]);
    expect(guardados).toEqual([{
      studentId: ALUMNO,
      version: CURRENT_VERSION,
      ranking: [
        { key: "vj", specialtyId: 7, affinity: 75 },
        { key: "si", specialtyId: 6, affinity: 65 },
        { key: "ti", specialtyId: 5, affinity: 28 },
        { key: "sw", specialtyId: 1, affinity: 24 },
      ],
      isTie: false,
    }]);
    expect(r).toEqual({
      status: "result",
      result: {
        version: CURRENT_VERSION,
        completedAt: FECHA,
        tie: false,
        ranking: [
          { key: "vj", specialtyId: 7, name: "Desarrollo de Videojuegos", affinity: 75 },
          { key: "si", specialtyId: 6, name: "Sistemas de Información", affinity: 65 },
          { key: "ti", specialtyId: 5, name: "Tecnologías de la Información", affinity: 28 },
          { key: "sw", specialtyId: 1, name: "Ingeniería de Software", affinity: 24 },
        ],
        reason: MOTIVO_IA,
        reasonSource: "ai",
        ulises: {
          intro: "Ya tengo tu resultado.",
          headline: "Lo tuyo apunta a Desarrollo de Videojuegos, con 75 % de afinidad.",
          tiebreakOutcome: "Ahí está, ya se inclinó la balanza.",
          closing: c.ulisesLines.result.closing,
          retake: "Si más adelante cambias de idea, puedes volver a hacer el test.",
        },
      },
    });
  });

  test("si Cohere falla sale el motivo de las plantillas, sin error", async () => {
    const { service } = armar({ cohere: async () => { throw new TypeError("fetch failed"); } });
    const r = await service.evaluate(ALUMNO, FINAL());
    expect(r).toMatchObject({
      status: "result",
      result: { reason: ejemplo("ejemplo-2").reasonText, reasonSource: "templates" },
    });
  });

  test("si el guardado falla, el error sube y Cohere no se llama", async () => {
    const { service, llamadas } = armar({ guardadoFalla: true });
    await expect(service.evaluate(ALUMNO, FINAL())).rejects.toThrow("fallo de la base");
    expect(llamadas).not.toContain("cohere");
  });

  test("con empate guarda is_tie y responde tie con las lineas de empate", async () => {
    const { service, guardados } = armar({ cohere: async () => "" });
    const e = ejemplo("ejemplo-8");
    const r = await service.evaluate(ALUMNO, cuerpo("ejemplo-8", [
      { id: "tb-sw-ti-1", answer: e.tiebreakAnswers[0]! },
      { id: "tb-sw-ti-2", answer: e.tiebreakAnswers[1]! },
    ]));
    expect(guardados[0]!.isTie).toBe(true);
    expect(r).toMatchObject({
      status: "result",
      result: {
        tie: true,
        reason: e.reasonText,
        reasonSource: "templates",
        ulises: {
          headline: "Empate. Ingeniería de Software y Tecnologías de la Información quedaron igualitas, con 60 %.",
          tiebreakOutcome: c.ulisesLines.tiebreak.stillTied,
        },
      },
    });
  });

  test("el mismo cuerpo da el mismo ranking dos veces y guarda dos veces (una fila por upsert)", async () => {
    const { service, guardados } = armar();
    const r1 = await service.evaluate(ALUMNO, FINAL());
    const r2 = await service.evaluate(ALUMNO, FINAL());
    if (r1.status === "result" && r2.status === "result") expect(r1.result.ranking).toEqual(r2.result.ranking);
    expect(guardados).toHaveLength(2);
  });
});

describe("GET /specialty-test/me/result en el service (RS-BE-45)", () => {
  const FILA: StoredResult = {
    contentVersion: CURRENT_VERSION,
    ranking: [
      { key: "vj", specialtyId: 70, affinity: 75 },
      { key: "si", specialtyId: 60, affinity: 65 },
      { key: "ti", specialtyId: 50, affinity: 28 },
      { key: "sw", specialtyId: 10, affinity: 24 },
    ],
    isTie: false,
    completedAt: FECHA,
  };

  test("sin test terminado responde result null", async () => {
    expect(await armar().service.getResult(ALUMNO)).toEqual({ result: null });
  });

  test("con fila: nombres de la version vigente y el specialtyId guardado", async () => {
    expect(await armar({ fila: FILA }).service.getResult(ALUMNO)).toEqual({
      result: {
        version: CURRENT_VERSION,
        isCurrentVersion: true,
        completedAt: FECHA,
        tie: false,
        ranking: [
          { key: "vj", specialtyId: 70, name: "Desarrollo de Videojuegos", affinity: 75 },
          { key: "si", specialtyId: 60, name: "Sistemas de Información", affinity: 65 },
          { key: "ti", specialtyId: 50, name: "Tecnologías de la Información", affinity: 28 },
          { key: "sw", specialtyId: 10, name: "Ingeniería de Software", affinity: 24 },
        ],
      },
    });
  });

  test("isCurrentVersion es false con una version que ya no es la vigente", async () => {
    const r = await armar({ fila: { ...FILA, contentVersion: "2026-09-24.1" } }).service.getResult(ALUMNO);
    expect(r.result?.isCurrentVersion).toBe(false);
    expect(r.result?.version).toBe("2026-09-24.1");
  });

  test("404 USER_NOT_FOUND sin fila en student", async () => {
    await expect(armar({ alumno: false, fila: FILA }).service.getResult(ALUMNO)).rejects.toMatchObject({
      statusCode: 404, code: "USER_NOT_FOUND",
    });
  });

  test("404 SPECIALTY_TEST_NOT_AVAILABLE aunque haya fila guardada, y sin leerla", async () => {
    const { service, llamadas } = armar({ activas: [], fila: FILA });
    await expect(service.getResult(ALUMNO)).rejects.toMatchObject({
      statusCode: 404, code: "SPECIALTY_TEST_NOT_AVAILABLE",
    });
    expect(llamadas).not.toContain("findResult");
  });
});

describe("forma del cuerpo de la evaluacion (RS-BE-39, paso 3)", () => {
  test("tiebreakAnswers falta y vale [], y las claves de mas en la raiz se descartan", () => {
    const r = evaluateBodySchema.safeParse({
      version: CURRENT_VERSION, answers: { q01: "top" }, studentId: 99, extra: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ version: CURRENT_VERSION, answers: { q01: "top" }, tiebreakAnswers: [] });
  });

  test("version de hasta 20 caracteres con la forma AAAA-MM-DD.N", () => {
    for (const version of ["2026-09-25", "ultima", "2026-09-25.4 ", `2026-09-25.${"9".repeat(10)}`]) {
      expect(evaluateBodySchema.safeParse({ version, answers: {} }).success).toBe(false);
    }
    expect(evaluateBodySchema.safeParse({ version: "2026-09-25.12", answers: {} }).success).toBe(true);
  });

  test("answers con ids q y dos digitos, hasta 20 claves y valores conocidos", () => {
    const veinte = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${String(i).padStart(2, "0")}`, "top"]));
    const base = { version: CURRENT_VERSION };
    expect(evaluateBodySchema.safeParse({ ...base, answers: veinte }).success).toBe(true);
    expect(evaluateBodySchema.safeParse({ ...base, answers: { ...veinte, q99: "top" } }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, answers: { q1: "top" } }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, answers: { q01: "quizas" } }).success).toBe(false);
  });

  test("tiebreakAnswers de 0 a 2, con id de hasta 24 y respuesta de duelo", () => {
    const base = { version: CURRENT_VERSION, answers: {} };
    const uno = { id: "tb-si-vj-1", answer: "top" };
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [uno, uno] }).success).toBe(true);
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [uno, uno, uno] }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [{ id: "x".repeat(25), answer: "top" }] }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [{ id: "tb-si-vj-1", answer: "bastante" }] }).success).toBe(false);
  });
});
