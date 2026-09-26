import { sql } from "drizzle-orm";
import type { db } from "../../../db/index.js";
import { sqlActualizarAsistencia, type HorasAsistencia, type Tx } from "../portal-sync.repository.js";
import type { EvaluacionEmparejada, EvaluacionSilabo } from "../portal-sync.types.js";
import type { ContextoRecarga } from "./refresh.types.js";

/**
 * RS-BE-54 y RS-BE-55 · acceso a PostgreSQL de la recarga.
 *
 * Las lecturas corren fuera de la transacción. Las escrituras reciben `tx` y
 * tocan solo `enrollment` (las horas de asistencia y las dos horas de lectura)
 * y `student_portal_score`. Ningún arreglo de JS ni ningún `Date` entra a la
 * plantilla `sql`: los instantes viajan como texto ISO 8601 y el lote de
 * evaluaciones como un solo texto JSON.
 */
export class PortalRefreshRepository {
  constructor(readonly database: typeof db) {}

  /** Única puerta de entrada a la transacción; el servicio nunca abre una. */
  async runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await this.database.transaction(fn);
  }

  async findUserCode(userId: number): Promise<string | null> {
    const filas = (await this.database.execute(sql`
      select code from app_user where id = ${userId} limit 1
    `)) as unknown as Array<{ code: string | null }>;
    return filas[0]?.code ?? null;
  }

  /** RS-BE-49, condición previa 1. El período activo y las matrículas activas del alumno en él. */
  async findRefreshContext(studentId: number): Promise<ContextoRecarga> {
    const periodos = (await this.database.execute(sql`
      select id, code from academic_period where is_active = true limit 1
    `)) as unknown as Array<{ id: number; code: string }>;
    const periodo = periodos[0];
    if (!periodo) return { period: null, matriculas: [] };
    const filas = (await this.database.execute(sql`
      select e.id as enrollment_id, sec.id as section_id, sec.code as section_code,
             c.code as course_code, c.name as course_name
        from enrollment e
        join section sec on sec.id = e.section_id
        join course_offering co on co.id = sec.course_offering_id
        join course c on c.id = co.course_id
       where e.student_id = ${studentId}
         and e.status = 'active'
         and co.academic_period_id = ${periodo.id}
       order by c.name, sec.code
    `)) as unknown as Array<{
      enrollment_id: number; section_id: number; section_code: string; course_code: string; course_name: string;
    }>;
    return {
      period: { id: Number(periodo.id), code: periodo.code },
      matriculas: filas.map((f) => ({
        enrollmentId: Number(f.enrollment_id),
        sectionId: Number(f.section_id),
        courseCode: f.course_code,
        sectionCode: f.section_code,
        courseName: f.course_name,
      })),
    };
  }

  /**
   * RS-BE-54. Candidatas del sílabo de la oferta de UNA matrícula. Todas las
   * secciones de un curso comparten la rúbrica, y la cadena parte de la
   * matrícula, así que nunca trae evaluaciones de otro curso.
   */
  async findSyllabusCandidates(enrollmentId: number): Promise<EvaluacionSilabo[]> {
    const filas = (await this.database.execute(sql`
      select a.id as assessment_id, a.name, at.name as type_name, a.week_number, a.weight::text as weight
        from enrollment e
        join section s on s.id = e.section_id
        join course_offering co on co.id = s.course_offering_id
        join syllabus sy on sy.course_offering_id = co.id
        join assessment a on a.syllabus_id = sy.id
        join assessment_type at on at.id = a.assessment_type_id
       where e.id = ${enrollmentId}
       order by a.week_number, a.id
    `)) as unknown as Array<{
      assessment_id: number; name: string; type_name: string; week_number: number; weight: string;
    }>;
    return filas.map((f) => ({
      assessmentId: Number(f.assessment_id),
      name: f.name,
      typeName: f.type_name,
      week: Number(f.week_number),
      weight: Number(f.weight),
    }));
  }

  /**
   * RS-BE-55. Sin este candado, dos recargas del mismo alumno desde dos
   * dispositivos borran e insertan las mismas filas a la vez y la segunda
   * termina en un 23505. `_xact_` se suelta solo con el commit o el rollback.
   */
  async lockRefresh(tx: Tx, studentId: number): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('portal-refresh'), ${studentId}::int)`);
  }

  /** RS-BE-51, punto 6. El mismo UPDATE de la importación, con la hora y la guarda de lectura. */
  async updateAttendanceHours(tx: Tx, enrollmentId: number, h: HorasAsistencia, leidaEn: string): Promise<boolean> {
    const filas = (await tx.execute(sqlActualizarAsistencia(enrollmentId, h, leidaEn))) as unknown as Array<unknown>;
    return filas.length > 0;
  }

  /**
   * RS-BE-55. La hora de las notas solo avanza. Devuelve true si el UPDATE tocó
   * la fila, y solo entonces el servicio reemplaza las evaluaciones, así que una
   * recarga que leyó antes y confirma después no pisa una lectura más nueva.
   */
  async markGradesRead(tx: Tx, enrollmentId: number, leidaEn: string): Promise<boolean> {
    const filas = (await tx.execute(sql`
      update enrollment
         set portal_grades_read_at = ${leidaEn}::timestamptz
       where id = ${enrollmentId}
         and (portal_grades_read_at is null or portal_grades_read_at < ${leidaEn}::timestamptz)
      returning id
    `)) as unknown as Array<unknown>;
    return filas.length > 0;
  }

  /**
   * RS-BE-55. Reemplaza TODAS las notas de la ULima de una matrícula, así que
   * una evaluación que la ULima retira no queda como fila vieja.
   *
   * Una fila con `assessment_id` solo entra si esa evaluación es del sílabo de
   * la oferta de la matrícula, por la cadena enrollment → section →
   * course_offering → syllabus → assessment, así que una pareja de otro curso
   * no produce fila aunque el servicio falle. Si las filas insertadas no son
   * las enviadas, se lanza y la transacción entera se revierte (500), porque
   * eso solo ocurre por un defecto del servicio.
   */
  async replacePortalScores(tx: Tx, enrollmentId: number, filas: EvaluacionEmparejada[]): Promise<void> {
    await tx.execute(sql`delete from student_portal_score where enrollment_id = ${enrollmentId}`);
    if (!filas.length) return;
    const lote = JSON.stringify(filas.map((f) => ({
      portal_key: f.key,
      group_name: f.group,
      name: f.name,
      week_number: f.week,
      weight: f.weight,
      value: f.value,
      mark: f.mark,
      assessment_id: f.assessmentId,
      match_rule: f.match,
    })));
    const insertadas = (await tx.execute(sql`
      insert into student_portal_score
        (enrollment_id, portal_key, group_name, name, week_number, weight, value, mark, assessment_id, match_rule)
      select ${enrollmentId}::int, f.portal_key, f.group_name, f.name, f.week_number, f.weight, f.value,
             f.mark, f.assessment_id, f.match_rule
        from json_to_recordset(${lote}::json) as f(
               portal_key text, group_name text, name text, week_number smallint, weight numeric,
               value numeric, mark text, assessment_id integer, match_rule text)
       where f.assessment_id is null
          or exists (
               select 1
                 from enrollment e
                 join section s on s.id = e.section_id
                 join course_offering co on co.id = s.course_offering_id
                 join syllabus sy on sy.course_offering_id = co.id
                 join assessment a on a.syllabus_id = sy.id
                where e.id = ${enrollmentId} and a.id = f.assessment_id)
      returning id
    `)) as unknown as Array<unknown>;
    if (insertadas.length !== filas.length) {
      throw new Error("student_portal_score: una pareja no pertenece a la oferta de la matrícula");
    }
  }
}
