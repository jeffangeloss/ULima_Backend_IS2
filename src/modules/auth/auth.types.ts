export type AppRole =
  | "student"
  | "delegate"
  | "subdelegate"
  | "teacher";

/** Etiqueta docente derivada de qué columna de `section` referencia al teacher. */
export type TeacherLabel = "Profesor" | "Jefe de Práctica";

/** Usuario docente (HU18): sin `studentId`; su JWT lleva `teacherId`. */
export type TeacherAuthUser = {
  id: number;
  teacherId: number;
  code: string;
  tokenVersion: number;
  fullName: string;
  firstName: string;
  lastName: string;
  institutionalEmail: string;
  email: string;
  /** Foto de perfil ya transformada, o null si no subió ninguna: la app pinta
   *  las iniciales, como siempre. Se construye al vuelo y no se guarda. */
  avatarUrl: string | null;
  role: "teacher";
  teacherLabel: TeacherLabel;
  // Los docentes no pasan por el setup de carrera; fijo para el routing del frontend.
  setupComplete: true;
};

export type TeacherAuthUserWithPassword = TeacherAuthUser & {
  passwordHash: string;
};

export type AuthSpecialty = {
  specialtyId: number;
  name: string;
  selectionType: "primary" | "interest";
};

export type AuthCurrentCourse = {
  idSeccion: string;
  codigoSeccion: string;
  idCurso: string;
  courseId: string;
  nombre: string;
  period_code?: string | null;
};

export type AuthUser = {
  id: number;
  studentId: number;
  code: string;
  tokenVersion: number;
  fullName: string;
  firstName: string;
  lastName: string;
  institutionalEmail: string;
  email: string;
  /** Foto de perfil ya transformada, o null si no subió ninguna: la app pinta
   *  las iniciales, como siempre. Se construye al vuelo y no se guarda. */
  avatarUrl: string | null;
  role: AppRole;
  careerId: number;
  career_id: number;
  curriculumId: number;
  currentLevel: number | null;
  // Código del período activo cuando no hay matrícula en el ciclo vigente
  // (ver auth.repository.ts buildUser); null cuando tampoco hay período
  // activo. El cliente Flutter (lib/models/user_model.dart) ya defiende con
  // `json['currentCycle'] as String? ?? '2026-1'` al parsear, así que un
  // valor null es seguro de recibir.
  currentCycle: string | null;
  setupComplete: boolean;
  specialtySetupCompleted: boolean;
  especialidad_principal: number | null;
  especialidades_interes: number[];
  especialidades: number[];
  specialties: AuthSpecialty[];
  courseProgress: {
    // PISO, no verdad: los ciclos por debajo del nivel del alumno se dan por
    // cumplidos para tapar lo que no se pudo emparejar (cambio de malla,
    // convalidaciones, códigos antiguos). Ver buildUser en auth.repository.ts.
    approvedLevels: number[];
    // Ids de `curriculum_course` REALMENTE aprobados, de student_course_progress.
    approvedCourseIds: string[];
    // LEGADO: mismo contenido que `approvedCourseIds`. El Flutter ya publicado
    // solo sabe leer ids por este campo; se sigue llenando para que la malla
    // se arregle sin obligar a reinstalar la app. Ver buildUser.
    approvedElectives: string[];
    currentCourses: AuthCurrentCourse[];
  };
};

export type AuthUserWithPassword = AuthUser & {
  passwordHash: string;
};

/** Datos mínimos del usuario para el flujo de restablecimiento de contraseña. */
export type PasswordResetUser = {
  id: number;
  institutionalEmail: string;
};

/** Estado persistido de un token de restablecimiento (fila de `password_reset_token`). */
export type PasswordResetTokenRecord = {
  id: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
};
