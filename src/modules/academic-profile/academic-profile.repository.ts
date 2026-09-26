import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";
import type {
  ActiveSpecialty,
  CareerResponse,
  ProfileBase,
  SelectionType,
  SpecialtyResponse,
  UpdateSpecialtiesResult,
} from "./academic-profile.types.js";

type ProfileRow = {
  id: number;
  student_id: number;
  code: string;
  full_name: string;
  institutional_email: string;
  current_level: number | null;
  specialty_setup_completed: boolean;
  career_id: number;
  career_code: string;
  career_name: string;
  faculty: string;
  curriculum_id: number;
  curriculum_name: string;
};

type CareerRow = {
  id: number;
  code: string;
  name: string;
  faculty: string;
};

type SpecialtyRow = {
  id: number;
  career_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
};

type ActiveSpecialtyRow = {
  specialty_id: number;
  name: string;
  selection_type: SelectionType;
};

// Los métodos NO atrapan errores de BD: un fallo de la consulta se propaga al
// errorHandler global (500 real). Devolver datos falsos/vacíos con 200 ocultaba
// endpoints rotos como "pantalla vacía" (ver docs/AUDITORIA_TECNICA.md §6.1).
// El único valor de "ausencia" legítimo es `null`/`[]` cuando la consulta corre
// bien y no hay fila; eso lo distingue el service (→ 404), no un catch.
export class AcademicProfileRepository {
  constructor(readonly database: typeof db) {}

  async findProfileByUserId(userId: number): Promise<ProfileBase | null> {
    const rows = await this.database.execute(sql`
      select
        au.id,
        s.id as student_id,
        au.code,
        au.full_name,
        au.institutional_email,
        s.current_level,
        s.specialty_setup_completed,
        c.id as career_id,
        c.code as career_code,
        c.name as career_name,
        c.faculty,
        cu.id as curriculum_id,
        cu.name as curriculum_name
      from app_user au
      join student s on s.user_id = au.id
      join career c on c.id = s.career_id
      join curriculum cu on cu.id = s.curriculum_id
      where au.id = ${userId}
      limit 1
    `) as unknown as ProfileRow[];

    const row = rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      studentId: Number(row.student_id),
      code: row.code,
      fullName: row.full_name,
      institutionalEmail: row.institutional_email,
      currentLevel: row.current_level == null ? null : Number(row.current_level),
      setupComplete: Boolean(row.specialty_setup_completed),
      career: {
        id: Number(row.career_id),
        code: row.career_code,
        name: row.career_name,
        faculty: row.faculty,
      },
      curriculum: {
        id: Number(row.curriculum_id),
        name: row.curriculum_name,
      },
    };
  }

  async findActiveSpecialties(studentId: number): Promise<ActiveSpecialty[]> {
    const rows = await this.database.execute(sql`
      select
        sp.id as specialty_id,
        sp.name,
        ss.selection_type
      from student_specialty ss
      join specialty sp on sp.id = ss.specialty_id
      where ss.student_id = ${studentId}
        and ss.is_active = true
      order by case ss.selection_type when 'primary' then 0 else 1 end, sp.name
    `) as unknown as ActiveSpecialtyRow[];

    return rows.map((row) => ({
      specialtyId: Number(row.specialty_id),
      name: row.name,
      selectionType: row.selection_type,
    }));
  }

  async findAllCareers(): Promise<CareerResponse[]> {
    const rows = await this.database.execute(sql`
      select id, code, name, faculty
      from career
      order by name
    `) as unknown as CareerRow[];

    return rows.map((row, index) => ({
      id: Number(row.id),
      code: row.code,
      name: row.name,
      faculty: row.faculty,
      is_active: true,
      display_order: index + 1,
    }));
  }

  async findSpecialtiesByCareerId(careerId: number): Promise<SpecialtyResponse[]> {
    const rows = await this.database.execute(sql`
      select id, career_id, name, description, is_active
      from specialty
      where career_id = ${careerId}
        and is_active = true
      order by name
    `) as unknown as SpecialtyRow[];

    return rows.map((row, index) => ({
      id: Number(row.id),
      careerId: Number(row.career_id),
      carrera_id: Number(row.career_id),
      name: row.name,
      description: row.description,
      is_active: Boolean(row.is_active),
      display_order: index + 1,
    }));
  }

  async findSpecialtiesByStudentCareer(studentId: number): Promise<SpecialtyResponse[]> {
    const rows = await this.database.execute(sql`
      select career_id
      from student
      where id = ${studentId}
      limit 1
    `) as unknown as Array<{ career_id: number }>;

    const careerId = rows[0]?.career_id;
    return careerId == null ? [] : this.findSpecialtiesByCareerId(Number(careerId));
  }

  async deactivateAllStudentSpecialties(studentId: number): Promise<void> {
    await this.database.execute(sql`
      update student_specialty
      set is_active = false
      where student_id = ${studentId}
        and is_active = true
    `);
  }

  async upsertStudentSpecialty(
    studentId: number,
    specialtyId: number,
    selectionType: SelectionType,
  ): Promise<void> {
    await this.database.execute(sql`
      insert into student_specialty (student_id, specialty_id, selection_type, is_active)
      values (${studentId}, ${specialtyId}, ${selectionType}, true)
      on conflict (student_id, specialty_id)
      do update set
        selection_type = excluded.selection_type,
        is_active = true
    `);
  }

  /**
   * BR-AP-08: el reemplazo entero en una sola transacción. Desactiva las
   * especialidades del alumno, inserta o reactiva la principal y las de
   * interés, y marca `specialty_setup_completed`. Si algo falla, la base
   * conserva el estado previo y el error sube tal cual, para que el service
   * siga traduciendo el 23505 a `409 DUPLICATE_PRIMARY`. Abre la transacción
   * como `academic-record.repository.ts:110`, porque el service no puede
   * importar `db` (AGENTS.md), y reusa los métodos de abajo sobre `tx`.
   */
  async replaceStudentSpecialties(
    studentId: number,
    primarySpecialtyId: number | null,
    interestSpecialtyIds: readonly number[],
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const enLaTransaccion = new AcademicProfileRepository(tx as unknown as typeof db);
      await enLaTransaccion.deactivateAllStudentSpecialties(studentId);
      if (primarySpecialtyId != null) {
        await enLaTransaccion.upsertStudentSpecialty(studentId, primarySpecialtyId, "primary");
      }
      for (const specialtyId of interestSpecialtyIds) {
        await enLaTransaccion.upsertStudentSpecialty(studentId, specialtyId, "interest");
      }
      await enLaTransaccion.markSpecialtySetupCompleted(studentId);
    });
  }

  async markSpecialtySetupCompleted(studentId: number): Promise<void> {
    await this.database.execute(sql`
      update student
      set specialty_setup_completed = true
      where id = ${studentId}
    `);
  }

  async specialtyExists(specialtyId: number): Promise<boolean> {
    const rows = await this.database.execute(sql`
      select 1
      from specialty
      where id = ${specialtyId}
      limit 1
    `) as unknown as Array<{ "?column?": number }>;

    return rows.length > 0;
  }

  async specialtyBelongsToCareer(specialtyId: number, careerId: number): Promise<boolean> {
    const rows = await this.database.execute(sql`
      select 1
      from specialty
      where id = ${specialtyId}
        and career_id = ${careerId}
        and is_active = true
      limit 1
    `) as unknown as Array<{ "?column?": number }>;

    return rows.length > 0;
  }

  async currentSpecialtySelection(studentId: number): Promise<UpdateSpecialtiesResult["specialties"]> {
    const rows = await this.database.execute(sql`
      select specialty_id, selection_type
      from student_specialty
      where student_id = ${studentId}
        and is_active = true
      order by case selection_type when 'primary' then 0 else 1 end, specialty_id
    `) as unknown as Array<{ specialty_id: number; selection_type: SelectionType }>;

    return rows.map((row) => ({
      specialtyId: Number(row.specialty_id),
      selectionType: row.selection_type,
    }));
  }
}
