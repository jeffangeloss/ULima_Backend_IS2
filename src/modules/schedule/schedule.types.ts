export type ScheduleView = "sessions" | "assessments";

export type SessionDetail = {
  dia: string;
  inicio: string;
  hora_inicio: string;
  fin: string;
  hora_fin: string;
  aula: string;
  salon: string;
  color: string | null;
};

export type SectionResponse = {
  idSeccion: string;
  codigoSeccion: string;
  docenteCode: string;
  promedioSeccion: number;
  idCurso: string;
  curso: string;
  asistido: number;
  inasistencia: number;
  total: number;
  /**
   * ¿Hay asistencia cargada para esta matrícula? Bandera POSITIVA: el cliente
   * no puede distinguir "0 faltas" de "nunca se midió" mirando los números, y
   * ese 0 se pintaba como una dona verde llena (RS-BE-10).
   */
  asistenciaDisponible: boolean;
  /**
   * Horas de clase ya DICTADAS (asistidas + faltas), no las del ciclo entero.
   * RS-BE-16: sin esto el cliente divide `asistido / total` y en la semana 2
   * muestra 8/64 = 12.5%, que el alumno lee como "asististe al 12.5%". Es la
   * misma deshonestidad que arregló RS-BE-10, invertida. El porcentaje se
   * calcula sobre este número.
   */
  horasTranscurridas: number;
  horarios: SessionDetail[];
};

export type DayInfo = {
  dayName: string;
  dateText: string;
  weekText: string;
};

export type SessionsResponse = {
  days: DayInfo[];
  secciones: SectionResponse[];
};

export type AssessmentResponse = {
  id: string;
  courseName: string;
  sectionCode: string;
  code: string;
  name: string;
  weekNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  classroom: string;
  color: string;
};

export type AssessmentsResult = {
  assessments: AssessmentResponse[];
};

export type WeeklyLoadItem = {
  weekNumber: number;
  startDate: string;
  endDate: string;
  assessmentCount: number;
  isHighLoad: boolean;
};

export type WeeklyLoadResponse = {
  weeks: WeeklyLoadItem[];
};
