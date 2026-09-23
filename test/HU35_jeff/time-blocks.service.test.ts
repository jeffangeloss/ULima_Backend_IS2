import { describe, expect, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import {
  MAX_BLOCKS_PER_STUDENT,
  TimeBlocksService,
} from "../../src/modules/time-blocks/time-blocks.service.js";
import {
  blockIdParamSchema,
  exceptionBodySchema,
  occurrenceParamsSchema,
  timeBlockBodySchema,
  windowQuerySchema,
} from "../../src/modules/time-blocks/time-blocks.schemas.js";
import type { TimeBlockBody } from "../../src/modules/time-blocks/time-blocks.schemas.js";
import type { TimeBlocksRepository } from "../../src/modules/time-blocks/time-blocks.repository.js";
import type {
  TimeBlockException,
  TimeBlockExceptionStatus,
  TimeBlockInput,
  TimeBlockRule,
} from "../../src/modules/time-blocks/time-blocks.types.js";

/**
 * RS-BE-31, RS-BE-32, el tope de ventana de RS-BE-33 y el armado de RS-BE-34.
 *
 * Sin base y sin red: el repositorio es un objeto en memoria que además anota
 * cada llamada con sus argumentos, para poder exigir que el `studentId` del
 * token baje a TODAS las consultas y que el PATCH no borre excepciones.
 *
 * Datos INVENTADOS (el repo es público): el alumno sintético es el 20230001 y
 * su `student.id` en estas pruebas es el 7. Ningún fixture real.
 *
 * Calendario de referencia (2026): 14-09 lunes, 21-09 lunes, 23-09 miércoles,
 * 28-09 lunes, 30-09 miércoles, 05-10 lunes, 07-10 miércoles, 08-10 jueves,
 * 12-10 lunes, 14-10 miércoles, 19-10 lunes, 20-10 martes, 26-10 lunes.
 */

const ALUMNO = 7;
const OTRO_ALUMNO = 9;

/** Lunes y miércoles de 14:00 a 18:00, del 2026-09-21 al 2026-10-20. */
const PRACTICAS: TimeBlockRule = {
  id: 12,
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-21",
  endDate: "2026-10-20",
};

const BODY_VALIDO = {
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-21",
  endDate: "2026-10-20",
};

/** Entrada del service: el mismo body, ya validado. */
const ENTRADA: TimeBlockInput = { ...BODY_VALIDO };

const excepcion = (
  blockId: number,
  date: string,
  status: TimeBlockExceptionStatus,
  startTime: string | null = null,
  endTime: string | null = null,
): TimeBlockException => ({ blockId, date, status, startTime, endTime });

type Llamada = { metodo: string; args: unknown[] };

/**
 * Repositorio falso con las nueve firmas de la Tarea 3. `llamadas` guarda el
 * orden y los argumentos; `gritaAlBorrar` convierte cualquier borrado en un
 * fallo ruidoso, que es como se fija que el PATCH no toca las excepciones.
 */
const armar = (
  opts: {
    blocks?: TimeBlockRule[];
    exceptions?: TimeBlockException[];
    total?: number;
    gritaAlBorrar?: boolean;
  } = {},
) => {
  const llamadas: Llamada[] = [];
  const blocks = opts.blocks ?? [];
  const exceptions = opts.exceptions ?? [];
  const anota = (metodo: string, ...args: unknown[]) => llamadas.push({ metodo, args });
  const propio = (studentId: number, blockId: number) =>
    studentId === ALUMNO ? (blocks.find((b) => b.id === blockId) ?? null) : null;

  const repository = {
    findBlocks: async (studentId: number) => {
      anota("findBlocks", studentId);
      return studentId === ALUMNO ? blocks : [];
    },
    findBlockOwnedBy: async (studentId: number, blockId: number) => {
      anota("findBlockOwnedBy", studentId, blockId);
      return propio(studentId, blockId);
    },
    countBlocks: async (studentId: number) => {
      anota("countBlocks", studentId);
      return opts.total ?? blocks.length;
    },
    insertBlock: async (studentId: number, input: TimeBlockInput) => {
      anota("insertBlock", studentId, input);
      return { id: 99, ...input };
    },
    updateBlock: async (studentId: number, blockId: number, input: TimeBlockInput) => {
      anota("updateBlock", studentId, blockId, input);
      return propio(studentId, blockId) === null ? null : { id: blockId, ...input };
    },
    deleteBlock: async (studentId: number, blockId: number) => {
      anota("deleteBlock", studentId, blockId);
      if (opts.gritaAlBorrar) throw new Error("no se esperaba un borrado");
      return propio(studentId, blockId) !== null;
    },
    findExceptions: async (studentId: number, blockIds: readonly number[]) => {
      anota("findExceptions", studentId, [...blockIds]);
      if (blockIds.length === 0) return [];
      return exceptions.filter((e) => studentId === ALUMNO && blockIds.includes(e.blockId));
    },
    upsertException: async (
      studentId: number,
      blockId: number,
      date: string,
      status: TimeBlockExceptionStatus,
      startTime: string | null,
      endTime: string | null,
    ) => {
      anota("upsertException", studentId, blockId, date, status, startTime, endTime);
      // Como el SQL de la Tarea 3: con un bloque ajeno no escribe y devuelve null.
      return propio(studentId, blockId) === null
        ? null
        : excepcion(blockId, date, status, startTime, endTime);
    },
    deleteException: async (studentId: number, blockId: number, date: string) => {
      anota("deleteException", studentId, blockId, date);
      if (opts.gritaAlBorrar) throw new Error("no se esperaba un borrado de excepciones");
      return (
        propio(studentId, blockId) !== null &&
        exceptions.some((e) => e.blockId === blockId && e.date === date)
      );
    },
  } as unknown as TimeBlocksRepository;

  return {
    repository,
    llamadas,
    metodos: () => llamadas.map((l) => l.metodo),
    service: new TimeBlocksService(repository, new EventBus()),
  };
};

describe("timeBlockBodySchema (RS-BE-31)", () => {
  test("acepta el bloque del alumno sintetico y recorta los espacios del titulo", () => {
    const body = timeBlockBodySchema.parse({ ...BODY_VALIDO, title: "  Practicas  " });
    expect(body.title).toBe("Practicas");
    expect(body.daysOfWeek).toEqual([1, 3]);
  });

  test("el cuerpo validado entra tal cual en TimeBlockInput", () => {
    // `comoInput` es una comprobación de tipos para el editor
    // (test/tsconfig.json): `tsc` no compila test/. La de `tsc` llega en la
    // Tarea 5, cuando el controller le pasa el body validado al service.
    const comoInput = (body: TimeBlockBody): TimeBlockInput => body;
    expect(comoInput(timeBlockBodySchema.parse(BODY_VALIDO))).toEqual(ENTRADA);
  });

  test("rechaza un titulo vacio o de puros espacios", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "   " }).success).toBe(false);
  });

  test("rechaza un titulo de 61 caracteres y acepta uno de 60", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "a".repeat(61) }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "a".repeat(60) }).success).toBe(true);
  });

  test("el color va en #RRGGBB, en mayusculas o minusculas", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "#f94b3f" }).success).toBe(true);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "F94B3F" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "#FFF" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "azul" }).success).toBe(false);
  });

  test("los dias van de 1 a 7, sin repetir, entre uno y siete", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [0] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [8] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [1.5] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [1, 1] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }).success).toBe(true);
    // El domingo es 7 y se acepta, aunque el portal nunca lo genere.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [7] }).success).toBe(true);
  });

  test("las horas van en HH:MM de 24 horas", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "7:00" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "24:00" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endTime: "18:60" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endTime: "18:00:00" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "07:05" }).success).toBe(true);
  });

  test("las fechas van en YYYY-MM-DD", () => {
    // Además fija que una cadena sin la forma NO llega a `addDays`: si llegara,
    // `toISOString()` lanzaria RangeError y el safeParse explotaria en vez de
    // devolver `success: false`.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startDate: "2026-9-1" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startDate: "21/09/2026" }).success).toBe(false);
  });

  test("las fechas tienen que existir en el calendario, no solo tener la forma", () => {
    // Pasan el regex pero no existen: sin este chequeo llegarian como `::date`
    // al repository y Postgres responderia 22008, un 500 por un error del
    // formulario. 2026 no es bisiesto; 2028 si.
    const r = timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-02-30", endDate: "2026-03-31",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.startDate).toEqual(["Fecha inválida (YYYY-MM-DD)."]);
    }
    expect(timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-02-29", endDate: "2026-03-31",
    }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endDate: "2026-13-01" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2028-02-29", endDate: "2028-03-31",
    }).success).toBe(true);
  });

  test("las fechas van del 2000-01-01 al 2099-12-31", () => {
    // Postgres acepta el 9999-12-31, pero un dia despues addDays imprime
    // "+010000-01": sin tope, la expansion de la Tarea 2 podria llegar ahi.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endDate: "9999-12-31" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startDate: "1999-12-31" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endDate: "2099-12-31" }).success).toBe(true);
    expect(windowQuerySchema.safeParse({ from: "9999-09-03", to: "9999-12-31" }).success).toBe(false);
  });

  test("la hora de fin tiene que ser mayor que la de inicio, y el error va en su campo", () => {
    // RS-BE-31 la pone bajo "Validacion con Zod" y sin codigo propio: es un
    // 400 INVALID_REQUEST_BODY, no TIME_BLOCK_OUT_OF_GRID (ese es de la grilla).
    const r = timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "18:00", endTime: "14:00" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.endTime).toEqual([
        "La hora de fin tiene que ser mayor que la de inicio.",
      ]);
    }
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "14:00", endTime: "14:00" }).success).toBe(false);
  });

  test("la fecha de fin no puede ser anterior a la de inicio, y puede ser la misma", () => {
    const alReves = timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-10-20", endDate: "2026-09-21",
    });
    expect(alReves.success).toBe(false);
    expect(timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-09-21", endDate: "2026-09-21",
    }).success).toBe(true);
  });

  test("el error de la fecha de fin viaja en su campo, para que el formulario lo pinte", () => {
    const r = timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-10-20", endDate: "2026-09-21",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.endDate).toEqual([
        "La fecha de fin no puede ser anterior a la de inicio.",
      ]);
    }
  });

  test("el esquema NO valida la grilla: eso es del service", () => {
    // 05:00 es una hora legal en HH:MM y el esquema la acepta; el que la
    // rechaza con TIME_BLOCK_OUT_OF_GRID es el service.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "05:00" }).success).toBe(true);
  });
});

describe("exceptionBodySchema (RS-BE-32)", () => {
  test("cancelled va solo con el estado", () => {
    expect(exceptionBodySchema.parse({ status: "cancelled" })).toEqual({ status: "cancelled" });
  });

  test("cancelled descarta las horas que vengan de mas", () => {
    expect(exceptionBodySchema.parse({ status: "cancelled", startTime: "15:00" })).toEqual({
      status: "cancelled",
    });
  });

  test("moved exige las dos horas", () => {
    expect(exceptionBodySchema.safeParse({ status: "moved" }).success).toBe(false);
    expect(exceptionBodySchema.safeParse({ status: "moved", startTime: "15:00" }).success).toBe(false);
    expect(exceptionBodySchema.parse({ status: "moved", startTime: "15:00", endTime: "19:00" })).toEqual({
      status: "moved", startTime: "15:00", endTime: "19:00",
    });
  });

  test("rechaza un estado que no existe y un body sin estado", () => {
    expect(exceptionBodySchema.safeParse({ status: "borrado" }).success).toBe(false);
    expect(exceptionBodySchema.safeParse({}).success).toBe(false);
  });

  test("moved exige la hora de fin mayor que la de inicio, con el error en endTime", () => {
    const r = exceptionBodySchema.safeParse({ status: "moved", startTime: "19:00", endTime: "15:00" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.endTime).toEqual([
        "La hora de fin tiene que ser mayor que la de inicio.",
      ]);
    }
    expect(exceptionBodySchema.safeParse({ status: "moved", startTime: "15:00", endTime: "15:00" }).success).toBe(false);
  });
});

describe("esquemas de ruta y de query", () => {
  test("blockIdParamSchema coacciona el id del path y exige un entero positivo que quepa en integer", () => {
    expect(blockIdParamSchema.parse({ id: "12" })).toEqual({ id: 12 });
    expect(blockIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(blockIdParamSchema.safeParse({ id: "-3" }).success).toBe(false);
    expect(blockIdParamSchema.safeParse({ id: "abc" }).success).toBe(false);
    // Mas alla de 2147483647 Postgres responderia 22003 (un 500).
    expect(blockIdParamSchema.parse({ id: "2147483647" })).toEqual({ id: 2147483647 });
    expect(blockIdParamSchema.safeParse({ id: "3000000000" }).success).toBe(false);
  });

  test("occurrenceParamsSchema coacciona el id y exige la fecha plana", () => {
    expect(occurrenceParamsSchema.parse({ id: "12", date: "2026-10-08" })).toEqual({
      id: 12, date: "2026-10-08",
    });
    expect(occurrenceParamsSchema.safeParse({ id: "12", date: "8-10-2026" }).success).toBe(false);
    // El DELETE no exige el patron: sin esto, esta fecha llegaria a Postgres.
    expect(occurrenceParamsSchema.safeParse({ id: "12", date: "2026-02-30" }).success).toBe(false);
    expect(occurrenceParamsSchema.safeParse({ id: "3000000000", date: "2026-10-08" }).success).toBe(false);
  });

  test("windowQuerySchema exige las dos fechas: la ventana es obligatoria", () => {
    expect(windowQuerySchema.parse({ from: "2026-09-21", to: "2026-10-19" })).toEqual({
      from: "2026-09-21", to: "2026-10-19",
    });
    expect(windowQuerySchema.safeParse({ from: "2026-09-21" }).success).toBe(false);
    expect(windowQuerySchema.safeParse({}).success).toBe(false);
    // La expansion arranca en `from`: esta fecha saldria como ocurrencia.
    expect(windowQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-08" }).success).toBe(false);
  });

  test("windowQuerySchema rechaza la ventana al reves, con el error en to", () => {
    // Una ventana al reves es una query mal armada (400 INVALID_QUERY_PARAMS),
    // no una "demasiado ancha": la spec reserva TIME_BLOCK_WINDOW_TOO_WIDE
    // para los 120 dias.
    const r = windowQuerySchema.safeParse({ from: "2026-10-19", to: "2026-09-21" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.to).toEqual(["La ventana no puede terminar antes de empezar."]);
    }
    expect(windowQuerySchema.safeParse({ from: "2026-09-21", to: "2026-09-21" }).success).toBe(true);
  });
});

describe("listBlocks (RS-BE-31)", () => {
  test("devuelve cada bloque con sus excepciones ordenadas por fecha y sin blockId", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [
        excepcion(12, "2026-10-14", "moved", "15:00", "19:00"),
        excepcion(12, "2026-10-05", "cancelled"),
      ],
    });
    const r = await a.service.listBlocks(ALUMNO);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]).toEqual({
      ...PRACTICAS,
      exceptions: [
        { date: "2026-10-05", status: "cancelled", startTime: null, endTime: null },
        { date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:00" },
      ],
    });
  });

  test("cada excepcion va con su bloque y no con el otro", async () => {
    const otro: TimeBlockRule = { ...PRACTICAS, id: 13, title: "Voluntariado", daysOfWeek: [3] };
    const a = armar({
      blocks: [PRACTICAS, otro],
      exceptions: [excepcion(13, "2026-10-07", "cancelled")],
    });
    const r = await a.service.listBlocks(ALUMNO);
    expect(r.blocks[0]?.exceptions).toEqual([]);
    expect(r.blocks[1]?.exceptions).toHaveLength(1);
  });

  test("sin bloques devuelve la lista vacia y pide las excepciones de ningun id", async () => {
    const a = armar();
    expect(await a.service.listBlocks(ALUMNO)).toEqual({ blocks: [] });
    expect(a.llamadas).toEqual([
      { metodo: "findBlocks", args: [ALUMNO] },
      { metodo: "findExceptions", args: [ALUMNO, []] },
    ]);
  });

  test("el studentId del token baja a las dos consultas", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await a.service.listBlocks(ALUMNO);
    expect(a.llamadas).toEqual([
      { metodo: "findBlocks", args: [ALUMNO] },
      { metodo: "findExceptions", args: [ALUMNO, [12]] },
    ]);
  });
});

describe("createBlock (RS-BE-31)", () => {
  test("crea el bloque y lo devuelve sin excepciones", async () => {
    const a = armar();
    const r = await a.service.createBlock(ALUMNO, ENTRADA);
    expect(r.block).toEqual({ id: 99, ...ENTRADA, exceptions: [] });
    expect(a.metodos()).toEqual(["countBlocks", "insertBlock"]);
    expect(a.llamadas[1]?.args).toEqual([ALUMNO, ENTRADA]);
  });

  test("rechaza lo que cae fuera de la grilla 07:00-22:00", async () => {
    const a = armar();
    await expect(
      a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "06:59", endTime: "09:00" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OUT_OF_GRID" });
    await expect(
      a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "21:00", endTime: "22:01" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OUT_OF_GRID" });
  });

  test("acepta los bordes exactos de la grilla", async () => {
    const a = armar();
    const r = await a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "07:00", endTime: "22:00" });
    expect(r.block.startTime).toBe("07:00");
    expect(r.block.endTime).toBe("22:00");
  });

  test("un body fuera de la grilla no llega a consultar nada", async () => {
    const a = armar();
    await expect(
      a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "05:00", endTime: "06:00" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OUT_OF_GRID" });
    expect(a.llamadas).toEqual([]);
  });

  test("con 20 bloques ya no deja crear otro", async () => {
    const a = armar({ total: MAX_BLOCKS_PER_STUDENT });
    await expect(a.service.createBlock(ALUMNO, ENTRADA)).rejects.toMatchObject({
      statusCode: 400,
      code: "TIME_BLOCK_LIMIT_REACHED",
    });
    expect(a.metodos()).toEqual(["countBlocks"]);
  });

  test("con 19 bloques todavia deja crear el numero 20", async () => {
    const a = armar({ total: MAX_BLOCKS_PER_STUDENT - 1 });
    await a.service.createBlock(ALUMNO, ENTRADA);
    expect(a.metodos()).toEqual(["countBlocks", "insertBlock"]);
  });

  test("el tope es 20", () => {
    expect(MAX_BLOCKS_PER_STUDENT).toBe(20);
  });
});

describe("updateBlock (RS-BE-31)", () => {
  test("reemplaza la regla y conserva las excepciones", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [excepcion(12, "2026-10-05", "cancelled")],
      gritaAlBorrar: true,
    });
    const nuevo: TimeBlockInput = { ...ENTRADA, startTime: "15:00", endTime: "19:00" };
    const r = await a.service.updateBlock(ALUMNO, 12, nuevo);
    expect(r.block).toEqual({
      id: 12,
      ...nuevo,
      exceptions: [{ date: "2026-10-05", status: "cancelled", startTime: null, endTime: null }],
    });
    // El repositorio grita si alguien borra; además se fija la secuencia.
    expect(a.metodos()).toEqual(["updateBlock", "findExceptions"]);
  });

  test("un bloque de otro alumno responde 404 y no 403", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.updateBlock(OTRO_ALUMNO, 12, ENTRADA)).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
  });

  test("un bloque que no existe responde 404", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.updateBlock(ALUMNO, 404, ENTRADA)).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
  });

  test("valida la grilla antes de escribir nada", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.updateBlock(ALUMNO, 12, { ...ENTRADA, startTime: "22:00", endTime: "23:00" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OUT_OF_GRID" });
    expect(a.llamadas).toEqual([]);
  });
});

describe("deleteBlock (RS-BE-31)", () => {
  test("borra el bloque del alumno", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.deleteBlock(ALUMNO, 12)).toEqual({ ok: true });
    expect(a.llamadas).toEqual([{ metodo: "deleteBlock", args: [ALUMNO, 12] }]);
  });

  test("un bloque de otro alumno responde 404", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.deleteBlock(OTRO_ALUMNO, 12)).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
  });
});

describe("setException (RS-BE-32)", () => {
  test("cancelled guarda las dos horas en null y responde sin blockId", async () => {
    // El contrato del PUT (RS-BE-32 de la spec) no trae blockId: la
    // excepcion sale con la misma forma que dentro de su bloque.
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.setException(ALUMNO, 12, "2026-10-05", { status: "cancelled" });
    expect(r.exception).toEqual({
      date: "2026-10-05", status: "cancelled", startTime: null, endTime: null,
    });
    expect(a.llamadas[1]).toEqual({
      metodo: "upsertException", args: [ALUMNO, 12, "2026-10-05", "cancelled", null, null],
    });
  });

  test("moved guarda las horas nuevas", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.setException(ALUMNO, 12, "2026-10-14", {
      status: "moved", startTime: "15:00", endTime: "19:00",
    });
    expect(r.exception).toEqual({
      date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:00",
    });
  });

  test("repetir el mismo PUT deja el mismo estado", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const primero = await a.service.setException(ALUMNO, 12, "2026-10-05", { status: "cancelled" });
    const segundo = await a.service.setException(ALUMNO, 12, "2026-10-05", { status: "cancelled" });
    expect(segundo).toEqual(primero);
    expect(a.llamadas[1]).toEqual(a.llamadas[3]);
  });

  test("un bloque de otro alumno responde 404 y no escribe", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(OTRO_ALUMNO, 12, "2026-10-05", { status: "cancelled" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "TIME_BLOCK_NOT_FOUND" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });

  test("una fecha en un dia que el patron no genera se rechaza", async () => {
    // 2026-10-08 es jueves y el bloque es lunes y miercoles.
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-10-08", { status: "cancelled" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });

  test("una fecha fuera del rango del bloque se rechaza aunque sea lunes", async () => {
    // 2026-10-26 es lunes, pero el bloque termina el 2026-10-20; 2026-09-14
    // tambien es lunes, pero el bloque empieza el 2026-09-21.
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-10-26", { status: "cancelled" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-09-14", { status: "cancelled" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
  });

  test("una fecha que no existe en el calendario se rechaza aca y no en Postgres", async () => {
    // Por HTTP ya la frena `occurrenceParamsSchema`; el service la frena igual
    // porque el patron no genera un dia que no existe. 2026-03-02 es lunes: sin
    // el chequeo de existencia, "2026-02-30" pasaria por lunes.
    const a = armar({ blocks: [{ ...PRACTICAS, startDate: "2026-01-01", endDate: "2026-12-31" }] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-02-30", { status: "cancelled" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });

  test("los bordes del rango si estan en el patron", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await a.service.setException(ALUMNO, 12, "2026-09-21", { status: "cancelled" });
    await a.service.setException(ALUMNO, 12, "2026-10-19", { status: "cancelled" });
    expect(a.metodos().filter((m) => m === "upsertException")).toHaveLength(2);
  });

  test("moved fuera de la grilla se rechaza y no escribe", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-10-05", {
        status: "moved", startTime: "20:00", endTime: "23:00",
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OUT_OF_GRID" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });
});

describe("clearException (RS-BE-32)", () => {
  test("quita la excepcion de esa fecha", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [excepcion(12, "2026-10-05", "cancelled")],
    });
    expect(await a.service.clearException(ALUMNO, 12, "2026-10-05")).toEqual({ ok: true });
    expect(a.llamadas[1]).toEqual({ metodo: "deleteException", args: [ALUMNO, 12, "2026-10-05"] });
  });

  test("borrar una excepcion que no estaba tambien responde ok", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.clearException(ALUMNO, 12, "2026-10-05")).toEqual({ ok: true });
  });

  test("no exige que la fecha este en el patron: limpiar siempre se puede", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.clearException(ALUMNO, 12, "2026-10-08")).toEqual({ ok: true });
  });

  test("un bloque de otro alumno responde 404 y no borra nada", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.clearException(OTRO_ALUMNO, 12, "2026-10-05")).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });
});

describe("occurrences (RS-BE-33 y RS-BE-34)", () => {
  test("arma las ocurrencias y las horas de cada semana", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2026-10-04");
    expect(r.occurrences.map((o) => o.date)).toEqual([
      "2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30",
    ]);
    expect(r.occurrences[0]).toEqual({
      blockId: 12,
      title: "Practicas preprofesionales",
      colorHex: "#F94B3F",
      date: "2026-09-21",
      dayOfWeek: 1,
      startTime: "14:00",
      endTime: "18:00",
      moved: false,
    });
    expect(r.weeks).toEqual([
      { weekStart: "2026-09-21", hours: 8 },
      { weekStart: "2026-09-28", hours: 8 },
    ]);
  });

  test("un dia cancelado no aparece ni suma, y uno movido suma su duracion nueva", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [
        excepcion(12, "2026-09-21", "cancelled"),
        excepcion(12, "2026-09-23", "moved", "15:00", "19:30"),
      ],
    });
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2026-09-27");
    expect(r.occurrences).toHaveLength(1);
    expect(r.occurrences[0]).toMatchObject({
      date: "2026-09-23", startTime: "15:00", endTime: "19:30", moved: true,
    });
    expect(r.weeks).toEqual([{ weekStart: "2026-09-21", hours: 4.5 }]);
  });

  test("una ventana que no toca el rango no trae ocurrencias y su semana sale en cero", async () => {
    // RS-BE-34: una entrada por cada semana entre los lunes de from y de to, aunque no sume nada.
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.occurrences(ALUMNO, "2026-11-02", "2026-11-08")).toEqual({
      occurrences: [], weeks: [{ weekStart: "2026-11-02", hours: 0 }],
    });
  });

  test("las semanas de los bordes suman la semana entera, no solo los dias de la ventana", async () => {
    // RS-BE-34: el total es "el de la semana entera, de lunes a domingo, aunque
    // la ventana la corte". La ventana empieza un miercoles y termina un lunes: el lunes
    // 21-09 y el miercoles 30-09 no salen como ocurrencias, pero suman.
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.occurrences(ALUMNO, "2026-09-23", "2026-09-28");
    expect(r.occurrences.map((o) => o.date)).toEqual(["2026-09-23", "2026-09-28"]);
    expect(r.weeks).toEqual([
      { weekStart: "2026-09-21", hours: 8 },
      { weekStart: "2026-09-28", hours: 8 },
    ]);
  });

  test("una ventana de 121 dias se rechaza y una de 120 pasa", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    // 2026-09-21 + 119 dias = 2027-01-18, que es el dia 120 contando los dos
    // extremos; 2027-01-19 seria el 121.
    await expect(a.service.occurrences(ALUMNO, "2026-09-21", "2027-01-19")).rejects.toMatchObject({
      code: "TIME_BLOCK_WINDOW_TOO_WIDE",
    });
    // El bloque solo vale hasta el 2026-10-20: cinco lunes y cuatro miercoles.
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2027-01-18");
    expect(r.occurrences).toHaveLength(9);
  });

  test("una ventana de un solo dia es valida y trae el total de su semana", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2026-09-21");
    expect(r.occurrences).toHaveLength(1);
    // Lunes 21-09 y miercoles 23-09: la semana entera, aunque la ventana sea un dia.
    expect(r.weeks).toEqual([{ weekStart: "2026-09-21", hours: 8 }]);
  });

  test("el studentId del token baja a las dos consultas de la ventana", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await a.service.occurrences(ALUMNO, "2026-09-21", "2026-10-04");
    expect(a.llamadas).toEqual([
      { metodo: "findBlocks", args: [ALUMNO] },
      { metodo: "findExceptions", args: [ALUMNO, [12]] },
    ]);
  });
});
