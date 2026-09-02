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
    approvedLevels: number[];
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
