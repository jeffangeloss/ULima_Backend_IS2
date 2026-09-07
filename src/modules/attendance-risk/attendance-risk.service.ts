import { partirNombre as splitName } from "../../shared/utils/nombre-persona.js";
import type { EventBus } from "../../events/index.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { AttendanceRiskRepository } from "./attendance-risk.repository.js";
import type {
  AttendanceRiskResponse,
  AttendanceRiskStudentResponse,
  AttendanceRiskSummary,
  StudentRiskStatus,
} from "./attendance-risk.types.js";


const classifyStudent = (row: {
  absent_hours: string;
  total_section_hours: string;
  enrollment_total_hours: string;
  current_level: number | null;
  full_name: string;
  code: string;
  cycle: number;
}, sessionHours: number): AttendanceRiskStudentResponse => {
  const absentHours = Number(row.absent_hours);
  const totalSectionHours = Number(row.total_section_hours);
  const cycle = row.cycle;
  const limit = cycle >= 6 ? 35 : 25;
  const { firstName, lastName } = splitName(row.full_name);

  // Sin dato NO es sin faltas. Dos formas de no saber, ambas terminan igual:
  //  - la matrícula nunca recibió horas (enrollment.total_hours = 0). El CHECK
  //    chk_enrollment_attendance_hours garantiza que toda fila con dato real
  //    tiene total > 0, así que el 0 es prueba de ausencia, no de perfección.
  //  - la sección no tiene denominador, y sin denominador no hay porcentaje.
  // Antes ambas caían en `normal` con 0%, que es la lectura opuesta a la real.
  const enrollmentHours = Number(row.enrollment_total_hours);
  if (!Number.isFinite(enrollmentHours) || enrollmentHours <= 0 || totalSectionHours <= 0) {
    return {
      code: row.code,
      firstName,
      lastName,
      currentLevel: row.current_level,
      cycle,
      absentHours,
      totalHours: totalSectionHours,
      absencePercentage: null,
      status: "sin_datos",
      missingFaltas: null,
    };
  }

  const absencePercentage = (absentHours / totalSectionHours) * 100;

  if (absencePercentage > limit) {
    return {
      code: row.code,
      firstName,
      lastName,
      currentLevel: row.current_level,
      cycle,
      absentHours,
      totalHours: totalSectionHours,
      absencePercentage: Math.round(absencePercentage * 100) / 100,
      status: "impedido" as StudentRiskStatus,
      missingFaltas: null,
    };
  }

  const maxAllowedAbsentHours = totalSectionHours * limit / 100;
  const remainingAbsentHours = maxAllowedAbsentHours - absentHours;
  const faltasRemaining = Math.ceil(remainingAbsentHours / sessionHours);

  if (faltasRemaining === 2 || faltasRemaining === 3) {
    return {
      code: row.code,
      firstName,
      lastName,
      currentLevel: row.current_level,
      cycle,
      absentHours,
      totalHours: totalSectionHours,
      absencePercentage: Math.round(absencePercentage * 100) / 100,
      status: "en_riesgo" as StudentRiskStatus,
      missingFaltas: faltasRemaining,
    };
  }

  return {
    code: row.code,
    firstName,
    lastName,
    currentLevel: row.current_level,
    cycle,
    absentHours,
    totalHours: totalSectionHours,
    absencePercentage: Math.round(absencePercentage * 100) / 100,
    status: "normal",
    missingFaltas: null,
  };
};

const computeSummary = (students: AttendanceRiskStudentResponse[]): AttendanceRiskSummary => {
  let impedido = 0;
  let en_riesgo = 0;
  let normal = 0;
  let sin_datos = 0;
  for (const s of students) {
    if (s.status === "impedido") impedido++;
    else if (s.status === "en_riesgo") en_riesgo++;
    else if (s.status === "sin_datos") sin_datos++;
    else normal++;
  }
  return { impedido, en_riesgo, normal, sin_datos, total: students.length };
};

/** Degradación cuando la sección no tiene horario importado. Ver RS-BE-13. */
const DEFAULT_SESSION_HOURS = 2;

export class AttendanceRiskService {
  constructor(
    readonly repository: AttendanceRiskRepository,
    readonly events: EventBus,
  ) {}

  /**
   * RS-BE-11. Toda ruta del módulo pasa por acá antes de tocar datos: la sección
   * debe ser del docente autenticado. Antes solo se exigía el ROL `teacher`, así
   * que cualquier docente podía leer el riesgo de cualquier sección y disparar
   * `notify`, que inserta alertas académicas a alumnos ajenos.
   *
   * El mensaje es el mismo exista o no la sección: uno distinto para cada caso
   * convertiría el endpoint en un oráculo para enumerar secciones.
   */
  async assertTeacherOwnsSection(teacherId: number, sectionId: number): Promise<void> {
    const pertenece = await this.repository.teacherBelongsToSection(teacherId, sectionId);
    if (!pertenece) {
      throw new HttpError(403, "No tienes acceso a esta sección.", "NOT_SECTION_TEACHER");
    }
  }

  /**
   * RS-BE-13. Duración de una sesión, del horario real. El 2 sobrevive solo como
   * degradación para secciones sin horario importado: es lo que había antes y no
   * hay documento de la Universidad que lo respalde (ver §Reglas sin fuente).
   */
  private async resolveSessionHours(sectionId: number): Promise<number> {
    const horas = await this.repository.findModalSessionHours(sectionId);
    return horas && horas > 0 ? horas : DEFAULT_SESSION_HOURS;
  }

  async getAttendanceRisk(sectionId: number): Promise<AttendanceRiskResponse> {
    const rows = await this.repository.findStudentsBySectionId(sectionId);
    const sessionHours = await this.resolveSessionHours(sectionId);
    const students: AttendanceRiskStudentResponse[] = rows.map(row => classifyStudent(row, sessionHours));

    return { students, summary: computeSummary(students) };
  }

  async getAttendanceRiskSummary(sectionId: number): Promise<{ summary: AttendanceRiskSummary }> {
    const rows = await this.repository.findStudentsBySectionId(sectionId);
    const sessionHours = await this.resolveSessionHours(sectionId);
    const students: AttendanceRiskStudentResponse[] = rows.map(row => classifyStudent(row, sessionHours));

    return { summary: computeSummary(students) };
  }

  async notifyStudents(sectionId: number): Promise<{ notified: number; message: string }> {
    const rows = await this.repository.findStudentDetailsBySectionId(sectionId);
    const sessionHours = await this.resolveSessionHours(sectionId);
    const alerts: { studentId: number; type: string; title: string; message: string }[] = [];

    let sinDatos = 0;

    for (const row of rows) {
      const absentHours = Number(row.absent_hours);
      const totalSectionHours = Number(row.total_section_hours);
      // Nunca se alerta sobre una matrícula sin asistencia cargada: el mensaje
      // dice "estás a N faltas del límite", y con datos ausentes ese N sería
      // inventado. Es correo académico a una persona real. Ver RS-BE-10.
      const enrollmentHours = Number(row.enrollment_total_hours);
      if (!Number.isFinite(enrollmentHours) || enrollmentHours <= 0 || totalSectionHours <= 0) {
        sinDatos++;
        continue;
      }

      const absencePercentage = (absentHours / totalSectionHours) * 100;
      const cycle = row.cycle;
      const limit = cycle >= 6 ? 35 : 25;
      const pct = Math.round(absencePercentage * 100) / 100;
      const courseName = row.course_name;
      const sectionCode = row.section_code;

      let title: string;
      let message: string;

      if (absencePercentage > limit) {
        title = `Alerta de inasistencias - ${courseName}`;
        message = `Has superado el límite de inasistencias permitidas (${limit}%) en ${courseName} (Sección ${sectionCode}). Tu porcentaje actual es de ${pct}%.`;
      } else {
        const maxAllowed = totalSectionHours * limit / 100;
        const remaining = maxAllowed - absentHours;
        const faltas = Math.ceil(remaining / sessionHours);
        if (faltas !== 2 && faltas !== 3) continue;

        title = `Alerta de inasistencias - ${courseName}`;
        message = `Estás a ${faltas} falta(s) de alcanzar el límite de inasistencias (${limit}%) en ${courseName} (Sección ${sectionCode}). Tu porcentaje actual es de ${pct}%.`;
      }

      alerts.push({ studentId: row.student_id, type: "academic_risk", title, message });
    }

    const notified = await this.repository.createAlerts(alerts);
    // "No hay alumnos que notificar" era una afirmación sobre la realidad
    // académica del salón. Cuando la causa es que no hay datos cargados, decirlo
    // así es falso: hay que distinguir "nadie en riesgo" de "nadie medido".
    let msg: string;
    if (notified > 0) {
      msg = `Se ${notified === 1 ? "ha" : "han"} notificado a ${notified} alumno${notified === 1 ? "" : "s"}.`;
    } else if (sinDatos > 0) {
      msg = `No se notificó a nadie: ${sinDatos} alumno${sinDatos === 1 ? "" : "s"} sin datos de asistencia cargados.`;
    } else {
      msg = "No hay alumnos que notificar.";
    }
    return { notified, message: msg };
  }
}
