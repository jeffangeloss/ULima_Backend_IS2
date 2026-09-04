import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const curriculumSimulationStatusEnum = pgEnum("curriculum_simulation_status", [
  "planned",
  "simulated_completed",
  // HU19: simular "des-aprobar" un curso real (volverlo disponible/no tomado).
  "simulated_available",
]);

export const studentCourseStatusEnum = pgEnum("student_course_status", [
  "in_progress",
  "approved",
  "failed",
  "withdrawn",
]);

export const representativePositionEnum = pgEnum("representative_position", [
  "delegate",
  "subdelegate",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "withdrawn",
  "completed",
]);

export const alertTypeEnum = pgEnum("alert_type", ["academic_risk", "high_load"]);

export const advisingModalityEnum = pgEnum("advising_modality", [
  "classroom",
  "virtual",
  "hybrid",
]);

// HU18: distingue asesorías recurrentes (carga administrativa ya existente) de
// las extras puntuales que un docente publica para una fecha concreta.
export const advisingKindEnum = pgEnum("advising_kind", [
  "recurring",
  "extra",
]);

export const courseCategoryEnum = pgEnum("course_category", [
  "general_studies",
  "common",
  "faculty",
  "elective",
]);

export const prerequisiteTypeEnum = pgEnum("prerequisite_type", [
  "course",
  "completed_cycle",
]);

export const studentSpecialtyTypeEnum = pgEnum("student_specialty_type", [
  "primary",
  "interest",
]);

// HU networking (carnet): plataformas soportadas en el carnet de networking.
// `website`/`other` usan la etiqueta libre de user_social_link.label.
export const socialPlatformEnum = pgEnum("social_platform", [
  "linkedin",
  "instagram",
  "github",
  "x",
  "website",
  "other",
]);

export const appUser = pgTable("app_user", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  institutionalEmail: varchar("institutional_email", { length: 150 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  googleId: varchar("google_id", { length: 255 }),
  tokenVersion: integer("token_version").notNull().default(1),
  // HU networking (carnet): opt-in explícito del usuario (alumno o docente) para
  // mostrar/compartir su carnet con sus redes. Default false = privado hasta que
  // acepte desde el perfil. Aplica a TODOS los usuarios (app_user es compartida).
  networkingOptIn: boolean("networking_opt_in").notNull().default(false),
});

// HU networking (carnet): redes sociales que un usuario decide compartir en su
// carnet. Una fila por plataforma; el carnet es la unión de las filas del
// usuario. El frontend solo debe mostrar el carnet si networking_opt_in = true.
export const userSocialLink = pgTable("user_social_link", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("user_id").notNull().references(() => appUser.id),
  platform: socialPlatformEnum("platform").notNull(),
  url: varchar("url", { length: 255 }).notNull(),
  // Etiqueta opcional, sobre todo para `website`/`other` (ej. "Portafolio").
  label: varchar("label", { length: 80 }),
}, (t) => ({
  // Un solo enlace por plataforma por usuario.
  uqUserSocialLinkPlatform: unique("uq_user_social_link_platform").on(t.userId, t.platform),
  idxUserSocialLinkUser: index("idx_user_social_link_user").on(t.userId),
}));

export const student = pgTable("student", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => appUser.id),
  careerId: integer("career_id").notNull(),
  curriculumId: integer("curriculum_id").notNull(),
  currentLevel: integer("current_level"),
  specialtySetupCompleted: boolean("specialty_setup_completed").notNull().default(false),
}, (t) => ({
  uqStudentIdCareer: unique("uq_student_id_career").on(t.id, t.careerId),
  uqStudentIdCurriculum: unique("uq_student_id_curriculum").on(t.id, t.curriculumId),
  chkStudentCurrentLevel: check("chk_student_current_level", sql`${t.currentLevel} IS NULL OR ${t.currentLevel} BETWEEN 1 AND 10`),
  idxStudentUserId: index("idx_student_user_id").on(t.userId),
  idxStudentCurriculumId: index("idx_student_curriculum_id").on(t.curriculumId),
}));

export const career = pgTable("career", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  faculty: varchar("faculty", { length: 120 }).notNull(),
});

export const teacher = pgTable("teacher", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  teacherCode: varchar("teacher_code", { length: 50 }).unique(),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  institutionalEmail: varchar("institutional_email", { length: 150 }).unique(),
  // HU18: vínculo opcional a una cuenta para login docente. Nullable: los
  // profesores sin cuenta (la mayoría, dato referencial) siguen siendo válidos.
  userId: integer("user_id").unique().references(() => appUser.id),
});

export const specialty = pgTable("specialty", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  careerId: integer("career_id").notNull().references(() => career.id),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => ({
  uqSpecialtyCareerName: unique("uq_specialty_career_name").on(t.careerId, t.name),
}));

export const studentSpecialty = pgTable("student_specialty", {
  studentId: integer("student_id").notNull().references(() => student.id),
  specialtyId: integer("specialty_id").notNull().references(() => specialty.id),
  selectionType: studentSpecialtyTypeEnum("selection_type").notNull().default("interest"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => ({
  pk: primaryKey({ columns: [t.studentId, t.specialtyId] }),
  idxStudentSpecialtyStudent: index("idx_student_specialty_student").on(t.studentId),
  uqStudentSpecialtyActivePrimary: uniqueIndex("uq_student_specialty_active_primary")
    .on(t.studentId)
    .where(sql`${t.selectionType} = 'primary' AND ${t.isActive} = TRUE`),
}));

export const curriculum = pgTable("curriculum", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  careerId: integer("career_id").notNull().unique().references(() => career.id),
  name: varchar("name", { length: 120 }).notNull(),
}, (t) => ({
  uqCurriculumIdCareer: unique("uq_curriculum_id_career").on(t.id, t.careerId),
}));

export const course = pgTable("course", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  defaultCredit: integer("default_credit").notNull(),
  originFaculty: varchar("origin_faculty", { length: 120 }),
}, (t) => ({
  chkCourseDefaultCredit: check("chk_course_default_credit", sql`${t.defaultCredit} > 0`),
}));

export const curriculumCourse = pgTable("curriculum_course", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  curriculumId: integer("curriculum_id").notNull().references(() => curriculum.id),
  courseId: integer("course_id").notNull().references(() => course.id),
  cycle: integer("cycle").notNull(),
  displayOrder: integer("display_order").notNull(),
  credit: integer("credit").notNull(),
  category: courseCategoryEnum("category").notNull().default("faculty"),
}, (t) => ({
  uqCurriculumCourse: unique("uq_curriculum_course").on(t.curriculumId, t.courseId),
  uqCurriculumCourseIdCurriculum: unique("uq_curriculum_course_id_curriculum").on(t.id, t.curriculumId),
  chkCurriculumCourseCycle: check("chk_curriculum_course_cycle", sql`${t.cycle} > 0`),
  chkCurriculumCourseDisplayOrder: check("chk_curriculum_course_display_order", sql`${t.displayOrder} > 0`),
  chkCurriculumCourseCredit: check("chk_curriculum_course_credit", sql`${t.credit} > 0`),
  idxCurriculumCourseCurriculum: index("idx_curriculum_course_curriculum").on(t.curriculumId),
}));

export const curriculumCourseSpecialty = pgTable("curriculum_course_specialty", {
  curriculumCourseId: integer("curriculum_course_id").notNull().references(() => curriculumCourse.id),
  specialtyId: integer("specialty_id").notNull().references(() => specialty.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.curriculumCourseId, t.specialtyId] }),
}));

export const coursePrerequisite = pgTable("course_prerequisite", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  curriculumId: integer("curriculum_id").notNull().references(() => curriculum.id),
  curriculumCourseId: integer("curriculum_course_id").notNull().references(() => curriculumCourse.id),
  prerequisiteType: prerequisiteTypeEnum("prerequisite_type").notNull(),
  prerequisiteCurriculumCourseId: integer("prerequisite_curriculum_course_id").references(() => curriculumCourse.id),
  requiredCycle: integer("required_cycle"),
}, (t) => ({
  uqCoursePrerequisiteCourse: uniqueIndex("uq_course_prerequisite_course")
    .on(t.curriculumCourseId, t.prerequisiteCurriculumCourseId)
    .where(sql`${t.prerequisiteCurriculumCourseId} IS NOT NULL`),
  uqCoursePrerequisiteCompletedCycle: uniqueIndex("uq_course_prerequisite_completed_cycle")
    .on(t.curriculumCourseId, t.prerequisiteType, t.requiredCycle)
    .where(sql`${t.requiredCycle} IS NOT NULL`),
  chkCoursePrerequisiteKind: check("chk_course_prerequisite_kind", sql`
    (${t.prerequisiteType} = 'course' AND ${t.prerequisiteCurriculumCourseId} IS NOT NULL AND ${t.requiredCycle} IS NULL)
    OR
    (${t.prerequisiteType} = 'completed_cycle' AND ${t.prerequisiteCurriculumCourseId} IS NULL AND ${t.requiredCycle} IS NOT NULL)
  `),
  chkCoursePrerequisiteRequiredCycle: check("chk_course_prerequisite_required_cycle", sql`${t.requiredCycle} IS NULL OR ${t.requiredCycle} > 0`),
  chkCoursePrerequisiteNotSelf: check("chk_course_prerequisite_not_self", sql`${t.prerequisiteCurriculumCourseId} IS NULL OR ${t.curriculumCourseId} <> ${t.prerequisiteCurriculumCourseId}`),
  idxCoursePrerequisiteCurriculumCourse: index("idx_course_prerequisite_curriculum_course").on(t.curriculumCourseId),
}));

export const studentCurriculumSimulation = pgTable("student_curriculum_simulation", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id),
  curriculumId: integer("curriculum_id").notNull().references(() => curriculum.id),
  curriculumCourseId: integer("curriculum_course_id").notNull().references(() => curriculumCourse.id),
  status: curriculumSimulationStatusEnum("status").notNull(),
}, (t) => ({
  uqStudentCurriculumSimulation: unique("uq_student_curriculum_simulation").on(t.studentId, t.curriculumCourseId),
  idxStudentCurriculumSimulationStudent: index("idx_student_curriculum_simulation_student").on(t.studentId),
}));

export const academicPeriod = pgTable("academic_period", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => ({
  chkAcademicPeriodDates: check("chk_academic_period_dates", sql`${t.startDate} < ${t.endDate}`),
  uqAcademicPeriodSingleActive: uniqueIndex("uq_academic_period_single_active")
    .on(t.isActive)
    .where(sql`${t.isActive} = TRUE`),
}));

export const courseOffering = pgTable("course_offering", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  academicPeriodId: integer("academic_period_id").notNull().references(() => academicPeriod.id),
  courseId: integer("course_id").notNull().references(() => course.id),
  totalHours: decimal("total_hours", { precision: 5, scale: 2 }).notNull().default("0"),
}, (t) => ({
  uqCourseOffering: unique("uq_course_offering").on(t.academicPeriodId, t.courseId),
  chkCourseOfferingTotalHours: check("chk_course_offering_total_hours", sql`${t.totalHours} >= 0`),
  idxCourseOfferingPeriod: index("idx_course_offering_period").on(t.academicPeriodId),
}));

export const syllabus = pgTable("syllabus", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  courseOfferingId: integer("course_offering_id").notNull().references(() => courseOffering.id),
  title: varchar("title", { length: 150 }),
  driveFileId: varchar("drive_file_id", { length: 120 }).notNull().unique(),
  driveFileUrl: varchar("drive_file_url", { length: 255 }).notNull(),
}, (t) => ({
  uqSyllabusCourseOffering: unique("uq_syllabus_course_offering").on(t.courseOfferingId),
}));

export const section = pgTable("section", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  courseOfferingId: integer("course_offering_id").notNull().references(() => courseOffering.id),
  teacherId: integer("teacher_id").notNull().references(() => teacher.id),
  code: varchar("code", { length: 30 }).notNull(),
  // HU18: jefe de práctica de la sección (0 o 1). El rol Profesor/JP se deriva
  // de qué columna referencia al teacher; no es un enum en la persona.
  jpId: integer("jp_id").references(() => teacher.id),
}, (t) => ({
  uqSectionOfferingCode: unique("uq_section_offering_code").on(t.courseOfferingId, t.code),
  uqSectionIdOffering: unique("uq_section_id_offering").on(t.id, t.courseOfferingId),
  idxSectionCourseOffering: index("idx_section_course_offering").on(t.courseOfferingId),
  // El JP no puede ser el profesor de su propia sección.
  chkSectionJpNotTeacher: check("chk_section_jp_not_teacher", sql`${t.jpId} IS NULL OR ${t.jpId} <> ${t.teacherId}`),
  // Un JP pertenece a una sola sección (índice único parcial: ignora NULLs).
  uqSectionJp: uniqueIndex("uq_section_jp").on(t.jpId).where(sql`${t.jpId} IS NOT NULL`),
}));

export const enrollment = pgTable("enrollment", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id),
  sectionId: integer("section_id").notNull().references(() => section.id),
  status: enrollmentStatusEnum("status").notNull().default("active"),
  attendedHours: decimal("attended_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  absentHours: decimal("absent_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  totalHours: decimal("total_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  // Nota final OFICIAL del curso, tal como la publica el récord académico del
  // portal (portal-sync). Nullable: los ciclos en curso no tienen nota todavía.
  // No sustituye a student_score (nota por evaluación) ni a simulated_grades.
  finalGrade: decimal("final_grade", { precision: 4, scale: 2 }),
}, (t) => ({
  uqEnrollmentStudentSection: unique("uq_enrollment_student_section").on(t.studentId, t.sectionId),
  uqEnrollmentIdSection: unique("uq_enrollment_id_section").on(t.id, t.sectionId),
  chkEnrollmentAttendedHours: check("chk_enrollment_attended_hours", sql`${t.attendedHours} >= 0`),
  chkEnrollmentAbsentHours: check("chk_enrollment_absent_hours", sql`${t.absentHours} >= 0`),
  chkEnrollmentTotalHours: check("chk_enrollment_total_hours", sql`${t.totalHours} >= 0`),
  chkEnrollmentAttendanceHours: check("chk_enrollment_attendance_hours", sql`${t.attendedHours} + ${t.absentHours} <= ${t.totalHours}`),
  chkEnrollmentFinalGrade: check(
    "chk_enrollment_final_grade",
    sql`${t.finalGrade} IS NULL OR ${t.finalGrade} BETWEEN 0 AND 20`,
  ),
  idxEnrollmentStudent: index("idx_enrollment_student").on(t.studentId),
}));

export const studentCourseProgress = pgTable("student_course_progress", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id),
  curriculumId: integer("curriculum_id").notNull().references(() => curriculum.id),
  curriculumCourseId: integer("curriculum_course_id").notNull().references(() => curriculumCourse.id),
  status: studentCourseStatusEnum("status").notNull(),
}, (t) => ({
  uqStudentCourseProgress: unique("uq_student_course_progress").on(t.studentId, t.curriculumCourseId),
  idxStudentCourseProgressStudent: index("idx_student_course_progress_student").on(t.studentId),
  idxStudentCourseProgressCurriculumCourse: index("idx_student_course_progress_curriculum_course").on(t.curriculumCourseId),
}));

export const sectionRepresentative = pgTable("section_representative", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sectionId: integer("section_id").notNull().references(() => section.id),
  enrollmentId: integer("enrollment_id").notNull().unique().references(() => enrollment.id),
  position: representativePositionEnum("position").notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => ({
  uqActiveSectionRepresentativePosition: uniqueIndex("uq_active_section_representative_position")
    .on(t.sectionId, t.position)
    .where(sql`${t.isActive} = TRUE`),
}));

// Lo que el PORTAL dice sobre quién representa a una sección, antes de que esa
// persona exista como usuario de ULima++. No otorga permisos: solo
// `section_representative` autoriza. Cuando el titular se registra e importa,
// su matrícula empata por `student_code` y ahí sí se le promueve.
//
// No lleva FK al alumno a propósito: el delegado casi nunca tiene cuenta, y
// fabricarle una (como hace el seed) inventaría correo institucional,
// contraseña y carrera, y lo metería en networking, chat y en el contexto que
// el chatbot manda a Cohere.
//
// Tampoco guarda QUIÉN lo reportó: sería útil para auditar, pero deja escrito
// un registro de "A delató a B" que no compensa.
//
// El aislamiento por ciclo es gratis: `section` cuelga de `course_offering`,
// que cuelga de `academic_period`. Por eso la llave es la sección y no hay
// columna de período.
export const sectionRepresentativeClaim = pgTable("section_representative_claim", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sectionId: integer("section_id").notNull().references(() => section.id),
  position: representativePositionEnum("position").notNull(),
  // Mismo tipo y dominio que `app_user.code`: `student` NO tiene columna de
  // código, así que el empate de la promoción es contra `app_user`.
  studentCode: varchar("student_code", { length: 30 }).notNull(),
  // Mismo largo que `app_user.full_name`. El parser recorta antes de llegar
  // acá: un 22001 dentro de la transacción haría rollback de notas, horario y
  // matrícula.
  fullName: varchar("full_name", { length: 150 }).notNull(),
  // Instante en que se RECIBIÓ la respuesta del portal, no el del INSERT: la
  // descarga ocurre fuera de la transacción y entre observar y escribir hay
  // segundos. Sin esto, dos importaciones concurrentes pueden dejar
  // persistida la observación más vieja.
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
}, (t) => ({
  uqSectionRepresentativeClaimPosition:
    unique("uq_section_representative_claim_position").on(t.sectionId, t.position),
}));

export const academicWeek = pgTable("academic_week", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  academicPeriodId: integer("academic_period_id").notNull().references(() => academicPeriod.id),
  weekNumber: integer("week_number").notNull(),
  startDate: date("start_date", { mode: "date" }).notNull(),
  endDate: date("end_date", { mode: "date" }).notNull(),
}, (t) => ({
  uqAcademicWeekPeriodNumber: unique("uq_academic_week_period_number").on(t.academicPeriodId, t.weekNumber),
  chkAcademicWeekNumber: check("chk_academic_week_number", sql`${t.weekNumber} > 0`),
  chkAcademicWeekDates: check("chk_academic_week_dates", sql`${t.startDate} <= ${t.endDate}`),
}));

export const scheduleSession = pgTable("schedule_session", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sectionId: integer("section_id").notNull().references(() => section.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  classroom: varchar("classroom", { length: 100 }),
  colorHex: varchar("color_hex", { length: 20 }),
}, (t) => ({
  uqScheduleSession: unique("uq_schedule_session").on(t.sectionId, t.dayOfWeek, t.startTime),
  chkScheduleSessionDay: check("chk_schedule_session_day", sql`${t.dayOfWeek} BETWEEN 1 AND 7`),
  chkScheduleSessionTime: check("chk_schedule_session_time", sql`${t.startTime} < ${t.endTime}`),
  idxScheduleSessionSection: index("idx_schedule_session_section").on(t.sectionId),
}));

export const courseAdvisingSession = pgTable("course_advising_session", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  courseOfferingId: integer("course_offering_id").notNull().references(() => courseOffering.id),
  sectionId: integer("section_id").references(() => section.id),
  teacherId: integer("teacher_id").notNull().references(() => teacher.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  classroom: varchar("classroom", { length: 100 }),
  meetingUrl: varchar("meeting_url", { length: 255 }),
  modality: advisingModalityEnum("modality").notNull().default("hybrid"),
  note: text("note"),
  // HU18: recurrentes (default) vs extras puntuales.
  kind: advisingKindEnum("kind").notNull().default("recurring"),
  // Fecha concreta de la asesoría extra (NULL en recurrentes).
  sessionDate: date("session_date", { mode: "string" }),
  // Cupo máximo opcional (NULL = sin límite).
  capacity: integer("capacity"),
}, (t) => ({
  // Los únicos de "día de semana + hora" solo aplican a recurrentes: dos extras
  // en fechas distintas pueden caer el mismo día de semana a la misma hora.
  uqCourseAdvisingSessionCourse: uniqueIndex("uq_course_advising_session_course")
    .on(t.courseOfferingId, t.teacherId, t.dayOfWeek, t.startTime)
    .where(sql`${t.sectionId} IS NULL AND ${t.kind} = 'recurring'`),
  uqCourseAdvisingSessionSection: uniqueIndex("uq_course_advising_session_section")
    .on(t.sectionId, t.teacherId, t.dayOfWeek, t.startTime)
    .where(sql`${t.sectionId} IS NOT NULL AND ${t.kind} = 'recurring'`),
  // Unicidad propia de extras: por fecha concreta.
  uqCourseAdvisingSessionExtra: uniqueIndex("uq_course_advising_session_extra")
    .on(t.sectionId, t.teacherId, t.sessionDate, t.startTime)
    .where(sql`${t.kind} = 'extra'`),
  chkCourseAdvisingDay: check("chk_course_advising_day", sql`${t.dayOfWeek} BETWEEN 1 AND 7`),
  chkCourseAdvisingTime: check("chk_course_advising_time", sql`${t.startTime} < ${t.endTime}`),
  // Coherencia extra ↔ fecha: una extra siempre tiene fecha.
  chkCourseAdvisingExtraDate: check("chk_course_advising_extra_date", sql`${t.kind} <> 'extra' OR ${t.sessionDate} IS NOT NULL`),
  chkCourseAdvisingCapacity: check("chk_course_advising_capacity", sql`${t.capacity} IS NULL OR ${t.capacity} > 0`),
  idxCourseAdvisingSessionCourseOffering: index("idx_course_advising_session_course_offering").on(t.courseOfferingId),
}));

// HU18/HU17: confirmación de asistencia de un estudiante a una asesoría.
export const advisingRsvp = pgTable("advising_rsvp", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  advisingSessionId: integer("advising_session_id").notNull().references(() => courseAdvisingSession.id),
  studentId: integer("student_id").notNull().references(() => student.id),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqAdvisingRsvp: unique("uq_advising_rsvp").on(t.advisingSessionId, t.studentId),
  idxAdvisingRsvpSession: index("idx_advising_rsvp_session").on(t.advisingSessionId),
}));

export const assessmentType = pgTable("assessment_type", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  abbreviation: varchar("abbreviation", { length: 30 }),
  description: text("description"),
});

export const assessment = pgTable("assessment", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  syllabusId: integer("syllabus_id").notNull().references(() => syllabus.id),
  assessmentTypeId: integer("assessment_type_id").notNull().references(() => assessmentType.id),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 150 }).notNull(),
  weekNumber: integer("week_number").notNull(),
  weight: decimal("weight", { precision: 5, scale: 2 }).notNull(),
}, (t) => ({
  uqAssessmentSyllabusCode: unique("uq_assessment_syllabus_code").on(t.syllabusId, t.code),
  chkAssessmentWeekNumber: check("chk_assessment_week_number", sql`${t.weekNumber} > 0`),
  chkAssessmentWeight: check("chk_assessment_weight", sql`${t.weight} > 0 AND ${t.weight} <= 100`),
  idxAssessmentSyllabus: index("idx_assessment_syllabus").on(t.syllabusId),
}));

export const studentScore = pgTable("student_score", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollment.id),
  assessmentId: integer("assessment_id").notNull().references(() => assessment.id),
  value: decimal("value", { precision: 5, scale: 2 }),
}, (t) => ({
  uqStudentScore: unique("uq_student_score").on(t.enrollmentId, t.assessmentId),
  chkStudentScoreValue: check("chk_student_score_value", sql`${t.value} IS NULL OR ${t.value} BETWEEN 0 AND 20`),
  idxStudentScoreEnrollment: index("idx_student_score_enrollment").on(t.enrollmentId),
}));

// Notas SIMULADAS que el propio alumno ingresa en la calculadora para proyectar
// su promedio. Separadas de `student_score` (que guarda las notas seed) para no
// mezclar lo auto-reportado con lo "oficial". Persistidas en la BD (antes solo
// vivían en SharedPreferences del dispositivo) para que sigan al alumno entre
// dispositivos. Una fila por (matrícula, evaluación); `value` es obligatorio.
export const simulatedGrades = pgTable("simulated_grades", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollment.id),
  assessmentId: integer("assessment_id").notNull().references(() => assessment.id),
  value: decimal("value", { precision: 5, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uqSimulatedGrade: unique("uq_simulated_grade").on(t.enrollmentId, t.assessmentId),
  chkSimulatedGradeValue: check("chk_simulated_grade_value", sql`${t.value} BETWEEN 0 AND 20`),
  idxSimulatedGradeEnrollment: index("idx_simulated_grade_enrollment").on(t.enrollmentId),
}));

export const announcement = pgTable("announcement", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sectionRepresentativeId: integer("section_representative_id").notNull().references(() => sectionRepresentative.id),
  title: varchar("title", { length: 150 }).notNull(),
  message: text("message").notNull(),
  publishedAt: timestamp("published_at", { mode: "date" }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export const passwordResetToken = pgTable("password_reset_token", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("user_id").notNull().references(() => appUser.id),
  // SHA-256 (hex) del OTP de 6 dígitos; nunca se guarda el OTP en claro.
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxPasswordResetTokenUser: index("idx_password_reset_token_user").on(t.userId),
}));

export const alert = pgTable("alert", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id),
  type: alertTypeEnum("type").notNull(),
  title: varchar("title", { length: 150 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  idxAlertStudent: index("idx_alert_student").on(t.studentId),
}));

export const chatbotSession = pgTable("chatbot_session", {
  id: uuid("id").defaultRandom().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull().default("Nueva conversacion"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  idxChatbotSessionStudent: index("idx_chatbot_session_student").on(t.studentId),
}));

export const chatbotMessage = pgTable("chatbot_message", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => chatbotSession.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  idxChatbotMessageSession: index("idx_chatbot_message_session").on(t.sessionId),
}));
