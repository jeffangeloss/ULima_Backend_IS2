import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";
import type { AttendanceRiskRawRow, StudentNotifyRow } from "./attendance-risk.types.js";

// Sin catch de rescate: un fallo de BD se propaga (500 real) en vez de simular
// la lista de riesgo vacía o reportar "0 notificados" cuando en realidad los
// INSERT fallaron. Ver docs/AUDITORIA_TECNICA.md §6.1.
export class AttendanceRiskRepository {
  constructor(readonly database: typeof db) {}

  // ¿El docente pertenece a esta sección? Acepta al profesor titular
  // (teacher_id) y al JP (jp_id): los dos dictan la sección y necesitan ver
  // quién está en riesgo. A diferencia de official-grades, acá el JP no queda
  // fuera porque esto no es calificar. Ver RS-BE-11.
  async teacherBelongsToSection(teacherId: number, sectionId: number): Promise<boolean> {
    const rows = (await this.database.execute(sql`
      SELECT 1 FROM section
      WHERE id = ${sectionId}
        AND (teacher_id = ${teacherId} OR jp_id = ${teacherId})
      LIMIT 1
    `)) as unknown as Array<unknown>;
    return rows.length > 0;
  }

  /**
   * Duración típica de una sesión de la sección, en horas, o `null` si no hay
   * horario cargado. RS-BE-13.
   *
   * MODA y no promedio: `portal-sync` (paso 8) nunca borra las sesiones que
   * desaparecen del portal, así que una sección que cambió de horario arrastra
   * filas viejas. El promedio se corre con ellas; la moda casi nunca.
   */
  async findModalSessionHours(sectionId: number): Promise<number | null> {
    const rows = (await this.database.execute(sql`
      SELECT mode() WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
             ) AS hours
      FROM schedule_session
      WHERE section_id = ${sectionId}
    `)) as unknown as Array<{ hours: string | null }>;
    const raw = rows[0]?.hours;
    if (raw == null) return null;
    const hours = Number(raw);
    return Number.isFinite(hours) && hours > 0 ? hours : null;
  }

  async findStudentsBySectionId(sectionId: number): Promise<AttendanceRiskRawRow[]> {
    return (await this.database.execute(sql`
      SELECT
        au.code,
        au.full_name,
        s.current_level,
        e.absent_hours,
        -- RS-BE-15: una vez que existe el total del PROPIO alumno (lo escribe la
        -- importación desde su página del portal), ese es el denominador. El de
        -- la oferta usa max() entre secciones, así que no representa a ninguna
        -- sección en particular y queda solo como respaldo. La versión anterior
        -- era COALESCE(co.total_hours, e.total_hours), cuya segunda rama era
        -- código muerto: co.total_hours es NOT NULL DEFAULT '0' y el join INNER.
        COALESCE(NULLIF(e.total_hours, 0), co.total_hours) as total_section_hours,
        e.total_hours as enrollment_total_hours,
        cc.cycle
      FROM enrollment e
      JOIN student s ON s.id = e.student_id
      JOIN app_user au ON au.id = s.user_id
      JOIN section sec ON sec.id = e.section_id
      JOIN course_offering co ON co.id = sec.course_offering_id
      JOIN course c ON c.id = co.course_id
      JOIN curriculum_course cc ON cc.course_id = c.id AND cc.curriculum_id = s.curriculum_id
      WHERE e.section_id = ${sectionId}
        AND e.status = 'active'
      ORDER BY au.full_name
    `)) as unknown as AttendanceRiskRawRow[];
  }

  async findStudentDetailsBySectionId(sectionId: number): Promise<StudentNotifyRow[]> {
    return (await this.database.execute(sql`
      SELECT
        s.id as student_id,
        au.code,
        au.full_name,
        s.current_level,
        e.absent_hours,
        -- RS-BE-15: una vez que existe el total del PROPIO alumno (lo escribe la
        -- importación desde su página del portal), ese es el denominador. El de
        -- la oferta usa max() entre secciones, así que no representa a ninguna
        -- sección en particular y queda solo como respaldo. La versión anterior
        -- era COALESCE(co.total_hours, e.total_hours), cuya segunda rama era
        -- código muerto: co.total_hours es NOT NULL DEFAULT '0' y el join INNER.
        COALESCE(NULLIF(e.total_hours, 0), co.total_hours) as total_section_hours,
        e.total_hours as enrollment_total_hours,
        c.name as course_name,
        sec.code as section_code,
        cc.cycle
      FROM enrollment e
      JOIN student s ON s.id = e.student_id
      JOIN app_user au ON au.id = s.user_id
      JOIN section sec ON sec.id = e.section_id
      JOIN course_offering co ON co.id = sec.course_offering_id
      JOIN course c ON c.id = co.course_id
      JOIN curriculum_course cc ON cc.course_id = c.id AND cc.curriculum_id = s.curriculum_id
      WHERE e.section_id = ${sectionId}
        AND e.status = 'active'
      ORDER BY au.full_name
    `)) as unknown as StudentNotifyRow[];
  }

  // Inserta las alertas y devuelve cuántas. Un fallo de un INSERT propaga (no se
  // traga por-fila): así notifyStudents (HU22) ya no puede reportar "0 alumnos
  // notificados" cuando en realidad los INSERT fallaron. Sin catch por-fila el
  // contador siempre acaba en data.length, así que se devuelve directo.
  async createAlerts(data: { studentId: number; type: string; title: string; message: string }[]): Promise<number> {
    if (data.length === 0) return 0;
    // RS-BE-14: todo o nada. Antes iban en un `for` sin transacción, así que un
    // fallo a mitad dejaba alertas parciales; reintentar duplicaba las de los
    // primeros alumnos (`alert` no tiene única que lo impida) y el docente no
    // tenía forma de saber a quiénes ya les había llegado.
    await this.database.transaction(async (tx) => {
      for (const d of data) {
        await tx.execute(sql`
          INSERT INTO alert (student_id, type, title, message)
          VALUES (${d.studentId}, ${d.type}, ${d.title}, ${d.message})
        `);
      }
    });
    return data.length;
  }
}
