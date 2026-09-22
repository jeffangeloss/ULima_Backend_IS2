import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { TimeBlocksRepository } from "../../src/modules/time-blocks/time-blocks.repository.js";
import type { TimeBlockInput } from "../../src/modules/time-blocks/time-blocks.types.js";

/**
 * RS-BE-31, RS-BE-32 y RS-BE-33 vistos desde el repositorio.
 *
 * Estas pruebas miran el SQL RENDERIZADO ademas del resultado, como
 * `test/HU31_jeff/repository.progress-batch.test.ts` y
 * `test/HU34_jeff/record-persistence.test.ts`: la clase de defecto que importa
 * aca la produce Postgres al ejecutar (un arreglo de JS que se vuelve
 * constructor de fila con 42809, un `Date` que postgres.js rechaza al preparar
 * la sentencia, un `where student_id` que se cae y deja tocar el bloque de otro
 * alumno) y no el codigo al armar. No abren ninguna conexion: la base es de
 * mentira.
 *
 * Datos 100% inventados, alumno sintetico 20230001 (studentId interno 77).
 */
const baseFalsa = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  const database = { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never;
  return {
    repo: new TimeBlocksRepository(database),
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
    llamadas: () => capturadas.length,
  };
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

const ALUMNO = 77;

/** Regla inventada: practicas los lunes y miercoles de 14:00 a 18:00. */
const ENTRADA: TimeBlockInput = {
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-01",
  endDate: "2026-12-15",
};

/** Lo que devuelve la base: horas con segundos y fechas ya casteadas a texto. */
const FILA_BLOQUE = {
  id: 12,
  title: "Practicas preprofesionales",
  color_hex: "#F94B3F",
  days_of_week: [1, 3],
  start_time: "14:00:00",
  end_time: "18:00:00",
  start_date: "2026-09-01",
  end_date: "2026-12-15",
};

describe("findBlocks", () => {
  test("acota por el alumno y lo manda como parametro, no concatenado", async () => {
    const { repo, consultas, llamadas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlocks(ALUMNO);
    expect(llamadas()).toBe(1);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("from student_time_block where student_id = $1");
    expect(texto).not.toContain("77");
    expect(params).toEqual([ALUMNO]);
  });

  test("recorta las horas a HH:MM y deja las fechas como YYYY-MM-DD", async () => {
    // El resto del sistema habla "HH:MM"; si el repositorio dejara pasar
    // "14:00:00", la expansion de ocurrencias compararia cadenas de distinto
    // largo y la app pintaria la hora con segundos.
    const { repo } = baseFalsa([FILA_BLOQUE]);
    expect(await repo.findBlocks(ALUMNO)).toEqual([{
      id: 12,
      title: "Practicas preprofesionales",
      colorHex: "#F94B3F",
      daysOfWeek: [1, 3],
      startTime: "14:00",
      endTime: "18:00",
      startDate: "2026-09-01",
      endDate: "2026-12-15",
    }]);
  });

  test("las fechas se leen como texto: ningun ::text de menos", async () => {
    const { repo, consultas } = baseFalsa([]);
    await repo.findBlocks(ALUMNO);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("start_date::text as start_date");
    expect(q).toContain("end_date::text as end_date");
    expect(q).toContain("start_time::text as start_time");
    expect(q).toContain("end_time::text as end_time");
  });

  test("days_of_week llega como number[] venga como arreglo o como literal {1,3}", async () => {
    // `smallint[]` es el primer arreglo del esquema y no esta comprobado como
    // lo entrega el driver: las dos formas tienen que dar lo mismo.
    const comoArreglo = baseFalsa([{ ...FILA_BLOQUE, days_of_week: [1, 3] }]);
    const comoLiteral = baseFalsa([{ ...FILA_BLOQUE, days_of_week: "{1,3}" }]);
    expect((await comoArreglo.repo.findBlocks(ALUMNO))[0]!.daysOfWeek).toEqual([1, 3]);
    expect((await comoLiteral.repo.findBlocks(ALUMNO))[0]!.daysOfWeek).toEqual([1, 3]);
  });
});

describe("findBlockOwnedBy", () => {
  test("filtra por alumno Y por id, los dos como parametro", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlockOwnedBy(ALUMNO, 12);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("where student_id = $1 and id = $2");
    expect(params).toEqual([ALUMNO, 12]);
  });

  test("sin fila devuelve null, no undefined ni una fila vacia", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.findBlockOwnedBy(ALUMNO, 999)).toBeNull();
  });
});

describe("countBlocks", () => {
  test("cuenta solo los del alumno y devuelve number", async () => {
    const { repo, consultas } = baseFalsa([{ total: 20 }]);
    expect(await repo.countBlocks(ALUMNO)).toBe(20);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("select count(*)::int as total from student_time_block where student_id = $1");
    expect(params).toEqual([ALUMNO]);
  });

  test("sin filas cuenta 0", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.countBlocks(ALUMNO)).toBe(0);
  });
});

describe("insertBlock", () => {
  test("los dias viajan en UN parametro JSON y no como arreglo de JS", async () => {
    // Interpolar el arreglo lo vuelve `($4, $5)` (constructor de fila) y
    // Postgres responde 42809. Es la regresion de `upsertProgressBatch`.
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.insertBlock(ALUMNO, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("json_array_elements_text($4::json)");
    expect(params).toHaveLength(8);
    expect(params.some((p) => Array.isArray(p))).toBe(false);
    expect(JSON.parse(String(params[3]))).toEqual([1, 3]);
  });

  test("escribe en student_time_block con el alumno y las ocho columnas", async () => {
    const { repo, consultas, llamadas } = baseFalsa([FILA_BLOQUE]);
    await repo.insertBlock(ALUMNO, ENTRADA);
    expect(llamadas()).toBe(1);
    const { sql: texto, params } = consultas()[0]!;
    const q = norm(texto);
    expect(q).toContain("insert into student_time_block (student_id, title, color_hex, days_of_week, start_time, end_time, start_date, end_date)");
    expect(q).toContain("returning");
    expect(params[0]).toBe(ALUMNO);
  });

  test("ningun parametro es un Date: fechas y horas viajan como texto con cast", async () => {
    // Regresion real del 2026-09-20: postgres.js rechaza un `Date` al preparar
    // la sentencia y la peticion entera responde 500.
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.insertBlock(ALUMNO, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(params.some((p) => p instanceof Date)).toBe(false);
    expect(params).toContain("2026-09-01");
    expect(norm(texto)).toContain("::date");
    expect(norm(texto)).toContain("::time");
  });

  test("devuelve la regla que escribio la base, ya en HH:MM", async () => {
    const { repo } = baseFalsa([FILA_BLOQUE]);
    const bloque = await repo.insertBlock(ALUMNO, ENTRADA);
    expect(bloque.id).toBe(12);
    expect(bloque.startTime).toBe("14:00");
    expect(bloque.daysOfWeek).toEqual([1, 3]);
  });
});

describe("updateBlock", () => {
  test("el where acota por id Y por alumno: un id ajeno no actualiza nada", async () => {
    // La pertenencia la comprueba el service, pero el SQL tambien: si el
    // service se equivoca, el update tiene que afectar 0 filas.
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("where id = $8 and student_id = $9");
    expect(params[7]).toBe(12);
    expect(params[8]).toBe(ALUMNO);
  });

  test("no toca las excepciones: una sola sentencia y sin nombrar la tabla", async () => {
    // RS-BE-31: editar la regla conserva lo que el alumno ya corrigio dia por
    // dia. Un `delete` de cortesia aca le borraria esas correcciones.
    const { repo, consultas, llamadas } = baseFalsa([FILA_BLOQUE]);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    expect(llamadas()).toBe(1);
    const q = norm(consultas()[0]!.sql);
    expect(q).not.toContain("student_time_block_exception");
    expect(q).not.toContain("delete");
  });

  test("mueve updated_at y manda los dias como JSON", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("updated_at = now()");
    expect(norm(texto)).toContain("json_array_elements_text($3::json)");
    expect(JSON.parse(String(params[2]))).toEqual([1, 3]);
    expect(params.some((p) => Array.isArray(p) || p instanceof Date)).toBe(false);
  });

  test("si no actualizo ninguna fila devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.updateBlock(ALUMNO, 999, ENTRADA)).toBeNull();
  });
});

describe("deleteBlock", () => {
  test("borra solo si el bloque es del alumno y responde si borro", async () => {
    const { repo, consultas } = baseFalsa([{ id: 12 }]);
    expect(await repo.deleteBlock(ALUMNO, 12)).toBe(true);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("delete from student_time_block where id = $1 and student_id = $2");
    expect(params).toEqual([12, ALUMNO]);
  });

  test("un id de otro alumno no borra nada y devuelve false", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.deleteBlock(ALUMNO, 999)).toBe(false);
  });
});

describe("findExceptions", () => {
  test("sin ids no toca la base", async () => {
    const { repo, llamadas } = baseFalsa([]);
    expect(await repo.findExceptions(ALUMNO, [])).toEqual([]);
    expect(llamadas()).toBe(0);
  });

  test("los ids viajan en UN parametro, no como constructor de fila", async () => {
    // `any(${ids})` rinde `any(($2, $3))` y Postgres responde 42809.
    const { repo, consultas } = baseFalsa([]);
    await repo.findExceptions(ALUMNO, [12, 13]);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("any(string_to_array($2, ',')::int[])");
    expect(norm(texto)).not.toContain("any(($");
    expect(params).toEqual([ALUMNO, "12,13"]);
  });

  test("solo devuelve excepciones de bloques del alumno: une contra student_time_block", async () => {
    const { repo, consultas } = baseFalsa([]);
    await repo.findExceptions(ALUMNO, [12]);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("join student_time_block b on b.id = e.block_id");
    expect(q).toContain("where b.student_id = $1");
  });

  test("lee la fecha como texto y las horas en HH:MM, con null cuando no hay", async () => {
    const { repo, consultas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-08", status: "cancelled", start_time: null, end_time: null },
      { block_id: 12, occurrence_date: "2026-10-15", status: "moved", start_time: "15:00:00", end_time: "19:00:00" },
    ]);
    expect(await repo.findExceptions(ALUMNO, [12])).toEqual([
      { blockId: 12, date: "2026-10-08", status: "cancelled", startTime: null, endTime: null },
      { blockId: 12, date: "2026-10-15", status: "moved", startTime: "15:00", endTime: "19:00" },
    ]);
    // Sin el `::text`, el driver devuelve un `Date` y la fecha saldria como
    // "Thu Oct 08 2026 ..." en el JSON del contrato.
    expect(norm(consultas()[0]!.sql)).toContain("e.occurrence_date::text as occurrence_date");
  });
});

describe("upsertException", () => {
  test("es idempotente: on conflict sobre (block_id, occurrence_date) do update", async () => {
    // RS-BE-32: repetir el mismo PUT deja el mismo estado.
    const { repo, consultas, llamadas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-15", status: "moved", start_time: "15:00:00", end_time: "19:00:00" },
    ]);
    const excepcion = await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    expect(llamadas()).toBe(1);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("insert into student_time_block_exception");
    // La fila sale del bloque del alumno: con un bloque ajeno no hay nada que insertar.
    expect(q).toContain("from student_time_block b where b.id = $5 and b.student_id = $6");
    expect(q).toContain("on conflict (block_id, occurrence_date) do update set status = excluded.status, start_time = excluded.start_time, end_time = excluded.end_time");
    expect(q).toContain("returning block_id, occurrence_date::text as occurrence_date");
    expect(excepcion).toEqual({
      blockId: 12, date: "2026-10-15", status: "moved", startTime: "15:00", endTime: "19:00",
    });
  });

  test("la fecha viaja como texto con ::date y ningun parametro es un Date", async () => {
    const { repo, consultas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-15", status: "moved", start_time: "15:00:00", end_time: "19:00:00" },
    ]);
    await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    const { sql: texto, params } = consultas()[0]!;
    expect(params.some((p) => p instanceof Date)).toBe(false);
    expect(params).toEqual(["2026-10-15", "moved", "15:00", "19:00", 12, ALUMNO]);
    expect(norm(texto)).toContain("$1::date");
    expect(norm(texto)).toContain("$2::time_block_exception_status");
  });

  test("cancelled manda las dos horas en null", async () => {
    // `chk_time_block_exc_movido` rechaza un cancelled con horas: si el
    // repositorio mandara "" en vez de null, la base abortaria con 23514.
    const { repo, consultas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-08", status: "cancelled", start_time: null, end_time: null },
    ]);
    const excepcion = await repo.upsertException(ALUMNO, 12, "2026-10-08", "cancelled", null, null);
    expect(consultas()[0]!.params).toEqual(["2026-10-08", "cancelled", null, null, 12, ALUMNO]);
    expect(excepcion).toEqual({
      blockId: 12, date: "2026-10-08", status: "cancelled", startTime: null, endTime: null,
    });
  });

  test("si el bloque no es del alumno no escribe nada y devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.upsertException(ALUMNO, 999, "2026-10-08", "cancelled", null, null)).toBeNull();
  });
});

describe("deleteException", () => {
  test("borra la fecha del bloque, acotado por el alumno, y dice si borro", async () => {
    const { repo, consultas } = baseFalsa([{ block_id: 12 }]);
    expect(await repo.deleteException(ALUMNO, 12, "2026-10-08")).toBe(true);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("delete from student_time_block_exception e using student_time_block b where b.id = e.block_id and b.student_id = $1 and e.block_id = $2 and e.occurrence_date = $3::date");
    expect(params).toEqual([ALUMNO, 12, "2026-10-08"]);
  });

  test("una fecha sin excepcion devuelve false", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.deleteException(ALUMNO, 12, "2026-10-08")).toBe(false);
  });
});

describe("guardias transversales del repositorio", () => {
  test("ninguna operacion manda un Date ni un arreglo de JS como parametro", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlocks(ALUMNO);
    await repo.findBlockOwnedBy(ALUMNO, 12);
    await repo.countBlocks(ALUMNO);
    await repo.insertBlock(ALUMNO, ENTRADA);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    await repo.deleteBlock(ALUMNO, 12);
    await repo.findExceptions(ALUMNO, [12, 13]);
    await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    await repo.deleteException(ALUMNO, 12, "2026-10-08");
    const todos = consultas().flatMap((q) => q.params);
    expect(todos.some((p) => p instanceof Date)).toBe(false);
    expect(todos.some((p) => Array.isArray(p))).toBe(false);
    // Un arreglo de JS interpolado NO llega como parametro: Drizzle lo expande
    // a un constructor de fila `($4, $5)` y lo que aparece son parametros de
    // mas. Por eso, ademas de mirar los tipos, se cuenta cuantos manda cada
    // sentencia; cualquier `${dias}` suelto rompe esta linea.
    expect(consultas().map((q) => q.params.length)).toEqual([1, 2, 1, 8, 9, 2, 2, 6, 3]);
  });

  test("toda consulta lleva student_id; ninguna concatena el id en el texto", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlocks(ALUMNO);
    await repo.findBlockOwnedBy(ALUMNO, 12);
    await repo.countBlocks(ALUMNO);
    await repo.insertBlock(ALUMNO, ENTRADA);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    await repo.deleteBlock(ALUMNO, 12);
    await repo.findExceptions(ALUMNO, [12, 13]);
    await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    await repo.deleteException(ALUMNO, 12, "2026-10-08");
    expect(consultas()).toHaveLength(9);
    for (const { sql: texto, params } of consultas()) {
      expect(norm(texto)).toContain("student_id");
      expect(params).toContain(ALUMNO);
      expect(texto).not.toContain(String(ALUMNO));
    }
  });
});
