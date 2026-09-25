import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import { TimeBlocksService } from "../../src/modules/time-blocks/time-blocks.service.js";
import type { TimeBlocksRepository } from "../../src/modules/time-blocks/time-blocks.repository.js";
import type {
  TimeBlockException,
  TimeBlockExceptionStatus,
  TimeBlockRule,
} from "../../src/modules/time-blocks/time-blocks.types.js";
import type { OwnTimeBlocksSummary } from "../../src/modules/time-blocks/index.js";

/**
 * RS-BE-35 (ajustada el 2026-09-25): la única puerta del chatbot a los bloques
 * es `readOwnTimeBlocksForAssistant(studentId, today)`, que delega en
 * `TimeBlocksService.assistantSummary`. Esta prueba fija, sin base y sin red,
 * que la función devuelve solo los bloques del alumno pedido aunque otro
 * alumno tenga bloques en la misma ventana, solo los campos que lista la spec,
 * las excepciones de la ventana y del patrón, y las mismas horas semanales que
 * `GET /time-blocks/me/occurrences` para esas dos semanas.
 *
 * El repositorio es un objeto en memoria que separa los datos por alumno, como
 * el SQL real (`where student_id = …`), y anota cada llamada con sus
 * argumentos para exigir que el `studentId` pedido baje a todas y que no haya
 * ninguna escritura.
 *
 * Datos INVENTADOS (el repo es público): el alumno sintético 20230001 tiene
 * `student.id` 7 y el 9 es «otro alumno». El bloque de prácticas y el de
 * voluntariado son los del ejemplo de BR-CB-24 de la spec del chatbot.
 *
 * Calendario 2026: 14-09, 21-09, 28-09 y 05-10 son lunes; 25-09 es viernes;
 * 27-09 y 04-10, domingos; 29-09 es martes; 30-09, miércoles; 03-10, sábado.
 * 28-12 es lunes y 10-01-2027, domingo.
 */

const ALUMNO = 7;
const OTRO_ALUMNO = 9;

/** Lunes y miércoles de 14:00 a 18:00, del 2026-09-01 al 2026-12-15. */
const PRACTICAS: TimeBlockRule = {
  id: 12,
  title: "Prácticas en empresa",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-01",
  endDate: "2026-12-15",
};

/** Sábados de 09:00 a 12:00, del 2026-10-03 al 2026-11-28: todavía no empieza. */
const VOLUNTARIADO: TimeBlockRule = {
  id: 15,
  title: "Voluntariado",
  colorHex: "#2E7D32",
  daysOfWeek: [6],
  startTime: "09:00",
  endTime: "12:00",
  startDate: "2026-10-03",
  endDate: "2026-11-28",
};

/** Vencido: termina el domingo anterior a la ventana. No entra. */
const VENCIDO: TimeBlockRule = {
  id: 3,
  title: "Curso de verano",
  colorHex: "#1565C0",
  daysOfWeek: [2, 4],
  startTime: "08:00",
  endTime: "10:00",
  startDate: "2026-01-05",
  endDate: "2026-09-20",
};

/** Del otro alumno, de lunes a viernes, dentro de la misma ventana. */
const TRABAJO_AJENO: TimeBlockRule = {
  id: 40,
  title: "Trabajo del otro alumno",
  colorHex: "#6A1B9A",
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "13:00",
  startDate: "2026-09-01",
  endDate: "2026-12-31",
};

const excepcion = (
  blockId: number,
  date: string,
  status: TimeBlockExceptionStatus,
  startTime: string | null = null,
  endTime: string | null = null,
): TimeBlockException => ({ blockId, date, status, startTime, endTime });

/** Las del ejemplo de BR-CB-24 y cuatro que no deben salir. */
const EXCEPCIONES_PRACTICAS: TimeBlockException[] = [
  // Antes de la ventana (lunes de la semana anterior).
  excepcion(12, "2026-09-14", "cancelled"),
  // Dentro de la ventana y del patrón: las dos que salen.
  excepcion(12, "2026-09-28", "moved", "15:00", "19:30"),
  excepcion(12, "2026-09-30", "cancelled"),
  // Dentro de la ventana pero fuera del patrón (martes): una fila vieja que
  // quedó de un PATCH que cambió los días (RS-BE-31).
  excepcion(12, "2026-09-29", "cancelled"),
  // Después de la ventana (lunes de la semana subsiguiente).
  excepcion(12, "2026-10-05", "moved", "16:00", "20:00"),
];

const EXCEPCIONES_AJENAS: TimeBlockException[] = [
  excepcion(40, "2026-09-22", "moved", "09:00", "14:00"),
];

type Llamada = { metodo: string; args: unknown[] };

/**
 * Repositorio falso que separa los bloques por alumno. `findExceptions`, como
 * el SQL real, solo devuelve excepciones de bloques del alumno pedido. Toda
 * escritura hace fallar la prueba: la función es de solo lectura.
 */
const armar = (datos: {
  bloques: Record<number, TimeBlockRule[]>;
  excepciones?: TimeBlockException[];
}) => {
  const llamadas: Llamada[] = [];
  const anota = (metodo: string, ...args: unknown[]) => llamadas.push({ metodo, args });
  const escritura = (metodo: string) => async (...args: unknown[]) => {
    anota(metodo, ...args);
    throw new Error(`la función del asistente no debe escribir (${metodo})`);
  };
  const bloquesDe = (studentId: number) => datos.bloques[studentId] ?? [];

  const repository = {
    findBlocks: async (studentId: number) => {
      anota("findBlocks", studentId);
      return bloquesDe(studentId).map((b) => ({ ...b, daysOfWeek: [...b.daysOfWeek] }));
    },
    findExceptions: async (studentId: number, blockIds: readonly number[]) => {
      anota("findExceptions", studentId, [...blockIds]);
      const propios = new Set(bloquesDe(studentId).map((b) => b.id));
      return (datos.excepciones ?? []).filter(
        (e) => propios.has(e.blockId) && blockIds.includes(e.blockId),
      );
    },
    findBlockOwnedBy: async (studentId: number, blockId: number) => {
      anota("findBlockOwnedBy", studentId, blockId);
      return null;
    },
    countBlocks: async (studentId: number) => {
      anota("countBlocks", studentId);
      return bloquesDe(studentId).length;
    },
    insertBlock: escritura("insertBlock"),
    updateBlock: escritura("updateBlock"),
    deleteBlock: escritura("deleteBlock"),
    upsertException: escritura("upsertException"),
    deleteException: escritura("deleteException"),
  } as unknown as TimeBlocksRepository;

  return { llamadas, service: new TimeBlocksService(repository, new EventBus()) };
};

/**
 * Corre `fn` con el huso del proceso en `zona` y lo deja como estaba. `bun test`
 * corre en UTC aunque `TZ` no esté definida, y borrar `TZ` devuelve el huso del
 * sistema, no el de la prueba. Por eso, como `time-blocks-expansion.test.ts`,
 * se fija de nuevo el huso que regía antes, por su nombre, en vez de borrarla.
 */
const conHuso = async <T>(zona: string, fn: () => Promise<T>): Promise<T> => {
  const antes = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = zona;
  try {
    return await fn();
  } finally {
    process.env.TZ = antes;
  }
};

/** Los dos alumnos con sus bloques; el del alumno trae además uno vencido. */
const ESCENARIO = {
  bloques: {
    [ALUMNO]: [VENCIDO, PRACTICAS, VOLUNTARIADO],
    [OTRO_ALUMNO]: [TRABAJO_AJENO],
  },
  excepciones: [...EXCEPCIONES_PRACTICAS, ...EXCEPCIONES_AJENAS],
};

describe("assistantSummary (RS-BE-35): el ejemplo de BR-CB-24", () => {
  test("devuelve la ventana, los bloques vigentes y futuros con sus cambios y las horas de las dos semanas", async () => {
    const { service } = armar(ESCENARIO);
    const resumen: OwnTimeBlocksSummary = await service.assistantSummary(ALUMNO, "2026-09-25");

    // toEqual exige los campos exactos: ni `id`, ni `colorHex`, ni `blockId`.
    expect(resumen).toEqual({
      window: { from: "2026-09-21", to: "2026-10-04" },
      blocks: [
        {
          title: "Prácticas en empresa",
          daysOfWeek: [1, 3],
          startTime: "14:00",
          endTime: "18:00",
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          exceptions: [
            { date: "2026-09-28", status: "moved", startTime: "15:00", endTime: "19:30" },
            { date: "2026-09-30", status: "cancelled", startTime: null, endTime: null },
          ],
        },
        {
          title: "Voluntariado",
          daysOfWeek: [6],
          startTime: "09:00",
          endTime: "12:00",
          startDate: "2026-10-03",
          endDate: "2026-11-28",
          exceptions: [],
        },
      ],
      // 4 h del lunes + 4 h del miércoles; 4.5 h del lunes movido, 0 h del
      // miércoles cancelado y 3 h del primer sábado del voluntariado.
      weeks: [
        { weekStart: "2026-09-21", hours: 8 },
        { weekStart: "2026-09-28", hours: 7.5 },
      ],
    });
  });

  test("ninguna clave técnica viaja: ni id, ni color, ni blockId, ni fechas de creación", async () => {
    const { service } = armar(ESCENARIO);
    const texto = JSON.stringify(await service.assistantSummary(ALUMNO, "2026-09-25"));
    for (const clave of ["\"id\"", "colorHex", "blockId", "createdAt", "updatedAt", "#F94B3F"]) {
      expect(texto).not.toContain(clave);
    }
  });

  test("las horas son las mismas que GET /time-blocks/me/occurrences para esas dos semanas (RS-BE-33 y RS-BE-34)", async () => {
    const { service } = armar(ESCENARIO);
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-25");
    const ocurrencias = await service.occurrences(ALUMNO, "2026-09-21", "2026-10-04");
    expect(resumen.weeks).toEqual(ocurrencias.weeks);
    expect(resumen.weeks).toHaveLength(2);
  });
});

describe("assistantSummary (RS-BE-35): solo del alumno pedido y solo lectura", () => {
  test("no trae los bloques ni las excepciones del otro alumno, aunque caigan en la misma ventana", async () => {
    const { service } = armar(ESCENARIO);
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-25");
    const texto = JSON.stringify(resumen);
    expect(texto).not.toContain("Trabajo del otro alumno");
    expect(texto).not.toContain("2026-09-22");
    expect(resumen.blocks.map((b) => b.title)).toEqual(["Prácticas en empresa", "Voluntariado"]);
    // Si sumara los bloques ajenos, la semana del 21 pasaría de 8 h a 33 h.
    expect(resumen.weeks[0]).toEqual({ weekStart: "2026-09-21", hours: 8 });
  });

  test("para el otro alumno devuelve solo lo suyo", async () => {
    const { service } = armar(ESCENARIO);
    const resumen = await service.assistantSummary(OTRO_ALUMNO, "2026-09-25");
    expect(resumen.blocks.map((b) => b.title)).toEqual(["Trabajo del otro alumno"]);
    expect(resumen.blocks[0]?.exceptions).toEqual([
      { date: "2026-09-22", status: "moved", startTime: "09:00", endTime: "14:00" },
    ]);
    expect(JSON.stringify(resumen)).not.toContain("Prácticas");
  });

  test("el studentId pedido baja a todas las consultas y solo hay lecturas", async () => {
    const { service, llamadas } = armar(ESCENARIO);
    await service.assistantSummary(ALUMNO, "2026-09-25");
    expect(llamadas.map((l) => l.metodo)).toEqual(["findBlocks", "findExceptions"]);
    for (const llamada of llamadas) expect(llamada.args[0]).toBe(ALUMNO);
  });

  test("las excepciones se piden solo para los bloques que entran (el vencido no)", async () => {
    const { service, llamadas } = armar(ESCENARIO);
    await service.assistantSummary(ALUMNO, "2026-09-25");
    const pedido = llamadas.find((l) => l.metodo === "findExceptions");
    expect(pedido?.args[1]).toEqual([PRACTICAS.id, VOLUNTARIADO.id]);
  });
});

describe("assistantSummary (RS-BE-35): la ventana y los bloques que entran", () => {
  test("un bloque vencido no entra; uno cuya endDate es justo el lunes de la ventana, sí", async () => {
    const hastaElLunes: TimeBlockRule = {
      ...VENCIDO,
      id: 4,
      title: "Taller de los lunes",
      daysOfWeek: [1],
      endDate: "2026-09-21",
    };
    const { service } = armar({ bloques: { [ALUMNO]: [VENCIDO, hastaElLunes] } });
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-25");
    expect(resumen.blocks.map((b) => b.title)).toEqual(["Taller de los lunes"]);
    // Suma su único lunes, de 08:00 a 10:00.
    expect(resumen.weeks).toEqual([
      { weekStart: "2026-09-21", hours: 2 },
      { weekStart: "2026-09-28", hours: 0 },
    ]);
  });

  test("conserva el orden de findBlocks", async () => {
    const { service } = armar({ bloques: { [ALUMNO]: [VOLUNTARIADO, PRACTICAS] } });
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-25");
    expect(resumen.blocks.map((b) => b.title)).toEqual(["Voluntariado", "Prácticas en empresa"]);
  });

  test("un domingo pertenece a la semana que empezó el lunes anterior", async () => {
    const { service } = armar({ bloques: { [ALUMNO]: [] } });
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-27");
    expect(resumen.window).toEqual({ from: "2026-09-21", to: "2026-10-04" });
  });

  test("un lunes abre la ventana ese mismo día", async () => {
    const { service } = armar({ bloques: { [ALUMNO]: [] } });
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-28");
    expect(resumen.window).toEqual({ from: "2026-09-28", to: "2026-10-11" });
  });

  test("la ventana cruza el cambio de año sin correrse de día", async () => {
    const { service } = armar({ bloques: { [ALUMNO]: [] } });
    const resumen = await service.assistantSummary(ALUMNO, "2026-12-30");
    expect(resumen.window).toEqual({ from: "2026-12-28", to: "2027-01-10" });
    expect(resumen.weeks.map((w) => w.weekStart)).toEqual(["2026-12-28", "2027-01-04"]);
  });

  test("la ventana, los cambios y las horas no dependen del huso del proceso (Lima es UTC-5)", async () => {
    const enUtc = await armar(ESCENARIO).service.assistantSummary(ALUMNO, "2026-09-25");
    for (const zona of ["America/Lima", "Pacific/Pago_Pago", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      const otro = await conHuso(zona, () => armar(ESCENARIO).service.assistantSummary(ALUMNO, "2026-09-25"));
      expect(otro).toEqual(enUtc);
    }
  });

  test("sin bloques: lista vacía y las dos semanas en 0 h, que es un total conocido", async () => {
    const { service, llamadas } = armar({ bloques: {} });
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-25");
    expect(resumen).toEqual({
      window: { from: "2026-09-21", to: "2026-10-04" },
      blocks: [],
      weeks: [
        { weekStart: "2026-09-21", hours: 0 },
        { weekStart: "2026-09-28", hours: 0 },
      ],
    });
    // Con cero bloques no hay excepciones que pedir.
    expect(llamadas.find((l) => l.metodo === "findExceptions")?.args[1] ?? []).toEqual([]);
  });

  test("las horas no se redondean: un lunes de 70 minutos por semana da 70/60 en cada una", async () => {
    const setenta: TimeBlockRule = {
      ...PRACTICAS,
      id: 30,
      title: "Tutoría",
      daysOfWeek: [1],
      startTime: "10:00",
      endTime: "11:10",
    };
    const { service } = armar({ bloques: { [ALUMNO]: [setenta] } });
    const resumen = await service.assistantSummary(ALUMNO, "2026-09-25");
    expect(resumen.weeks.map((w) => w.hours)).toEqual([70 / 60, 70 / 60]);
  });

  test("una fecha que no existe no arma ninguna ventana", async () => {
    const { service } = armar(ESCENARIO);
    await expect(service.assistantSummary(ALUMNO, "2026-02-30")).rejects.toThrow();
    await expect(service.assistantSummary(ALUMNO, "hoy")).rejects.toThrow();
  });
});

describe("readOwnTimeBlocksForAssistant (RS-BE-35): la puerta que exporta index.ts", () => {
  const espias: Array<{ mockRestore: () => void }> = [];
  afterEach(() => {
    for (const espia of espias.splice(0)) espia.mockRestore();
  });

  test("delega en TimeBlocksService.assistantSummary con el mismo alumno y la misma fecha", async () => {
    const esperado: OwnTimeBlocksSummary = {
      window: { from: "2026-09-21", to: "2026-10-04" },
      blocks: [],
      weeks: [
        { weekStart: "2026-09-21", hours: 0 },
        { weekStart: "2026-09-28", hours: 0 },
      ],
    };
    const espia = spyOn(TimeBlocksService.prototype, "assistantSummary").mockResolvedValue(esperado);
    espias.push(espia);

    const { readOwnTimeBlocksForAssistant } = await import("../../src/modules/time-blocks/index.js");
    expect(await readOwnTimeBlocksForAssistant(ALUMNO, "2026-09-25")).toBe(esperado);
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.mock.calls[0]).toEqual([ALUMNO, "2026-09-25"]);
  });

  test("recibe exactamente dos parámetros: el alumno y la fecha, sin filtros", async () => {
    const { readOwnTimeBlocksForAssistant } = await import("../../src/modules/time-blocks/index.js");
    expect(typeof readOwnTimeBlocksForAssistant).toBe("function");
    expect(readOwnTimeBlocksForAssistant.length).toBe(2);
  });
});
