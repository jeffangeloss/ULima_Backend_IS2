import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import { storedRankingSchema } from "./specialty-test.schemas.js";
import type { StoredRankingEntry, StoredResult } from "./specialty-test.types.js";

/** Fila cruda de `database.execute`: claves snake_case y valores sin convertir. */
type Fila = Record<string, unknown>;

/**
 * Lecturas y escritura del test de especialidad (RS-BE-38, RS-BE-44 y
 * RS-BE-45). SQL crudo, como el resto de los repositories. El `student_id`
 * lo pone el controller desde el token y siempre viaja como parámetro.
 *
 * Los métodos no atrapan errores de la base: un fallo sube al `errorHandler`
 * global como 500, la misma regla de `academic-profile.repository.ts:49-53`.
 * Por lo mismo, un `ranking` guardado que no pasa Zod es un error y no un
 * resultado vacío.
 */
export class SpecialtyTestRepository {
  constructor(readonly database: typeof db) {}

  /** La carrera del alumno, o null si el id no tiene fila en `student`. */
  async findStudentCareer(studentId: number): Promise<{ careerId: number } | null> {
    const filas = await this.database.execute(sql`
      select career_id
      from student
      where id = ${studentId}
      limit 1
    `) as unknown as Fila[];

    const fila = filas[0];
    return fila ? { careerId: Number(fila.career_id) } : null;
  }

  /** Las especialidades con `is_active = true` de una carrera, por id. */
  async findActiveSpecialties(careerId: number): Promise<Array<{ id: number; name: string }>> {
    const filas = await this.database.execute(sql`
      select id, name
      from specialty
      where career_id = ${careerId}
        and is_active = true
      order by id
    `) as unknown as Fila[];

    return filas.map((fila) => ({ id: Number(fila.id), name: String(fila.name) }));
  }

  /**
   * Guarda o reemplaza el último resultado del alumno (RS-BE-44). El
   * `default now()` de `completed_at` solo actúa en el INSERT, así que el
   * `do update` fija la fecha a mano; sin eso, un test rehecho conservaría la
   * fecha del primero. El ranking viaja como texto JSON con `::jsonb`: nunca
   * se interpola un arreglo JS en la plantilla `sql` (error 42809).
   */
  async saveResult(
    studentId: number,
    contentVersion: string,
    ranking: StoredRankingEntry[],
    isTie: boolean,
  ): Promise<{ completedAt: string }> {
    const valido = storedRankingSchema.parse(ranking);
    const filas = await this.database.execute(sql`
      insert into student_specialty_test_result (student_id, content_version, ranking, is_tie)
      values (${studentId}, ${contentVersion}, ${JSON.stringify(valido)}::jsonb, ${isTie})
      on conflict (student_id) do update set
        content_version = excluded.content_version,
        ranking = excluded.ranking,
        is_tie = excluded.is_tie,
        completed_at = now()
      returning to_char(completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as completed_at
    `) as unknown as Fila[];

    const fila = filas[0];
    if (!fila) throw new Error("El guardado del resultado no devolvió ninguna fila.");
    return { completedAt: String(fila.completed_at) };
  }

  /** El último resultado del alumno, o null si no tiene ninguno (RS-BE-45). */
  async findResult(studentId: number): Promise<StoredResult | null> {
    const filas = await this.database.execute(sql`
      select content_version, ranking, is_tie,
             to_char(completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as completed_at
      from student_specialty_test_result
      where student_id = ${studentId}
      limit 1
    `) as unknown as Fila[];

    const fila = filas[0];
    if (!fila) return null;

    // postgres.js ya entrega el jsonb como objeto; si llegara como texto, se lee.
    const crudo = typeof fila.ranking === "string" ? JSON.parse(fila.ranking) : fila.ranking;
    const ranking = storedRankingSchema.safeParse(crudo);
    if (!ranking.success) {
      throw new Error("El ranking guardado del test de especialidad no tiene la forma esperada.");
    }
    return {
      contentVersion: String(fila.content_version),
      ranking: ranking.data,
      isTie: Boolean(fila.is_tie),
      completedAt: String(fila.completed_at),
    };
  }
}
