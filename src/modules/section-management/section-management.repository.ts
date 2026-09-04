import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";
import type {
  AnnouncementOwnership,
  AnnouncementRow,
  RepresentativeAccess,
  SectionRepresentativeRow,
} from "./section-management.types.js";

export class SectionManagementRepository {
  constructor(readonly database: typeof db) {}

  async findRepresentativesByStudent(studentId: number): Promise<SectionRepresentativeRow[]> {
    return (await this.database.execute(sql`
      select
        sr.id,
        sr.enrollment_id,
        sr.position,
        sr.section_id,
        sec.code as section_code,
        c.id as course_id,
        c.name as course_name,
        count(active_enrollment.id) as enrolled_students
      from section_representative sr
      join enrollment e on e.id = sr.enrollment_id
      join section sec on sec.id = sr.section_id
      join course_offering co on co.id = sec.course_offering_id
      join course c on c.id = co.course_id
      left join enrollment active_enrollment
        on active_enrollment.section_id = sec.id
       and active_enrollment.status = 'active'
      where sr.is_active = true
        and sr.position in ('delegate', 'subdelegate')
        and e.student_id = ${studentId}
        and e.status = 'active'
      -- El cargo vale SOLO en el ciclo vigente. La tabla de representantes no
      -- tiene columna de período: el ciclo sale de la sección, y sin este join
      -- un delegado de 2026-1 conserva el cargo para siempre.
        and exists (
          select 1 from academic_period ap
          where ap.id = co.academic_period_id and ap.is_active = true
        )
      group by sr.id, sr.enrollment_id, sr.position, sr.section_id, sec.code, c.id, c.name
      order by c.name, sec.code
    `)) as unknown as SectionRepresentativeRow[];
  }

  async findRepresentativeAccess(
    studentId: number,
    sectionId: number,
  ): Promise<RepresentativeAccess | null> {
    const rows = (await this.database.execute(sql`
      select
        sr.id,
        sr.section_id,
        e.student_id,
        sr.position
      from section_representative sr
      join enrollment e on e.id = sr.enrollment_id
      join section sec on sec.id = sr.section_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id
      where sr.section_id = ${sectionId}
        and e.student_id = ${studentId}
        and e.status = 'active'
        and sr.is_active = true
        and sr.position in ('delegate', 'subdelegate')
      -- El cargo vale SOLO en el ciclo vigente. La tabla de representantes no
      -- tiene columna de período: el ciclo sale de la sección, y sin este join
      -- un delegado de 2026-1 conserva el cargo para siempre.
        and ap.is_active = true
      limit 1
    `)) as unknown as Array<{
      id: number;
      section_id: number;
      student_id: number;
      position: RepresentativeAccess["position"];
    }>;

    const row = rows[0];
    return row
      ? {
          id: Number(row.id),
          sectionId: Number(row.section_id),
          studentId: Number(row.student_id),
          position: row.position,
        }
      : null;
  }

  async findAnnouncementsByRepresentative(
    sectionRepresentativeId: number,
  ): Promise<AnnouncementRow[]> {
    return (await this.database.execute(sql`
      select
        a.id,
        sr.section_id,
        a.section_representative_id,
        a.title,
        a.message,
        a.published_at,
        au.code as autor_code,
        au.full_name,
        au.institutional_email,
        sr.position
      from announcement a
      join section_representative sr on sr.id = a.section_representative_id
      join enrollment e on e.id = sr.enrollment_id
      join student st on st.id = e.student_id
      join app_user au on au.id = st.user_id
      where a.section_representative_id = ${sectionRepresentativeId}
        and a.is_active = true
      order by a.published_at desc
    `)) as unknown as AnnouncementRow[];
  }

  async findAnnouncementById(id: number): Promise<AnnouncementRow | null> {
    const rows = (await this.database.execute(sql`
      select
        a.id,
        sr.section_id,
        a.section_representative_id,
        a.title,
        a.message,
        a.published_at,
        au.code as autor_code,
        au.full_name,
        au.institutional_email,
        sr.position
      from announcement a
      join section_representative sr on sr.id = a.section_representative_id
      join enrollment e on e.id = sr.enrollment_id
      join student st on st.id = e.student_id
      join app_user au on au.id = st.user_id
      where a.id = ${id}
        and a.is_active = true
      limit 1
    `)) as unknown as AnnouncementRow[];

    return rows[0] ?? null;
  }

  async findAnnouncementOwnership(id: number): Promise<AnnouncementOwnership | null> {
    const rows = (await this.database.execute(sql`
      select
        a.id,
        a.section_representative_id,
        sr.section_id,
        e.student_id,
        a.is_active
      from announcement a
      join section_representative sr on sr.id = a.section_representative_id
      join enrollment e on e.id = sr.enrollment_id
      where a.id = ${id}
      limit 1
    `)) as unknown as Array<{
      id: number;
      section_representative_id: number;
      section_id: number;
      student_id: number;
      is_active: boolean;
    }>;

    const row = rows[0];
    return row
      ? {
          id: Number(row.id),
          sectionRepresentativeId: Number(row.section_representative_id),
          sectionId: Number(row.section_id),
          studentId: Number(row.student_id),
          isActive: Boolean(row.is_active),
        }
      : null;
  }

  async createAnnouncement(input: {
    sectionRepresentativeId: number;
    title: string;
    message: string;
  }): Promise<number> {
    const rows = (await this.database.execute(sql`
      insert into announcement (section_representative_id, title, message)
      values (${input.sectionRepresentativeId}, ${input.title}, ${input.message})
      returning id
    `)) as unknown as Array<{ id: number }>;

    return Number(rows[0].id);
  }

  async updateAnnouncement(input: {
    id: number;
    title: string;
    message: string;
  }): Promise<void> {
    await this.database.execute(sql`
      update announcement
      set title = ${input.title},
          message = ${input.message}
      where id = ${input.id}
        and is_active = true
    `);
  }

  async softDeleteAnnouncement(id: number): Promise<void> {
    await this.database.execute(sql`
      update announcement
      set is_active = false
      where id = ${id}
        and is_active = true
    `);
  }

  // HU11: notas oficiales por (matrícula activa, evaluación) de la sección, para
  // calcular las estadísticas del salón. `value` es null si la evaluación aún no
  // fue calificada (la lógica pura la ignora).
  async findSectionScoresForStats(
    sectionId: number,
  ): Promise<Array<{ enrollment_id: number; weight: string | null; value: string | null }>> {
    return (await this.database.execute(sql`
      select e.id as enrollment_id, a.weight, ss.value
      from enrollment e
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      join syllabus sy on sy.course_offering_id = co.id
      join assessment a on a.syllabus_id = sy.id
      left join student_score ss on ss.assessment_id = a.id and ss.enrollment_id = e.id
      where e.section_id = ${sectionId}
        and e.status = 'active'
    `)) as unknown as Array<{ enrollment_id: number; weight: string | null; value: string | null }>;
  }
}
