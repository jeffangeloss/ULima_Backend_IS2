import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import type {
  TimeBlockException,
  TimeBlockExceptionStatus,
  TimeBlockInput,
  TimeBlockRule,
} from "./time-blocks.types.js";

/** Fila cruda de `database.execute`: claves snake_case y valores sin convertir. */
type Fila = Record<string, unknown>;

/**
 * Enteros como arreglo de Postgres en UN solo parámetro. Interpolar el arreglo
 * de JS en la plantilla `sql` de Drizzle lo vuelve un constructor de fila
 * (`any(($1, $2))`) y Postgres responde 42809. Es el mismo helper de
 * `portal-sync.repository.ts:34-35`, copiado porque allá es privado del módulo.
 */
const intArray = (values: readonly number[]) =>
  sql`string_to_array(${values.map((v) => Number(v)).join(",")}, ',')::int[]`;

/**
 * Los días viajan como UN parámetro JSON y Postgres los convierte a
 * `smallint[]`. `with ordinality` conserva el orden en que los mandó el alumno:
 * `array_agg` sobre una función que devuelve conjunto no lo garantiza sola.
 * Con la lista vacía `array_agg` devolvería NULL y la columna es NOT NULL; el
 * service nunca llega acá con cero días (Zod `.min(1)` y `chk_time_block_dias`).
 */
const diasParaEscribir = (dias: readonly number[]) => sql`(
        select array_agg(e.value::smallint order by e.ord)
          from json_array_elements_text(${JSON.stringify(dias.map((d) => Number(d)))}::json)
               with ordinality as e(value, ord)
      )`;

/** `time` vuelve como "14:00:00"; el resto del sistema habla "HH:MM". */
const hhmm = (valor: unknown): string => String(valor).slice(0, 5);
const hhmmOpcional = (valor: unknown): string | null => (valor == null ? null : hhmm(valor));

/**
 * `smallint[]` es el primer arreglo del esquema y el driver puede devolverlo ya
 * como arreglo de JS o como el literal `{1,3}`: se aceptan los dos y se
 * normaliza a `number[]`.
 */
const diasLeidos = (valor: unknown): number[] => {
  if (Array.isArray(valor)) return valor.map((d) => Number(d));
  const texto = String(valor ?? "").replace(/[{}]/g, "").trim();
  return texto === "" ? [] : texto.split(",").map((d) => Number(d));
};

const aRegla = (fila: Fila): TimeBlockRule => ({
  id: Number(fila.id),
  title: String(fila.title),
  colorHex: String(fila.color_hex),
  daysOfWeek: diasLeidos(fila.days_of_week),
  startTime: hhmm(fila.start_time),
  endTime: hhmm(fila.end_time),
  startDate: String(fila.start_date),
  endDate: String(fila.end_date),
});

const aExcepcion = (fila: Fila): TimeBlockException => ({
  blockId: Number(fila.block_id),
  date: String(fila.occurrence_date),
  status: String(fila.status) as TimeBlockExceptionStatus,
  startTime: hhmmOpcional(fila.start_time),
  endTime: hhmmOpcional(fila.end_time),
});

/** Las ocho columnas de la regla, con horas y fechas ya convertidas a texto. */
const COLUMNAS_REGLA = sql`id, title, color_hex, days_of_week,
             start_time::text as start_time, end_time::text as end_time,
             start_date::text as start_date, end_date::text as end_date`;

/** Las cinco columnas de la excepción, con la fecha y las horas como texto. */
const COLUMNAS_EXCEPCION = sql`block_id, occurrence_date::text as occurrence_date, status,
             start_time::text as start_time, end_time::text as end_time`;

/**
 * SQL de `student_time_block` y `student_time_block_exception` (RS-BE-31,
 * RS-BE-32 y el soporte de datos de RS-BE-33). SQL crudo parametrizado, como
 * el resto de los repositories del repo.
 *
 * TODA consulta lleva `student_id` en el `where`, incluidas las escrituras y
 * las dos de excepciones. La pertenencia la comprueba el service —como
 * `findSectionOwnedByTeacher` en `advising/teacher`—, pero el SQL también la
 * acota: si el service se equivoca, un id ajeno afecta 0 filas en vez de
 * tocar el bloque de otro alumno. Las excepciones no tienen `student_id`
 * propio, así que se acotan contra su bloque: el upsert inserta desde la fila
 * del bloque del alumno y el delete cruza con ella.
 */
export class TimeBlocksRepository {
  constructor(readonly database: typeof db) {}

  async findBlocks(studentId: number): Promise<TimeBlockRule[]> {
    const filas = (await this.database.execute(sql`
      select ${COLUMNAS_REGLA}
        from student_time_block
       where student_id = ${studentId}
       order by start_date asc, start_time asc, id asc
    `)) as unknown as Fila[];
    return filas.map(aRegla);
  }

  async findBlockOwnedBy(studentId: number, blockId: number): Promise<TimeBlockRule | null> {
    const filas = (await this.database.execute(sql`
      select ${COLUMNAS_REGLA}
        from student_time_block
       where student_id = ${studentId} and id = ${blockId}
       limit 1
    `)) as unknown as Fila[];
    const fila = filas[0];
    return fila ? aRegla(fila) : null;
  }

  /**
   * Cuenta TODOS los bloques guardados del alumno, también los ya vencidos:
   * es lo que fija RS-BE-31 ("20 bloques guardados, vencidos incluidos"). El
   * borrado es físico, y un bloque vencido sigue expandiéndose en una ventana
   * pasada, así que contarlo es lo que acota la expansión, que es la razón que
   * da la spec para el tope.
   */
  async countBlocks(studentId: number): Promise<number> {
    const filas = (await this.database.execute(sql`
      select count(*)::int as total
        from student_time_block
       where student_id = ${studentId}
    `)) as unknown as Array<{ total: number }>;
    return Number(filas[0]?.total ?? 0);
  }

  async insertBlock(studentId: number, input: TimeBlockInput): Promise<TimeBlockRule> {
    const filas = (await this.database.execute(sql`
      insert into student_time_block
        (student_id, title, color_hex, days_of_week, start_time, end_time, start_date, end_date)
      values (${studentId}, ${input.title}, ${input.colorHex}, ${diasParaEscribir(input.daysOfWeek)},
              ${input.startTime}::time, ${input.endTime}::time,
              ${input.startDate}::date, ${input.endDate}::date)
      returning ${COLUMNAS_REGLA}
    `)) as unknown as Fila[];
    const fila = filas[0];
    if (!fila) throw new Error("La base no devolvió el bloque recién creado.");
    return aRegla(fila);
  }

  /**
   * RS-BE-31: reemplaza la regla entera y **no** toca las excepciones. Es una
   * sola sentencia a propósito: cualquier `delete` de cortesía acá le borraría
   * al alumno las correcciones que ya hizo día por día.
   */
  async updateBlock(
    studentId: number, blockId: number, input: TimeBlockInput,
  ): Promise<TimeBlockRule | null> {
    const filas = (await this.database.execute(sql`
      update student_time_block
         set title = ${input.title},
             color_hex = ${input.colorHex},
             days_of_week = ${diasParaEscribir(input.daysOfWeek)},
             start_time = ${input.startTime}::time,
             end_time = ${input.endTime}::time,
             start_date = ${input.startDate}::date,
             end_date = ${input.endDate}::date,
             updated_at = now()
       where id = ${blockId} and student_id = ${studentId}
      returning ${COLUMNAS_REGLA}
    `)) as unknown as Fila[];
    const fila = filas[0];
    return fila ? aRegla(fila) : null;
  }

  /** Las excepciones se van solas por el `on delete cascade` de la FK. */
  async deleteBlock(studentId: number, blockId: number): Promise<boolean> {
    const filas = (await this.database.execute(sql`
      delete from student_time_block
       where id = ${blockId} and student_id = ${studentId}
      returning id
    `)) as unknown as Fila[];
    return filas.length > 0;
  }

  async findExceptions(
    studentId: number, blockIds: readonly number[],
  ): Promise<TimeBlockException[]> {
    if (blockIds.length === 0) return [];
    const filas = (await this.database.execute(sql`
      select e.block_id, e.occurrence_date::text as occurrence_date, e.status,
             e.start_time::text as start_time, e.end_time::text as end_time
        from student_time_block_exception e
        join student_time_block b on b.id = e.block_id
       where b.student_id = ${studentId}
         and e.block_id = any(${intArray(blockIds)})
       order by e.occurrence_date asc, e.block_id asc
    `)) as unknown as Fila[];
    return filas.map(aExcepcion);
  }

  /**
   * RS-BE-32: idempotente por `uq_time_block_exception`. Repetir el mismo PUT
   * deja el mismo estado. `cancelled` escribe las dos horas en null, que es lo
   * que exige `chk_time_block_exc_movido`.
   *
   * La fila se inserta DESDE el bloque del alumno (`select b.id … from
   * student_time_block b where … b.student_id = …`): con un bloque ajeno o
   * inexistente no hay fila que insertar, no se escribe nada y devuelve null.
   */
  async upsertException(
    studentId: number, blockId: number, date: string, status: TimeBlockExceptionStatus,
    startTime: string | null, endTime: string | null,
  ): Promise<TimeBlockException | null> {
    const filas = (await this.database.execute(sql`
      insert into student_time_block_exception
        (block_id, occurrence_date, status, start_time, end_time)
      select b.id, ${date}::date, ${status}::time_block_exception_status,
             ${startTime}::time, ${endTime}::time
        from student_time_block b
       where b.id = ${blockId} and b.student_id = ${studentId}
      on conflict (block_id, occurrence_date) do update
        set status = excluded.status,
            start_time = excluded.start_time,
            end_time = excluded.end_time
      returning ${COLUMNAS_EXCEPCION}
    `)) as unknown as Fila[];
    const fila = filas[0];
    return fila ? aExcepcion(fila) : null;
  }

  /** Borra la excepción solo si su bloque es del alumno: cruza con el bloque. */
  async deleteException(studentId: number, blockId: number, date: string): Promise<boolean> {
    const filas = (await this.database.execute(sql`
      delete from student_time_block_exception e
       using student_time_block b
       where b.id = e.block_id
         and b.student_id = ${studentId}
         and e.block_id = ${blockId}
         and e.occurrence_date = ${date}::date
      returning e.block_id
    `)) as unknown as Fila[];
    return filas.length > 0;
  }
}
