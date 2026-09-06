import { partirNombre as splitName } from "../../shared/utils/nombre-persona.js";
import type { db } from "../../db/index.js";
import { sql } from "drizzle-orm";
import type {
  AppRole,
  AuthCurrentCourse,
  AuthSpecialty,
  AuthUser,
  AuthUserWithPassword,
  PasswordResetTokenRecord,
  PasswordResetUser,
  TeacherAuthUser,
  TeacherAuthUserWithPassword,
  TeacherLabel,
} from "./auth.types.js";

type UserRow = {
  id: number;
  code: string;
  full_name: string;
  institutional_email: string;
  password_hash?: string;
  token_version: number;
  student_id: number;
  career_id: number;
  curriculum_id: number;
  current_level: number | null;
  specialty_setup_completed: boolean;
};

type SpecialtyRow = {
  specialty_id: number;
  name: string;
  selection_type: "primary" | "interest";
};

type PasswordResetUserRow = {
  id: number;
  institutional_email: string;
};

type PasswordResetTokenRow = {
  id: number;
  token_hash: string;
  expires_at: string | Date;
  used_at: string | Date | null;
  attempts: number;
};

type CurrentCourseRow = {
  section_id: number;
  section_code: string;
  curriculum_course_id: number | null;
  course_id: number;
  course_name: string;
  period_code: string | null;
};

type TeacherRow = {
  id: number;
  code: string;
  full_name: string;
  institutional_email: string;
  password_hash?: string;
  token_version: number;
  teacher_id: number;
};


/**
 * PISO de ciclos que se dan por cumplidos. NO es una afirmación sobre las notas
 * del alumno: es el relleno de lo que no se pudo emparejar contra la malla.
 *
 * La malla cambió, así que el récord de un alumno de ciclo alto trae buena
 * parte de sus cursos con los códigos de la malla ANTERIOR, que no existen en
 * `curriculum_course`; lo mismo pasa con convalidaciones. En la importación
 * real esas filas se omiten (el warning PROGRESS_SKIPPED de portal-sync) y por
 * eso la cobertura de los ciclos bajos queda llena de huecos: 20233903, que
 * está en ciclo 8, tiene 0/6, 2/6, 0/6, 2/6 y 3/6 obligatorios aprobados en los
 * ciclos 1..5. Nadie llega a ciclo 8 sin aprobar el 1: el hueco es del
 * emparejamiento, no del alumno.
 *
 * Es el mismo recorte —y por la misma razón— que hace `levelFromCoverage` en
 * portal-sync.repository.ts.
 *
 * Es un PISO y nunca un techo: el nivel no acota lo que el alumno pudo aprobar.
 * El plan de estudios pide requisitos POR CURSO, no por ciclo (AUDITORÍA, ciclo
 * 8, solo exige GESTIÓN FINANCIERA, ciclo 6), así que adelantarse de ciclo es
 * normal. Lo que el alumno aprobó de verdad se SUMA encima de este piso en
 * `buildUser`; sin esa suma, un aprobado del propio ciclo o de uno superior
 * quedaba invisible.
 */
const approvedLevelsFor = (currentLevel: number | null) => {
  if (currentLevel == null || currentLevel <= 1) return [];
  return Array.from({ length: currentLevel - 1 }, (_, index) => index + 1);
};

const mapRole = (position?: "delegate" | "subdelegate" | null): AppRole => {
  if (position === "delegate" || position === "subdelegate") return position;
  return "student";
};

export class AuthRepository {
  constructor(readonly database: typeof db) {}

  async incrementTokenVersion(userId: number): Promise<number> {
    const rows = await this.database.execute(sql`
      update app_user
      set token_version = token_version + 1
      where id = ${userId}
      returning token_version
    `) as unknown as Array<{ token_version: number }>;

    return Number(rows[0]?.token_version ?? 1);
  }

  /** Vincula (guarda) el ID único de Google (`sub`) del usuario al autenticarse
   *  con Google SSO. Idempotente: solo escribe si cambió. */
  async linkGoogleId(userId: number, googleId: string): Promise<void> {
    await this.database.execute(sql`
      update app_user
      set google_id = ${googleId}
      where id = ${userId}
        and (google_id is null or google_id <> ${googleId})
    `);
  }

  async findByCodeWithPassword(code: string): Promise<AuthUserWithPassword | null> {
    const rows = await this.database.execute(sql`
      select
        au.id,
        au.code,
        au.full_name,
        au.institutional_email,
        au.password_hash,
        au.token_version,
        s.id as student_id,
        s.career_id,
        s.curriculum_id,
        s.current_level,
        s.specialty_setup_completed
      from app_user au
      join student s on s.user_id = au.id
      where au.code = ${code.trim()}
      limit 1
    `) as unknown as UserRow[];

    const row = rows[0];
    if (!row || !row.password_hash) return null;

    const user = await this.buildUser(row, "student");
    return {
      ...user,
      passwordHash: row.password_hash,
    };
  }

  async findByEmail(institutionalEmail: string): Promise<AuthUser | null> {
    const rows = await this.database.execute(sql`
      select
        au.id,
        au.code,
        au.full_name,
        au.institutional_email,
        au.token_version,
        s.id as student_id,
        s.career_id,
        s.curriculum_id,
        s.current_level,
        s.specialty_setup_completed
      from app_user au
      join student s on s.user_id = au.id
      where lower(au.institutional_email) = ${institutionalEmail.trim().toLowerCase()}
      limit 1
    `) as unknown as UserRow[];

    const row = rows[0];
    if (!row) return null;

    const user = await this.buildUser(row, "student");
    return user;
  }

  async findById(userId: number, role: AppRole): Promise<AuthUser | null> {
    const rows = await this.database.execute(sql`
      select
        au.id,
        au.code,
        au.full_name,
        au.institutional_email,
        au.token_version,
        s.id as student_id,
        s.career_id,
        s.curriculum_id,
        s.current_level,
        s.specialty_setup_completed
      from app_user au
      join student s on s.user_id = au.id
      where au.id = ${userId}
      limit 1
    `) as unknown as UserRow[];

    const row = rows[0];
    return row ? this.buildUser(row, role) : null;
  }

  /**
   * HU18: busca un perfil DOCENTE por código de login (`app_user.code`) uniendo
   * `teacher.user_id`. Devuelve null si el código no corresponde a un docente
   * con cuenta (p. ej. es un alumno, o un docente sin `user_id`).
   */
  async findTeacherByCodeWithPassword(code: string): Promise<TeacherAuthUserWithPassword | null> {
    const rows = await this.database.execute(sql`
      select
        au.id,
        au.code,
        au.full_name,
        au.institutional_email,
        au.password_hash,
        au.token_version,
        t.id as teacher_id
      from app_user au
      join teacher t on t.user_id = au.id
      where au.code = ${code.trim()}
      limit 1
    `) as unknown as TeacherRow[];

    const row = rows[0];
    if (!row || !row.password_hash) return null;

    const label = await this.deriveTeacherLabel(Number(row.teacher_id));
    return {
      ...this.buildTeacherUser(row, label),
      passwordHash: row.password_hash,
    };
  }

  /** HU18: perfil docente por el correo de `app_user` para Google SSO. El
   * correo referencial de `teacher` puede ser null; la identidad autenticable
   * siempre vive en `app_user.institutional_email`. */
  async findTeacherByEmail(institutionalEmail: string): Promise<TeacherAuthUser | null> {
    const rows = await this.database.execute(sql`
      select
        au.id,
        au.code,
        au.full_name,
        au.institutional_email,
        au.token_version,
        t.id as teacher_id
      from app_user au
      join teacher t on t.user_id = au.id
      where lower(au.institutional_email) = ${institutionalEmail.trim().toLowerCase()}
      limit 1
    `) as unknown as TeacherRow[];

    const row = rows[0];
    if (!row) return null;

    const label = await this.deriveTeacherLabel(Number(row.teacher_id));
    return this.buildTeacherUser(row, label);
  }

  /** HU18: perfil docente por id de `app_user` (para `GET /auth/me`). */
  async findTeacherById(userId: number): Promise<TeacherAuthUser | null> {
    const rows = await this.database.execute(sql`
      select
        au.id,
        au.code,
        au.full_name,
        au.institutional_email,
        au.token_version,
        t.id as teacher_id
      from app_user au
      join teacher t on t.user_id = au.id
      where au.id = ${userId}
      limit 1
    `) as unknown as TeacherRow[];

    const row = rows[0];
    if (!row) return null;

    const label = await this.deriveTeacherLabel(Number(row.teacher_id));
    return this.buildTeacherUser(row, label);
  }

  /** "Jefe de Práctica" si el teacher es `jp_id` de alguna sección; si no, "Profesor". */
  async deriveTeacherLabel(teacherId: number): Promise<TeacherLabel> {
    const rows = await this.database.execute(sql`
      select 1 from section where jp_id = ${teacherId} limit 1
    `) as unknown as Array<{ "?column?": number }>;
    return rows.length > 0 ? "Jefe de Práctica" : "Profesor";
  }

  private buildTeacherUser(row: TeacherRow, teacherLabel: TeacherLabel): TeacherAuthUser {
    const names = splitName(row.full_name);
    return {
      id: Number(row.id),
      teacherId: Number(row.teacher_id),
      code: row.code,
      tokenVersion: Number(row.token_version),
      fullName: row.full_name,
      ...names,
      institutionalEmail: row.institutional_email,
      email: row.institutional_email,
      role: "teacher",
      teacherLabel,
      setupComplete: true,
    };
  }

  async hasActiveEnrollment(studentId: number): Promise<boolean> {
    const rows = await this.database.execute(sql`
      select 1
      from enrollment
      where student_id = ${studentId}
        and status = 'active'
      limit 1
    `) as unknown as Array<{ "?column?": number }>;

    return rows.length > 0;
  }

  async findActiveRepresentation(studentId: number): Promise<{ position: AppRole } | null> {
    const rows = await this.database.execute(sql`
      select sr.position
      from section_representative sr
      join enrollment e on e.id = sr.enrollment_id
      join section sec on sec.id = sr.section_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id
      where e.student_id = ${studentId}
        and e.status = 'active'
        and sr.is_active = true
      -- El cargo vale SOLO en el ciclo vigente. La tabla de representantes no
      -- tiene columna de período: el ciclo sale de la sección, y sin este join
      -- un delegado de 2026-1 conserva el cargo para siempre.
        and ap.is_active = true
      order by case sr.position when 'delegate' then 0 when 'subdelegate' then 1 else 2 end
      limit 1
    `) as unknown as Array<{ position: "delegate" | "subdelegate" | null }>;

    const role = mapRole(rows[0]?.position);
    return role === "student" ? null : { position: role };
  }

  /** Busca la cuenta por código de alumno O correo institucional (flujo password reset). */
  async findUserForPasswordReset(identifier: string): Promise<PasswordResetUser | null> {
    const value = identifier.trim();
    const rows = await this.database.execute(sql`
      select au.id, au.institutional_email
      from app_user au
      where au.code = ${value}
         or au.institutional_email = ${value}
      limit 1
    `) as unknown as PasswordResetUserRow[];

    const row = rows[0];
    return row ? { id: Number(row.id), institutionalEmail: row.institutional_email } : null;
  }

  /** Igual que `findUserForPasswordReset`, pero por id de usuario (JWT). */
  async findUserForPasswordResetById(userId: number): Promise<PasswordResetUser | null> {
    const rows = await this.database.execute(sql`
      select au.id, au.institutional_email
      from app_user au
      where au.id = ${userId}
      limit 1
    `) as unknown as PasswordResetUserRow[];

    const row = rows[0];
    return row ? { id: Number(row.id), institutionalEmail: row.institutional_email } : null;
  }

  /** Cuenta tokens de restablecimiento creados desde `since` (rate limit por usuario). */
  async countRecentPasswordResetTokens(userId: number, since: Date): Promise<number> {
    const rows = await this.database.execute(sql`
      select count(*)::int as total
      from password_reset_token
      where user_id = ${userId}
        and created_at >= ${since.toISOString()}
    `) as unknown as Array<{ total: number }>;

    return Number(rows[0]?.total ?? 0);
  }

  /** Invalida (marca como usados) todos los tokens activos del usuario. */
  async invalidateActivePasswordResetTokens(userId: number): Promise<void> {
    await this.database.execute(sql`
      update password_reset_token
      set used_at = now()
      where user_id = ${userId}
        and used_at is null
    `);
  }

  async createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.execute(sql`
      insert into password_reset_token (user_id, token_hash, expires_at)
      values (${userId}, ${tokenHash}, ${expiresAt.toISOString()})
    `);
  }

  /** Devuelve el token de restablecimiento más reciente del usuario (usado o no). */
  async findLatestPasswordResetToken(userId: number): Promise<PasswordResetTokenRecord | null> {
    const rows = await this.database.execute(sql`
      select id, token_hash, expires_at, used_at, attempts
      from password_reset_token
      where user_id = ${userId}
      order by created_at desc, id desc
      limit 1
    `) as unknown as PasswordResetTokenRow[];

    const row = rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at == null ? null : new Date(row.used_at),
      attempts: Number(row.attempts),
    };
  }

  /**
   * Reserva atómicamente un intento de validación (attempts + 1). Devuelve el
   * registro actualizado, o null si el token ya fue usado o agotó sus
   * intentos: el UPDATE condicional garantiza el límite bajo concurrencia.
   */
  async consumePasswordResetAttempt(tokenId: number, maxAttempts: number): Promise<PasswordResetTokenRecord | null> {
    const rows = await this.database.execute(sql`
      update password_reset_token
      set attempts = attempts + 1
      where id = ${tokenId} and used_at is null and attempts < ${maxAttempts}
      returning id, token_hash, expires_at, used_at, attempts
    `) as unknown as PasswordResetTokenRow[];

    const row = rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at == null ? null : new Date(row.used_at),
      attempts: Number(row.attempts),
    };
  }

  async markPasswordResetTokenUsed(tokenId: number): Promise<void> {
    await this.database.execute(sql`
      update password_reset_token
      set used_at = now()
      where id = ${tokenId}
    `);
  }

  /** Actualiza el hash de contraseña e invalida todas las sesiones (token_version + 1). */
  async updatePasswordAndInvalidateSessions(userId: number, passwordHash: string): Promise<void> {
    await this.database.execute(sql`
      update app_user
      set password_hash = ${passwordHash},
          token_version = token_version + 1
      where id = ${userId}
    `);
  }

  private async buildUser(row: UserRow, role: AppRole): Promise<AuthUser> {
    const [specialties, currentCourses, approvedCourseIds] = await Promise.all([
      this.findActiveSpecialties(Number(row.student_id)),
      this.findCurrentCourses(Number(row.student_id), Number(row.curriculum_id)),
      this.findApprovedCourseIds(Number(row.student_id)),
    ]);

    const primary = specialties.find((specialty) => specialty.selectionType === "primary")?.specialtyId ?? null;
    const interest = specialties
      .filter((specialty) => specialty.selectionType === "interest")
      .map((specialty) => specialty.specialtyId);
    const combined = [
      ...(primary == null ? [] : [primary]),
      ...interest.filter((id) => id !== primary),
    ];
    const names = splitName(row.full_name);
    const currentLevel = row.current_level == null ? null : Number(row.current_level);
    // Sin matrícula en el ciclo activo (p. ej. antes de importar el ciclo nuevo
    // desde el portal), currentCycle cae al código del período activo en vez
    // de un ciclo hardcodeado; si tampoco hay período activo, null.
    const currentCycle = currentCourses[0]?.period_code ?? await this.findActivePeriodCode();

    return {
      id: Number(row.id),
      studentId: Number(row.student_id),
      code: row.code,
      tokenVersion: Number(row.token_version),
      fullName: row.full_name,
      ...names,
      institutionalEmail: row.institutional_email,
      email: row.institutional_email,
      role,
      careerId: Number(row.career_id),
      career_id: Number(row.career_id),
      curriculumId: Number(row.curriculum_id),
      currentLevel,
      currentCycle,
      setupComplete: Boolean(row.specialty_setup_completed),
      specialtySetupCompleted: Boolean(row.specialty_setup_completed),
      especialidad_principal: primary,
      especialidades_interes: interest,
      especialidades: combined,
      specialties,
      // La malla se arma con la UNIÓN de dos cosas, no con una sola:
      //
      //   approvedLevels    → piso para lo que no se pudo emparejar (ver
      //                       `approvedLevelsFor`). Sin él, los obligatorios de
      //                       ciclos bajos que quedaron fuera del emparejamiento
      //                       figurarían pendientes y bloquearían por
      //                       prerrequisito media malla.
      //   approvedCourseIds → lo que el alumno aprobó DE VERDAD, curso por
      //                       curso, según lo que importó portal-sync.
      //
      // Antes solo viajaba el piso, con la lista de ids fija en `[]`. Eso hacía
      // que un curso se viera aprobado únicamente si su ciclo era MENOR al del
      // alumno, así que un aprobado del propio ciclo o de uno superior
      // desaparecía (20233903 con AUDITORÍA, ciclo 8; 20235218 con GESTIÓN DE
      // PROYECTOS, ciclo 9) y NINGÚN electivo aprobado se mostraba jamás.
      //
      // `approvedElectives` repite `approvedCourseIds` a propósito: es el único
      // campo de ids que sabe leer el Flutter ya instalado
      // (malla_logic.dart hace `approved.addAll(progress.approvedElectives)`),
      // y ese cliente une ambas fuentes igual que acá. Llenarlo arregla la
      // malla de las apps ya publicadas sin esperar una nueva versión. Cuando
      // no queden clientes viejos, este campo se borra y queda solo el de
      // arriba, que es el que dice la verdad en su nombre.
      courseProgress: {
        approvedLevels: approvedLevelsFor(currentLevel),
        approvedCourseIds,
        approvedElectives: approvedCourseIds,
        currentCourses,
      },
    };
  }

  private async findActiveSpecialties(studentId: number): Promise<AuthSpecialty[]> {
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
    `) as unknown as SpecialtyRow[];

    return rows.map((row) => ({
      specialtyId: Number(row.specialty_id),
      name: row.name,
      selectionType: row.selection_type,
    }));
  }

  /**
   * Cursos de la malla que el alumno tiene APROBADOS, uno por uno.
   *
   * Es la lectura que faltaba: `student_course_progress` la escribe portal-sync
   * en cada importación y hasta ahora solo la leían el cálculo de nivel
   * (`findCycleCoverage`) y el chatbot; la malla, que es quien la necesita para
   * pintar los cursos completados, nunca la consultaba.
   *
   * Solo `approved`. `in_progress` viaja aparte en `currentCourses` (son cosas
   * distintas: uno lo estás llevando, el otro ya lo cerraste) y `failed` no es
   * progreso cumplido — si entrara, la malla desbloquearía cursos por un
   * requisito que el alumno no aprobó.
   *
   * No se filtra por `curriculum_id`: la fila ya cuelga del curso concreto de
   * la malla (`curriculum_course_id`), así que el id devuelto solo puede ser de
   * la malla del alumno. Se devuelven como string porque así viaja el id de
   * curso en toda esta respuesta (`currentCourses` hace lo mismo) y así lo
   * compara el cliente.
   */
  private async findApprovedCourseIds(studentId: number): Promise<string[]> {
    const rows = await this.database.execute(sql`
      select curriculum_course_id
      from student_course_progress
      where student_id = ${studentId}
        and status = 'approved'
      order by curriculum_course_id
    `) as unknown as Array<{ curriculum_course_id: number }>;

    return rows.map((r) => String(r.curriculum_course_id));
  }

  private async findCurrentCourses(studentId: number, curriculumId: number): Promise<AuthCurrentCourse[]> {
    const rows = await this.database.execute(sql`
      select
        sec.id as section_id,
        sec.code as section_code,
        cc.id as curriculum_course_id,
        c.id as course_id,
        c.name as course_name,
        ap.code as period_code
      from enrollment e
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true
      join course c on c.id = co.course_id
      left join curriculum_course cc on cc.course_id = c.id and cc.curriculum_id = ${curriculumId}
      where e.student_id = ${studentId}
        and e.status = 'active'
      order by c.name, sec.code
    `) as unknown as CurrentCourseRow[];

    return rows.map((course) => ({
      idSeccion: String(course.section_id),
      codigoSeccion: course.section_code,
      idCurso: String(course.curriculum_course_id ?? course.course_id),
      courseId: String(course.curriculum_course_id ?? course.course_id),
      nombre: course.course_name,
      period_code: course.period_code,
    }));
  }

  /** Código del período activo, o `null` si no hay ninguno. Nunca un ciclo hardcodeado. */
  private async findActivePeriodCode(): Promise<string | null> {
    const rows = await this.database.execute(sql`
      select code from academic_period where is_active = true limit 1
    `) as unknown as Array<{ code: string }>;
    return rows[0]?.code ?? null;
  }
}
