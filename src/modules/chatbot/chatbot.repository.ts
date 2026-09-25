import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import type {
  ChatbotSessionRow,
  ChatbotMessageRow,
  ScheduleData,
  CurriculumData,
  AlertData,
  AnnouncementData,
  OfficialGradeRow,
  SectionRepresentativePerson,
  SectionRepresentativesData,
} from "./chatbot.types.js";

const toMessageRow = (r: Record<string, unknown>): ChatbotMessageRow => ({
  id: r.id as string,
  sessionId: r.session_id as string,
  role: r.role as "user" | "assistant",
  content: r.content as string,
  createdAt: new Date(r.created_at as string),
});

export class ChatbotRepository {
  constructor(readonly database: typeof db) {}

  async createSession(studentId: number): Promise<ChatbotSessionRow> {
    const rows = await this.database.execute(sql`
      INSERT INTO chatbot_session (student_id)
      VALUES (${studentId})
      RETURNING id, student_id, title, created_at, updated_at
    `);
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      studentId: r.student_id as number,
      title: r.title as string,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
    };
  }

  async findSessionById(sessionId: string, studentId: number): Promise<ChatbotSessionRow | null> {
    const rows = await this.database.execute(sql`
      SELECT id, student_id, title, created_at, updated_at
      FROM chatbot_session
      WHERE id = ${sessionId} AND student_id = ${studentId}
    `);
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      studentId: r.student_id as number,
      title: r.title as string,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
    };
  }

  async listSessions(studentId: number): Promise<ChatbotSessionRow[]> {
    const rows = await this.database.execute(sql`
      SELECT id, student_id, title, created_at, updated_at
      FROM chatbot_session
      WHERE student_id = ${studentId}
      ORDER BY updated_at DESC
    `) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      studentId: r.student_id as number,
      title: r.title as string,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
    }));
  }

  async deleteSession(sessionId: string, studentId: number): Promise<boolean> {
    const result = await this.database.execute(sql`
      DELETE FROM chatbot_session
      WHERE id = ${sessionId} AND student_id = ${studentId}
    `);
    return ((result as unknown) as { rowCount: number }).rowCount > 0;
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await this.database.execute(sql`
      UPDATE chatbot_session
      SET title = ${title}, updated_at = now()
      WHERE id = ${sessionId}
    `);
  }

  /** La sesión entera, para `GET /chatbot/sessions/:id`. `ask` usa `getRecentMessages`. */
  async getMessages(sessionId: string): Promise<ChatbotMessageRow[]> {
    const rows = await this.database.execute(sql`
      SELECT id, session_id, role, content, created_at
      FROM chatbot_message
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `) as unknown as Record<string, unknown>[];
    return rows.map(toMessageRow);
  }

  /**
   * BR-CB-20: los `limit` mensajes más recientes de la sesión, en orden
   * cronológico. La consulta los pide del más nuevo al más viejo para que
   * `idx_chatbot_message_session_created` (migración 0013) corte en `limit` sin
   * ordenar la sesión entera, y el código los devuelve al orden de la
   * conversación.
   */
  async getRecentMessages(sessionId: string, limit: number): Promise<ChatbotMessageRow[]> {
    const rows = await this.database.execute(sql`
      SELECT id, session_id, role, content, created_at
      FROM chatbot_message
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as unknown as Record<string, unknown>[];
    return rows.map(toMessageRow).reverse();
  }

  /**
   * BR-CB-21: guarda la pregunta y la respuesta juntas, en una transacción, y
   * marca la actividad de la sesión. Si una sentencia falla no queda ninguna de
   * las dos filas. Las dos toman `clock_timestamp()`, que avanza dentro de la
   * transacción, para que la pregunta quede antes que la respuesta en el
   * `ORDER BY created_at`; con `now()` empatarían. Si la sesión ya no existe, la
   * primera inserción falla con la violación de llave foránea 23503.
   */
  async saveExchange(sessionId: string, question: string, answer: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO chatbot_message (session_id, role, content, created_at)
        VALUES (${sessionId}, ${"user"}, ${question}, clock_timestamp())
      `);
      await tx.execute(sql`
        INSERT INTO chatbot_message (session_id, role, content, created_at)
        VALUES (${sessionId}, ${"assistant"}, ${answer}, clock_timestamp())
      `);
      await tx.execute(sql`
        UPDATE chatbot_session SET updated_at = now() WHERE id = ${sessionId}
      `);
    });
  }

  /**
   * BR-CB-22: borra, de todos los alumnos, las sesiones cuya última actividad
   * es anterior a las 00:00 de Lima del `start_date` del período activo, con sus
   * mensajes por la cascada de `chatbot_message.session_id`. Solo corre si hoy,
   * en Lima, el período ya empezó; sin período activo no borra nada.
   * `updated_at` es `timestamp` sin zona y guarda la hora de pared de la zona de
   * la sesión de la base (la de `now()` al escribir), así que la medianoche de
   * Lima se lleva a esa misma zona. La sentencia es, tal cual, la de la spec.
   */
  async purgeSessionsBeforeActivePeriod(): Promise<void> {
    await this.database.execute(sql`
      DELETE FROM chatbot_session cs
      USING academic_period ap
      WHERE ap.is_active = true
        AND (now() AT TIME ZONE 'America/Lima')::date >= ap.start_date
        AND cs.updated_at < ((ap.start_date::timestamp AT TIME ZONE 'America/Lima')
                             AT TIME ZONE current_setting('TimeZone'))
    `);
  }

  async getSessionsCount(studentId: number): Promise<number> {
    const rows = await this.database.execute(sql`
      SELECT COUNT(*)::int as count
      FROM chatbot_session
      WHERE student_id = ${studentId}
    `);
    return (rows[0] as { count: number }).count ?? 0;
  }

  async getActiveSectionIds(studentId: number): Promise<number[]> {
    const rows = await this.database.execute(sql`
      SELECT e.section_id
      FROM enrollment e
      JOIN student st ON st.id = e.student_id
      WHERE st.id = ${studentId}
        AND e.status = 'active'
    `) as unknown as { section_id: number }[];
    return rows.map((r) => r.section_id);
  }

  async getActiveSectionDetails(studentId: number): Promise<Array<{ sectionId: number; courseName: string; sectionCode: string }>> {
    const rows = await this.database.execute(sql`
      SELECT
        e.section_id as section_id,
        c.name as course_name,
        s.code as section_code
      FROM enrollment e
      JOIN student st ON st.id = e.student_id
      JOIN section s ON s.id = e.section_id
      JOIN course_offering co ON co.id = s.course_offering_id
      JOIN course c ON c.id = co.course_id
      JOIN academic_period ap ON ap.id = co.academic_period_id
      WHERE st.id = ${studentId}
        AND e.status = 'active'
        AND ap.is_active = true
      ORDER BY c.name, s.code
    `) as unknown as { section_id: number; course_name: string; section_code: string }[];
    return rows.map((r) => ({
      sectionId: r.section_id,
      courseName: r.course_name,
      sectionCode: r.section_code,
    }));
  }

  async getSchedule(studentId: number): Promise<ScheduleData[]> {
    const rows = await this.database.execute(sql`
      SELECT
        CASE ss.day_of_week
          WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'Miercoles'
          WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'Sabado'
          WHEN 7 THEN 'Domingo' ELSE 'Desconocido'
        END as day_name,
        ss.start_time::text as start_time,
        ss.end_time::text as end_time,
        c.name as course_name,
        s.code as section_code,
        ss.classroom
      FROM schedule_session ss
      JOIN section s ON s.id = ss.section_id
      JOIN course_offering co ON co.id = s.course_offering_id
      JOIN course c ON c.id = co.course_id
      JOIN academic_period ap ON ap.id = co.academic_period_id
      JOIN enrollment e ON e.section_id = s.id
      JOIN student st ON st.id = e.student_id
      WHERE st.id = ${studentId}
        AND e.status = 'active'
        AND ap.is_active = true
      ORDER BY ss.day_of_week, ss.start_time
    `) as unknown as ScheduleData[];
    return rows;
  }

  async getCurriculum(studentId: number): Promise<CurriculumData[]> {
    const rows = await this.database.execute(sql`
      SELECT
        c.name as course_name,
        cc.cycle,
        scp.status,
        cc.credit
      FROM curriculum_course cc
      JOIN course c ON c.id = cc.course_id
      JOIN curriculum cu ON cu.id = cc.curriculum_id
      JOIN student st ON st.curriculum_id = cu.id
      LEFT JOIN student_course_progress scp
        ON scp.student_id = st.id AND scp.curriculum_course_id = cc.id
      WHERE st.id = ${studentId}
      ORDER BY cc.cycle, cc.display_order
    `) as unknown as CurriculumData[];
    return rows;
  }

  /**
   * Notas OFICIALES (student_score) por evaluación, de la matrícula REAL del
   * período activo. Fuente de la verdad para el chatbot (NO la calculadora del
   * cliente). Incluye evaluaciones sin nota (value = null) para poder calcular
   * cuánto falta para aprobar. Mismo filtro de período activo que `alerts`.
   */
  async getOfficialGrades(studentId: number): Promise<OfficialGradeRow[]> {
    return (await this.database.execute(sql`
      SELECT
        c.id   as course_id,
        c.name as course_name,
        s.code as section_code,
        a.id   as assessment_id,
        a.code as assessment_code,
        a.name as assessment_name,
        a.weight as assessment_weight,
        ss.value as score_value
      FROM enrollment e
      JOIN section s ON s.id = e.section_id
      JOIN course_offering co ON co.id = s.course_offering_id
      JOIN academic_period ap ON ap.id = co.academic_period_id AND ap.is_active = true
      JOIN course c ON c.id = co.course_id
      LEFT JOIN syllabus sy ON sy.course_offering_id = co.id
      LEFT JOIN assessment a ON a.syllabus_id = sy.id
      LEFT JOIN student_score ss ON ss.assessment_id = a.id AND ss.enrollment_id = e.id
      WHERE e.student_id = ${studentId}
        AND e.status = 'active'
      ORDER BY c.name, a.code
    `)) as unknown as OfficialGradeRow[];
  }

  async getAlerts(studentId: number): Promise<AlertData[]> {
    const rows = await this.database.execute(sql`
      SELECT a.type, a.title, a.message, a.is_read, a.created_at
      FROM alert a
      JOIN student st ON st.id = a.student_id
      WHERE st.id = ${studentId}
      ORDER BY a.created_at DESC
      LIMIT 20
    `) as unknown as AlertData[];
    return rows;
  }

  async getAnnouncements(studentId: number): Promise<AnnouncementData[]> {
    const rows = await this.database.execute(sql`
      SELECT
        an.title,
        an.message,
        c.name as course_name,
        s.code as section_code,
        an.published_at
      FROM announcement an
      JOIN section_representative sr ON sr.id = an.section_representative_id
      JOIN enrollment e2 ON e2.id = sr.enrollment_id
      JOIN section s ON s.id = e2.section_id
      JOIN course_offering co ON co.id = s.course_offering_id
      JOIN course c ON c.id = co.course_id
      JOIN academic_period ap ON ap.id = co.academic_period_id
      JOIN enrollment e ON e.section_id = s.id
      JOIN student st ON st.id = e.student_id
      WHERE st.id = ${studentId}
        AND e.status = 'active'
        AND ap.is_active = true
        AND an.is_active = true
      ORDER BY an.published_at DESC
      LIMIT 20
    `) as unknown as AnnouncementData[];
    return rows;
  }

  /**
   * BR-CB-16: delegado y subdelegado de cada sección activa del alumno, en una
   * sola sentencia. Una fila por sección y cargo, ordenadas por curso, sección y
   * cargo; sin LIMIT, porque el tamaño lo acotan las secciones del alumno.
   *
   * Precedencia por cargo, como la pantalla del curso:
   *   1. `section_representative` activo de ESA sección, cuya matrícula también
   *      es de esa sección (sin exigir que siga activa, igual que la pantalla);
   *   2. si no hay, el `section_representative_claim` del portal;
   *   3. si tampoco, el cargo queda vacío.
   * `is_self` marca al propio alumno, por `student.id` o por el código del claim.
   * Solo sale el nombre de quien tiene el cargo: nunca el resto de la nómina.
   */
  async getSectionRepresentatives(studentId: number): Promise<SectionRepresentativesData[]> {
    const rows = await this.database.execute(sql`
      WITH mis_secciones AS (
        SELECT s.id AS section_id, c.name AS course_name, s.code AS section_code
        FROM enrollment e
        JOIN section s ON s.id = e.section_id
        JOIN course_offering co ON co.id = s.course_offering_id
        JOIN course c ON c.id = co.course_id
        JOIN academic_period ap ON ap.id = co.academic_period_id
        WHERE e.student_id = ${studentId}
          AND e.status = 'active'
          AND ap.is_active = true
      ),
      cargos AS (
        SELECT unnest(enum_range(NULL::representative_position)) AS position
      ),
      reales AS (
        SELECT sr.section_id, sr.position, au.full_name, (st.id = ${studentId}) AS is_self
        FROM section_representative sr
        JOIN enrollment er ON er.id = sr.enrollment_id AND er.section_id = sr.section_id
        JOIN student st ON st.id = er.student_id
        JOIN app_user au ON au.id = st.user_id
        WHERE sr.is_active = true
      ),
      yo AS (
        SELECT au.code
        FROM student st
        JOIN app_user au ON au.id = st.user_id
        WHERE st.id = ${studentId}
      )
      SELECT
        ms.section_id,
        ms.course_name,
        ms.section_code,
        k.position::text AS position,
        COALESCE(r.full_name, cl.full_name) AS full_name,
        COALESCE(r.is_self, cl.student_code = (SELECT code FROM yo), false) AS is_self
      FROM mis_secciones ms
      CROSS JOIN cargos k
      LEFT JOIN reales r
        ON r.section_id = ms.section_id AND r.position = k.position
      LEFT JOIN section_representative_claim cl
        ON r.section_id IS NULL AND cl.section_id = ms.section_id AND cl.position = k.position
      ORDER BY ms.course_name, ms.section_code, k.position
    `) as unknown as Array<{
      section_id: number;
      course_name: string;
      section_code: string;
      position: "delegate" | "subdelegate";
      full_name: string | null;
      is_self: boolean;
    }>;

    // Dos filas por sección (una por cargo), contiguas por el ORDER BY. Se
    // agrupan por el id de la sección, que no viaja.
    const porSeccion = new Map<number, SectionRepresentativesData>();
    for (const r of rows) {
      let entrada = porSeccion.get(r.section_id);
      if (!entrada) {
        entrada = { courseName: r.course_name, sectionCode: r.section_code, delegate: null, subdelegate: null };
        porSeccion.set(r.section_id, entrada);
      }
      const titular: SectionRepresentativePerson | null =
        r.full_name == null ? null : { fullName: r.full_name, isSelf: r.is_self === true };
      if (r.position === "delegate") entrada.delegate = titular;
      else if (r.position === "subdelegate") entrada.subdelegate = titular;
    }
    return [...porSeccion.values()];
  }

  async getStudentName(studentId: number): Promise<string> {
    const rows = await this.database.execute(sql`
      SELECT au.full_name
      FROM student st
      JOIN app_user au ON au.id = st.user_id
      WHERE st.id = ${studentId}
    `) as unknown as { full_name: string }[];
    return rows[0]?.full_name ?? "Alumno";
  }

  async getStudentInfo(studentId: number): Promise<{ fullName: string; careerName: string; currentLevel: number } | null> {
    const rows = await this.database.execute(sql`
      SELECT
        au.full_name,
        ca.name as career_name,
        st.current_level
      FROM student st
      JOIN app_user au ON au.id = st.user_id
      JOIN career ca ON ca.id = st.career_id
      WHERE st.id = ${studentId}
    `) as unknown as { full_name: string; career_name: string; current_level: number }[];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      fullName: r.full_name,
      careerName: r.career_name,
      currentLevel: r.current_level,
    };
  }

  async getActiveAcademicPeriod(): Promise<{ id: number; code: string } | null> {
    const rows = await this.database.execute(sql`
      SELECT id, code
      FROM academic_period
      WHERE is_active = true
      LIMIT 1
    `) as unknown as { id: number; code: string }[];
    if (rows.length === 0) return null;
    return { id: rows[0].id, code: rows[0].code };
  }

  async getAcademicWeeksForActivePeriod(): Promise<Array<{ weekNumber: number; startDate: string; endDate: string }>> {
    const rows = await this.database.execute(sql`
      SELECT aw.week_number, aw.start_date::text as start_date, aw.end_date::text as end_date
      FROM academic_week aw
      JOIN academic_period ap ON ap.id = aw.academic_period_id
      WHERE ap.is_active = true
      ORDER BY aw.week_number
    `) as unknown as { week_number: number; start_date: string; end_date: string }[];
    return rows.map((r) => ({
      weekNumber: r.week_number,
      startDate: r.start_date,
      endDate: r.end_date,
    }));
  }
}
