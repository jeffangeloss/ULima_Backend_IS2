import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";
import type { AttendanceRiskRawRow, StudentNotifyRow } from "./attendance-risk.types.js";

// Sin catch de rescate: un fallo de BD se propaga (500 real) en vez de simular
// la lista de riesgo vacía o reportar "0 notificados" cuando en realidad los
// INSERT fallaron. Ver docs/AUDITORIA_TECNICA.md §6.1.
export class AttendanceRiskRepository {
  constructor(readonly database: typeof db) {}

  async findStudentsBySectionId(sectionId: number): Promise<AttendanceRiskRawRow[]> {
    return (await this.database.execute(sql`
      SELECT
        au.code,
        au.full_name,
        s.current_level,
        e.absent_hours,
        COALESCE(co.total_hours, e.total_hours) as total_section_hours,
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
        COALESCE(co.total_hours, e.total_hours) as total_section_hours,
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
  // (No es transaccional: un fallo a mitad deja alertas parciales insertadas.)
  async createAlerts(data: { studentId: number; type: string; title: string; message: string }[]): Promise<number> {
    for (const d of data) {
      await this.database.execute(sql`
        INSERT INTO alert (student_id, type, title, message)
        VALUES (${d.studentId}, ${d.type}, ${d.title}, ${d.message})
      `);
    }
    return data.length;
  }
}
