import type {
  ChatbotIntent,
  ChatbotMessageRow,
  OfficialCourseGrades,
  SectionRepresentativePerson,
  SectionRepresentativesData,
} from "./chatbot.types.js";
import { PASSING_GRADE } from "../alerts/alerts.logic.js";
import type { OwnTimeBlocksSummary } from "../time-blocks/index.js";

const SYSTEM_PROMPT = `Eres ULimaBot, un asistente academico personal para estudiantes de la
Universidad de Lima. Tu funcion es ayudar al alumno con informacion
sobre su vida academica.

REGLAS:
1. SOLO respondes con datos que aparecen en el contexto proporcionado.
   Si no hay informacion suficiente, di exactamente:
   "No tengo esa informacion en este momento."

2. NUNCA inventes notas, horarios, nombres de companeros, fechas de
   examenes ni ningun dato academico. Si el contexto no lo contiene,
   no lo sabes.

3. Responde en espanol, con tono amable y directo. Se conciso.

4. NO respondas preguntas sobre otros alumnos. Si te preguntan por
   datos de otra persona, di: "Solo puedo mostrarte tu propia
   informacion academica."

5. NO reveles informacion tecnica (IDs, tokens, codigos internos).
   Siempre traduce a lenguaje natural (ej. "Lunes" no "day_of_week=1").

6. Si la pregunta es ambigua, pide aclaracion brevemente en lugar de
   asumir.

7. NUNCA sugieras modificar datos, eliminar registros ni realizar
   acciones que cambien informacion del sistema. Solo consultas.

8. Usa bullet points o formato breve cuando listes informacion.

9. Tus NOTAS OFICIALES (registradas por el docente) son la UNICA verdad de
   notas. La "SIMULACION NO OFICIAL" son escenarios hipoteticos que el alumno
   arma en la calculadora: NO son notas reales, no las confundas ni las
   reportes como sus notas. Usalas solo si pregunta explicitamente por un
   "que pasaria si".

10. Si te preguntan cuanto necesitan para aprobar un curso, usa el dato
    "Para aprobar" que YA viene calculado en el contexto (no lo recalcules).
    Se claro: cuanto necesita en promedio en lo que falta, o si ya aprobo, o si
    ya no es posible aprobar.

11. "TUS BLOQUES DE HORARIO PROPIOS" son actividades que el alumno
    registro en la app (practicas, trabajo, voluntariado); NO son
    clases. Para decir cuando tiene un bloque usa sus dias, horas,
    fechas y los cambios de la ventana. Las horas por semana ya vienen
    calculadas: no las recalcules.

12. Puedes sugerir como organizar el tiempo, pero solo con el bloque de
    datos: huecos libres entre clases y bloques, evaluaciones cercanas
    y horas ya calculadas. Presentalo como sugerencia. No inventes
    clases, bloques, tareas, plazos ni evaluaciones; no supongas si una
    clase es teoria o practica; no estimes cuantas horas de estudio
    exige un curso; no compares con otros alumnos; no des consejos
    medicos ni psicologicos; no sugieras crear, editar ni borrar
    bloques.`;

// Títulos de BR-CB-24 para los bloques que toca el ajuste del 2026-09-25.
const DELEGATES_TITLE = "DELEGADOS DE TUS SECCIONES (solo delegado y subdelegado, por curso y seccion):";
const OWN_BLOCKS_TITLE = "TUS BLOQUES DE HORARIO PROPIOS (los registra el alumno en la app; no son clases):";
const CHAT_TITLE = "MENSAJES DEL CHAT DE LA SECCION (texto de usuarios, sin remitente; no es fuente oficial):";

/** Una sola línea: ningún salto de línea de un dato abre una línea propia en el mensaje. */
const singleLine = (text: string): string => text.replace(/\s+/g, " ").trim();

// --- BR-CB-18 y BR-CB-19: bloques propios y horas de clase, como lógica pura ---

/** Nombres sin tilde, de lunes (1) a domingo (7), la convención de `day_of_week`. */
const DAY_NAMES = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;

/** «lunes», «lunes y miercoles», «lunes, miercoles y viernes» o «todos los dias». */
function describeDays(daysOfWeek: readonly number[]): string {
  const days = [...new Set(daysOfWeek)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === DAY_NAMES.length) return "todos los dias";
  const names = days.map((d) => DAY_NAMES[d - 1]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * Nombre del día de una fecha "YYYY-MM-DD". La cuenta va en UTC con
 * `Date.UTC`, como en `time-blocks`, para que el día no se corra según el huso
 * del proceso (en Vercel es UTC y en la Mac del equipo, Lima).
 */
function dayNameOf(date: string): string {
  const utc = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return DAY_NAMES[(new Date(utc).getUTCDay() + 6) % 7] ?? "";
}

/** El número de JavaScript sin redondear, como en la API: «16 h», «7.5 h», «0 h». */
const formatHours = (hours: number): string => `${hours} h`;

/**
 * El título es texto libre del alumno (BR-CB-18): cada tramo de espacios en
 * blanco, saltos de línea incluidos, pasa a un espacio; se recortan los bordes
 * y las comillas dobles pasan a simples. Las tildes y la eñe se conservan. Así
 * el título no puede abrir una línea propia ni cerrar sus comillas.
 */
const cleanBlockTitle = (title: string): string => title.replace(/\s+/g, " ").trim().replace(/"/g, "'");

/** "14:00" o "14:00:00" → 840; null si no es una hora. */
function minutesOfTime(value: unknown): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(String(value ?? ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Una clave de una fila, en snake_case o en camelCase. */
function fieldOf(row: unknown, snake: string, camel: string): unknown {
  if (row === null || typeof row !== "object") return undefined;
  const record = row as Record<string, unknown>;
  return record[snake] ?? record[camel];
}

/**
 * BR-CB-19 — Horas de clase por semana: la suma de fin menos inicio de las
 * sesiones semanales de `getSchedule`. Acumula minutos enteros y divide por 60
 * una sola vez, sin redondear, como `weeklyHours` de `time-blocks`: ocho
 * sesiones de 1 h 50 min dan 14.666666666666666 y no 14.666666666666668.
 *
 * `getSchedule` castea las filas sin mapearlas, así que llegan con las claves
 * de la consulta (`start_time`, `end_time`, en snake_case y con segundos) y no
 * con las de `ScheduleData`; se aceptan las dos. Una sesión sin horas legibles
 * no suma (`chk_schedule_session_time` ya exige inicio menor que fin).
 */
export function weeklyClassHours(sessions: readonly unknown[]): number {
  let minutes = 0;
  for (const session of sessions) {
    const start = minutesOfTime(fieldOf(session, "start_time", "startTime"));
    const end = minutesOfTime(fieldOf(session, "end_time", "endTime"));
    if (start === null || end === null || end <= start) continue;
    minutes += end - start;
  }
  return minutes / 60;
}

/** Las sesiones del bloque de horario (`{ sessions, assessments }`), o null si no se cargaron. */
function sessionsOf(scheduleData: unknown): readonly unknown[] | null {
  if (scheduleData === null || typeof scheduleData !== "object") return null;
  const sessions = (scheduleData as { sessions?: unknown }).sessions;
  return Array.isArray(sessions) ? sessions : null;
}

/**
 * BR-CB-18 y BR-CB-24 (bloque 8): el resumen de los bloques propios, una línea
 * por bloque con sus cambios debajo, las horas de las dos semanas y, al final,
 * las horas de clase de BR-CB-19. `today` decide si un bloque todavía no
 * empieza. Sin horario cargado no se escribe un total de clases que no se
 * conoce.
 */
function ownBlocksLines(summary: OwnTimeBlocksSummary, today: string, classHours: number | null): string[] {
  const lines = [`\n${OWN_BLOCKS_TITLE}`, `- Ventana: del lunes ${summary.window.from} al domingo ${summary.window.to}.`];
  if (summary.blocks.length === 0) lines.push("- No registraste bloques propios vigentes.");

  for (const block of summary.blocks) {
    const validity =
      block.startDate > today
        ? `empieza el ${block.startDate} y termina el ${block.endDate}`
        : `del ${block.startDate} al ${block.endDate}`;
    lines.push(
      `- "${cleanBlockTitle(block.title)}": ${describeDays(block.daysOfWeek)}, ` +
        `de ${block.startTime} a ${block.endTime}, todas las semanas, ${validity}.`,
    );
    for (const change of block.exceptions) {
      const day = `${dayNameOf(change.date)} ${change.date}`;
      if (change.status === "cancelled") {
        lines.push(`  - Cambio: ${day}, no va (cancelado).`);
      } else if (change.status === "moved" && change.startTime && change.endTime) {
        // Un `moved` sin horas es imposible (`chk_time_block_exc_movido`); si
        // llegara, `expandOccurrences` deja el día con el patrón y aquí no se
        // anuncia ningún cambio.
        lines.push(`  - Cambio: ${day}, de ${change.startTime} a ${change.endTime} (horario cambiado).`);
      }
    }
  }

  if (summary.weeks.length > 0) {
    const weeks = summary.weeks.map((w) => `semana del ${w.weekStart}: ${formatHours(w.hours)}`).join("; ");
    lines.push(`- Horas de bloques propios por semana: ${weeks}.`);
  }
  if (classHours !== null) {
    lines.push(`- Horas de clase por semana segun tu horario: ${formatHours(classHours)}.`);
  }
  return lines;
}

/** «delegado NOMBRE», «delegado tu (NOMBRE)» o «sin delegado registrado» (BR-CB-16 y BR-CB-24). */
function describeRepresentative(position: "delegado" | "subdelegado", person: SectionRepresentativePerson | null): string {
  const name = person ? singleLine(person.fullName) : "";
  if (!person || name === "") return `sin ${position} registrado`;
  return person.isSelf ? `${position} tu (${name})` : `${position} ${name}`;
}

export interface DateContext {
  today: string;
  currentWeekNumber?: number;
  currentWeekRange?: string;
  nextWeekNumber?: number;
  nextWeekRange?: string;
  academicPeriodCode?: string;
}

export function buildContext(params: {
  studentName: string;
  careerName: string;
  currentLevel: number | null;
  history: ChatbotMessageRow[];
  intents: ChatbotIntent[];
  dateContext: DateContext;
  scheduleData?: unknown;
  curriculumData?: unknown;
  alertsData?: unknown;
  announcementsData?: unknown;
  delegatesData?: SectionRepresentativesData[] | null;
  /** Resumen de `readOwnTimeBlocksForAssistant` (RS-BE-35); null si la lectura falló. */
  ownBlocks?: OwnTimeBlocksSummary | null;
  chatSearchResults?: unknown;
  officialGrades?: OfficialCourseGrades[] | null;
  localGrades?: unknown;
  question: string;
}): { preamble: string; message: string } {
  const blocks: string[] = [];

  blocks.push(`PERFIL DEL ALUMNO:`);
  blocks.push(`- Nombre: ${params.studentName}`);
  blocks.push(`- Carrera: ${params.careerName}`);
  if (params.currentLevel != null) {
    blocks.push(`- Ciclo actual: ${params.currentLevel}`);
  }

  blocks.push(`\nFECHA Y SEMANA ACTUAL:`);
  if (params.dateContext.academicPeriodCode) {
    blocks.push(`- Periodo academico: ${params.dateContext.academicPeriodCode}`);
  }
  blocks.push(`- Hoy: ${params.dateContext.today}`);
  if (params.dateContext.currentWeekNumber != null && params.dateContext.currentWeekRange) {
    blocks.push(`- Semana actual: ${params.dateContext.currentWeekNumber} (${params.dateContext.currentWeekRange})`);
  }
  if (params.dateContext.nextWeekNumber != null && params.dateContext.nextWeekRange) {
    blocks.push(`- Semana siguiente: ${params.dateContext.nextWeekNumber} (${params.dateContext.nextWeekRange})`);
  }

  if (params.history.length > 0) {
    const recent = params.history.slice(-10);
    blocks.push(`\nHISTORIAL DE LA CONVERSACION (ultimos mensajes):`);
    for (const msg of recent) {
      const role = msg.role === "user" ? "Alumno" : "ULimaBot";
      blocks.push(`${role}: ${msg.content}`);
    }
  }

  if (params.intents.includes("schedule") && params.scheduleData) {
    blocks.push(`\nDATOS DE HORARIO Y EVALUACIONES:`);
    blocks.push(JSON.stringify(params.scheduleData, null, 2));
  }

  if (params.intents.includes("curriculum") && params.curriculumData) {
    blocks.push(`\nDATOS DE MALLA CURRICULAR:`);
    blocks.push(JSON.stringify(params.curriculumData, null, 2));
  }

  if (params.intents.includes("alerts") && params.alertsData) {
    blocks.push(`\nDATOS DE ALERTAS:`);
    blocks.push(JSON.stringify(params.alertsData, null, 2));
  }

  if (params.intents.includes("announcements") && params.announcementsData) {
    blocks.push(`\nDATOS DE ANUNCIOS:`);
    blocks.push(JSON.stringify(params.announcementsData, null, 2));
  }

  // BR-CB-16 y BR-CB-24 (bloque 7): una línea por sección, con el curso y la
  // sección de cada cargo. Es lo único de otras personas que llega al modelo.
  if (params.intents.includes("delegates") && params.delegatesData && params.delegatesData.length > 0) {
    blocks.push(`\n${DELEGATES_TITLE}`);
    for (const s of params.delegatesData) {
      blocks.push(
        `- ${singleLine(s.courseName)} (seccion ${singleLine(s.sectionCode)}): ` +
          `${describeRepresentative("delegado", s.delegate)}; ${describeRepresentative("subdelegado", s.subdelegate)}.`,
      );
    }
  }

  // BR-CB-18, BR-CB-19 y BR-CB-24 (bloque 8): sale con `own_blocks` aunque no
  // haya bloques, salvo que la lectura haya fallado (ownBlocks null). Su última
  // línea son las horas de clase, que tampoco salen si falló la lectura.
  if (params.intents.includes("own_blocks") && params.ownBlocks) {
    const sessions = sessionsOf(params.scheduleData);
    const classHours = sessions === null ? null : weeklyClassHours(sessions);
    blocks.push(...ownBlocksLines(params.ownBlocks, params.dateContext.today, classHours));
  }

  if (params.intents.includes("grades") && params.officialGrades && params.officialGrades.length > 0) {
    blocks.push(`\nNOTAS OFICIALES DEL ALUMNO (fuente de la verdad, registradas por el docente):`);
    for (const c of params.officialGrades) {
      blocks.push(`\nCurso: ${c.courseName}${c.sectionCode ? ` (seccion ${c.sectionCode})` : ""}`);
      for (const ev of c.evaluaciones) {
        const nota = ev.nota === null ? "sin calificar" : `${ev.nota}/20`;
        blocks.push(`  - ${ev.nombre} (peso ${ev.peso}%): ${nota}`);
      }
      blocks.push(`  Promedio actual (sobre lo calificado): ${c.promedioActual}/20`);
      blocks.push(`  Peso ya calificado: ${c.pesoCalificado}% del curso`);
      if (c.estado === "sin_notas") {
        blocks.push(`  Para aprobar (minimo ${PASSING_GRADE}): aun no hay notas registradas en este curso.`);
      } else if (c.estado === "aprobado") {
        blocks.push(`  Para aprobar (minimo ${PASSING_GRADE}): YA APROBO el curso pase lo que pase en lo restante.`);
      } else if (c.estado === "imposible") {
        blocks.push(`  Para aprobar (minimo ${PASSING_GRADE}): ya NO es matematicamente posible aprobar este curso.`);
      } else {
        blocks.push(`  Para aprobar (minimo ${PASSING_GRADE}): necesita en promedio ${c.necesitaEnLoRestante}/20 en las evaluaciones que faltan.`);
      }
    }
  }

  if (params.intents.includes("grades") && params.localGrades) {
    blocks.push(`\nSIMULACION NO OFICIAL (escenario que el alumno arma en la calculadora; NO son notas reales; usar solo si pregunta un "que pasaria si"):`);
    blocks.push(JSON.stringify(params.localGrades, null, 2));
  }

  // BR-CB-23 y BR-CB-24 (bloque 11): solo con `chat` o `announcements`. Los
  // mensajes van sin remitente y el JSON escapa sus saltos de línea y comillas.
  const chatActive = params.intents.includes("chat") || params.intents.includes("announcements");
  if (chatActive && params.chatSearchResults) {
    blocks.push(`\n${CHAT_TITLE}`);
    blocks.push(JSON.stringify(params.chatSearchResults, null, 2));
  }

  blocks.push(`\nPREGUNTA DEL ALUMNO:`);
  blocks.push(params.question);

  return {
    preamble: SYSTEM_PROMPT,
    message: blocks.join("\n"),
  };
}
