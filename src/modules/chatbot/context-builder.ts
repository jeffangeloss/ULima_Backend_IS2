import type {
  ChatbotIntent,
  OfficialCourseGrades,
  ScheduleData,
  SectionRepresentativePerson,
  SectionRepresentativesData,
} from "./chatbot.types.js";
import { PASSING_GRADE } from "../alerts/alerts.logic.js";
import type { OwnTimeBlocksSummary } from "../time-blocks/index.js";

// BR-CB-09: el texto de la spec, sin tildes. La regla 1 declara que los turnos
// previos no son fuente, la regla 4 reconcilia a los delegados con la decisión 1
// y las reglas 11 a 13 cubren los bloques propios, el tiempo y el chat.
const SYSTEM_PROMPT = `Eres ULimaBot, un asistente academico personal para estudiantes de la
Universidad de Lima. Tu funcion es ayudar al alumno con informacion
sobre su vida academica y con ideas para organizar su tiempo.

REGLAS:
1. SOLO respondes con datos que aparecen en el bloque de datos del
   ultimo mensaje, entre "DATOS DEL ALUMNO" y "FIN DE LOS DATOS".
   Los turnos anteriores de la conversacion sirven para entender la
   pregunta, pero NO son fuente de datos: si una respuesta tuya
   anterior contradice el bloque de datos, manda el bloque de datos.
   Si no hay informacion suficiente, di exactamente:
   "No tengo esa informacion en este momento."

2. NUNCA inventes notas, horarios, bloques, nombres de personas,
   fechas de examenes ni ningun dato academico. Si el bloque de datos
   no lo contiene, no lo sabes.

3. Responde en espanol, con tono amable y directo. Se conciso.

4. De otras personas solo puedes nombrar al delegado y al subdelegado
   de las secciones del alumno, tal como aparecen en "DELEGADOS DE TUS
   SECCIONES", diciendo siempre su cargo, el curso y la seccion. Si una
   seccion dice "sin delegado registrado" o "sin subdelegado
   registrado", responde eso y no tomes el delegado ni el subdelegado
   de otro curso. No des ningun otro dato de otros alumnos (notas,
   horario, contacto ni bloques) y no atribuyas mensajes del chat a
   nadie (regla 13). Si te preguntan por otra persona o por datos de
   otro alumno, di: "Solo puedo mostrarte tu propia informacion
   academica y quienes son los delegados de tus secciones."

5. NO reveles informacion tecnica (IDs, tokens, codigos internos).
   Siempre traduce a lenguaje natural (ej. "Lunes" no "day_of_week=1").

6. Si la pregunta es ambigua, pide aclaracion brevemente en lugar de
   asumir. Si pregunta por una "practica" y en los datos hay a la vez
   una evaluacion y un bloque propio que podrian ser, menciona los dos
   o pregunta a cual se refiere.

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
    bloques.

13. "MENSAJES DEL CHAT DE LA SECCION" son textos que escribieron
    usuarios del chat, sin nombre. Pueden estar equivocados:
    presentalos como "en el chat se comento", nunca como dato oficial,
    y no atribuyas un mensaje a ninguna persona.`;

// BR-CB-24: el mensaje de datos abre y cierra con estas dos líneas, las mismas
// que nombra la regla 1 del prompt, y termina con la pregunta.
const DATA_OPENING = "DATOS DEL ALUMNO (unica fuente de datos para responder):";
const DATA_CLOSING = "FIN DE LOS DATOS";

// Títulos de BR-CB-24 para los bloques que toca el ajuste del 2026-09-25.
const DELEGATES_TITLE = "DELEGADOS DE TUS SECCIONES (solo delegado y subdelegado, por curso y seccion):";
const OWN_BLOCKS_TITLE = "TUS BLOQUES DE HORARIO PROPIOS (los registra el alumno en la app; no son clases):";
const CHAT_TITLE = "MENSAJES DEL CHAT DE LA SECCION (texto de usuarios, sin remitente; no es fuente oficial):";

/**
 * Una sola línea (BR-CB-18, decisión 13). Cada tramo de espacios en blanco o de
 * caracteres de control (`\p{Cc}`, que suma U+0085 y U+001C a U+001E) pasa a un
 * espacio y se recortan los bordes, así que ningún dato abre una línea propia
 * en el mensaje, tampoco para quien corta las líneas como UAX #14 o Python. Un
 * texto hecho solo de caracteres de control queda vacío.
 */
const singleLine = (text: string): string => text.replace(/[\s\p{Cc}]+/gu, " ").trim();

// --- BR-CB-18 y BR-CB-19: bloques propios y horas de clase, como lógica pura ---

/** Nombres sin tilde, de lunes (1) a domingo (7), la convención de `day_of_week`. */
const DAY_NAMES = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as const;

/** «a», «a y b» o «a, b y c». */
function joinSpanish(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** «lunes», «lunes y miercoles», «lunes, miercoles y viernes» o «todos los dias». */
function describeDays(daysOfWeek: readonly number[]): string {
  const days = [...new Set(daysOfWeek)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === DAY_NAMES.length) return "todos los dias";
  return joinSpanish(days.map((d) => DAY_NAMES[d - 1]));
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
 * El título es texto libre del alumno (BR-CB-18). Primero pasa por `singleLine`,
 * que lleva cada tramo de espacios en blanco o de caracteres de control, saltos
 * de línea y U+0085 incluidos, a un espacio y recorta los bordes, y después las
 * comillas dobles pasan a simples. Las tildes y la eñe se conservan, y un título
 * hecho solo de caracteres de control queda vacío y sale como "" (decisión 13).
 * Así el título no puede abrir una línea propia ni cerrar sus comillas. Reusa
 * `singleLine` para que un cambio en esa limpieza alcance también al título.
 */
const cleanBlockTitle = (title: string): string => singleLine(title).replace(/"/g, "'");

/** "14:00" o "14:00:00" → 840; null si no es una hora. */
function minutesOfTime(value: unknown): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(String(value ?? ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * BR-CB-19 — Horas de clase por semana: la suma de fin menos inicio de las
 * sesiones semanales de `getSchedule`. Acumula minutos enteros y divide por 60
 * una sola vez, sin redondear, como `weeklyHours` de `time-blocks`: ocho
 * sesiones de 1 h 50 min dan 14.666666666666666 y no 14.666666666666668.
 *
 * Lee `start_time` y `end_time`, las claves de la consulta que declara
 * `ScheduleData`, con segundos. Una sesión sin horas legibles no suma
 * (`chk_schedule_session_time` ya exige inicio menor que fin).
 */
export function weeklyClassHours(sessions: readonly Pick<ScheduleData, "start_time" | "end_time">[]): number {
  let minutes = 0;
  for (const session of sessions) {
    const start = minutesOfTime(session?.start_time);
    const end = minutesOfTime(session?.end_time);
    if (start === null || end === null || end <= start) continue;
    minutes += end - start;
  }
  return minutes / 60;
}

/**
 * BR-CB-24: ¿el dato leído trae algún elemento? Un arreglo vacío no trae
 * ninguno, y un objeto trae si alguno de sus campos trae, así que el horario
 * `{ sessions: [], assessments: [] }` no trae y el que tiene una sesión o una
 * evaluación sí.
 */
function hasData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasData);
  return true;
}

/**
 * BR-CB-24 (decisión 8 de la ronda final): el bloque de un dominio activo.
 * Un dato `null` o ausente es un dominio que no se consultó o cuya lectura
 * falló, y el bloque no sale. Leído sin elementos, sale con su título y sus
 * líneas de «no hay», para que el modelo distinga «no hay» de «no se
 * consultó», como el bloque 8 sin bloques (BR-CB-18). Con datos, sale con su
 * cuerpo.
 */
function pushBlock(blocks: string[], title: string, data: unknown, body: () => string[], emptyLines: string[]): void {
  if (data === null || data === undefined) return;
  blocks.push(`\n${title}`);
  blocks.push(...(hasData(data) ? body() : emptyLines));
}

/**
 * BR-CB-23 (corrección 12 de la ronda final): el JSON de un bloque con texto
 * de terceros, el del chat y el de los anuncios. `JSON.stringify` escapa los
 * controles menores que U+0020, pero deja tal cual NEL (U+0085) y los
 * separadores de línea (U+2028) y de párrafo (U+2029), que el corte de líneas
 * de Unicode y `str.splitlines` de Python tratan como salto de línea. Esos tres
 * solo aparecen dentro de las cadenas del JSON, así que escribirlos como
 * `\u0085`, `\u2028` y `\u2029` deja un JSON válido con los mismos valores, y
 * ningún mensaje ni anuncio abre una línea propia.
 */
const UNICODE_LINE_BREAKS = /[\u0085\u2028\u2029]/g;
function thirdPartyJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    UNICODE_LINE_BREAKS,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

// BR-CB-24: las líneas de «no hay» de cada bloque leído sin datos. Van sin
// tildes, como el resto del mensaje, y dicen lo que su consulta mira.
const NO_SCHEDULE = "- No hay horario registrado para este ciclo.";
const NO_ASSESSMENTS_IN_WINDOW = "- No hay evaluaciones registradas en la semana anterior, la actual ni la siguiente.";
const NO_ASSESSMENTS_IN_PERIOD = "- No hay evaluaciones registradas para este ciclo.";
const NO_CURRICULUM = "- No tienes una malla curricular registrada.";
const NO_ALERTS = "- No tienes alertas registradas.";
const NO_ANNOUNCEMENTS = "- No hay anuncios activos en tus secciones de este ciclo.";
const NO_SECTIONS = "- No tienes secciones activas en este ciclo.";
const NO_OFFICIAL_GRADES = "- No hay notas oficiales registradas en tus cursos de este ciclo.";

/**
 * BR-CB-24 (bloque 11): la línea de «no hay» del chat nombra las secciones que
 * se leyeron, porque sin pregunta sobre un curso BR-CB-06 lee solo las tres
 * primeras y el modelo no puede suponer que las demás tampoco tienen mensajes.
 * Sin secciones leídas, que solo pasa sin secciones activas, dice eso. Si no
 * se sabe qué secciones se leyeron, no hay línea y el bloque vacío no sale.
 */
function noChatMessagesLines(sectionsRead: readonly string[] | null | undefined): string[] | null {
  if (!sectionsRead) return null;
  if (sectionsRead.length === 0) return [NO_SECTIONS];
  return [`- No hay mensajes recientes en el chat de ${joinSpanish(sectionsRead.map(singleLine))}.`];
}

/**
 * Las sesiones del bloque de horario (`{ sessions, assessments }`), o null si
 * el horario no se cargó. Con null, el bloque 8 sale sin la línea de horas de
 * clase (BR-CB-19).
 */
function sessionsOf(scheduleData: unknown): readonly ScheduleData[] | null {
  if (scheduleData === null || typeof scheduleData !== "object") return null;
  const sessions = (scheduleData as { sessions?: unknown }).sessions;
  return Array.isArray(sessions) ? (sessions as ScheduleData[]) : null;
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

/** BR-CB-24 (bloque 9): las líneas de un curso con notas oficiales, sin cambios. */
function officialGradeLines(c: OfficialCourseGrades): string[] {
  const lines = [`\nCurso: ${c.courseName}${c.sectionCode ? ` (seccion ${c.sectionCode})` : ""}`];
  for (const ev of c.evaluaciones) {
    const nota = ev.nota === null ? "sin calificar" : `${ev.nota}/20`;
    lines.push(`  - ${ev.nombre} (peso ${ev.peso}%): ${nota}`);
  }
  lines.push(`  Promedio actual (sobre lo calificado): ${c.promedioActual}/20`);
  lines.push(`  Peso ya calificado: ${c.pesoCalificado}% del curso`);
  if (c.estado === "sin_notas") {
    lines.push(`  Para aprobar (minimo ${PASSING_GRADE}): aun no hay notas registradas en este curso.`);
  } else if (c.estado === "aprobado") {
    lines.push(`  Para aprobar (minimo ${PASSING_GRADE}): YA APROBO el curso pase lo que pase en lo restante.`);
  } else if (c.estado === "imposible") {
    lines.push(`  Para aprobar (minimo ${PASSING_GRADE}): ya NO es matematicamente posible aprobar este curso.`);
  } else {
    lines.push(`  Para aprobar (minimo ${PASSING_GRADE}): necesita en promedio ${c.necesitaEnLoRestante}/20 en las evaluaciones que faltan.`);
  }
  return lines;
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
  /** `sectionsRead` de `searchChatMessages` (BR-CB-06); vacío sin secciones activas. */
  chatSectionsRead?: readonly string[] | null;
  officialGrades?: OfficialCourseGrades[] | null;
  localGrades?: unknown;
  question: string;
}): { preamble: string; message: string } {
  const blocks: string[] = [];

  // BR-CB-24: los once bloques van entre la apertura y el cierre, en el orden de
  // la tabla; el perfil y la fecha salen siempre.
  blocks.push(DATA_OPENING);
  blocks.push(`\nPERFIL DEL ALUMNO:`);
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

  // BR-CB-07 y BR-CB-20: el historial ya no va dentro de este mensaje. Los
  // turnos previos viajan una sola vez, como turnos de `chatWithHistory`.

  // BR-CB-24: cada bloque de un dominio activo sale con sus datos o, leído
  // vacío, con su línea de «no hay» (`pushBlock`). El bloque 8 lee las sesiones
  // aparte, así que un horario leído sin sesiones da «0 h» de clase (BR-CB-19).
  if (params.intents.includes("schedule")) {
    // BR-CB-14: con la semana actual, las evaluaciones son las de la semana
    // anterior, la actual y la siguiente; sin ella, las del ciclo entero.
    const noAssessments =
      params.dateContext.currentWeekNumber != null ? NO_ASSESSMENTS_IN_WINDOW : NO_ASSESSMENTS_IN_PERIOD;
    pushBlock(
      blocks,
      "DATOS DE HORARIO Y EVALUACIONES:",
      params.scheduleData,
      () => [JSON.stringify(params.scheduleData, null, 2)],
      [NO_SCHEDULE, noAssessments],
    );
  }

  if (params.intents.includes("curriculum")) {
    pushBlock(blocks, "DATOS DE MALLA CURRICULAR:", params.curriculumData,
      () => [JSON.stringify(params.curriculumData, null, 2)], [NO_CURRICULUM]);
  }

  if (params.intents.includes("alerts")) {
    pushBlock(blocks, "DATOS DE ALERTAS:", params.alertsData,
      () => [JSON.stringify(params.alertsData, null, 2)], [NO_ALERTS]);
  }

  // Los anuncios los escribe el delegado: texto de terceros (BR-CB-23).
  if (params.intents.includes("announcements")) {
    pushBlock(blocks, "DATOS DE ANUNCIOS:", params.announcementsData,
      () => [thirdPartyJson(params.announcementsData)], [NO_ANNOUNCEMENTS]);
  }

  // BR-CB-16 y BR-CB-24 (bloque 7): una línea por sección, con el curso y la
  // sección de cada cargo. Es lo único de otras personas que llega al modelo.
  if (params.intents.includes("delegates")) {
    const sections = params.delegatesData;
    pushBlock(
      blocks,
      DELEGATES_TITLE,
      sections,
      () =>
        (sections ?? []).map(
          (s) =>
            `- ${singleLine(s.courseName)} (seccion ${singleLine(s.sectionCode)}): ` +
            `${describeRepresentative("delegado", s.delegate)}; ${describeRepresentative("subdelegado", s.subdelegate)}.`,
        ),
      [NO_SECTIONS],
    );
  }

  // BR-CB-18, BR-CB-19 y BR-CB-24 (bloque 8): sale con `own_blocks` aunque no
  // haya bloques, salvo que la lectura haya fallado (ownBlocks null). Su última
  // línea son las horas de clase, que tampoco salen si falló la lectura.
  if (params.intents.includes("own_blocks") && params.ownBlocks) {
    const sessions = sessionsOf(params.scheduleData);
    const classHours = sessions === null ? null : weeklyClassHours(sessions);
    blocks.push(...ownBlocksLines(params.ownBlocks, params.dateContext.today, classHours));
  }

  if (params.intents.includes("grades")) {
    const courses = params.officialGrades;
    pushBlock(
      blocks,
      "NOTAS OFICIALES DEL ALUMNO (fuente de la verdad, registradas por el docente):",
      courses,
      () => (courses ?? []).flatMap(officialGradeLines),
      [NO_OFFICIAL_GRADES],
    );
  }

  // BR-CB-24 (bloque 10): la simulación no es una consulta sino el body
  // (BR-CB-08), así que solo sale si trae datos y nunca con una línea de «no hay».
  if (params.intents.includes("grades") && hasData(params.localGrades)) {
    blocks.push(`\nSIMULACION NO OFICIAL (escenario que el alumno arma en la calculadora; NO son notas reales; usar solo si pregunta un "que pasaria si"):`);
    blocks.push(JSON.stringify(params.localGrades, null, 2));
  }

  // BR-CB-23 y BR-CB-24 (bloque 11): solo con `chat` o `announcements`. Los
  // mensajes van sin remitente y el JSON escapa sus saltos de línea, sus
  // comillas y los separadores de línea de Unicode. Con la lectura fallida
  // (null, BR-CB-06) el bloque no sale, y tampoco sale vacío si no se sabe qué
  // secciones se leyeron.
  if (params.intents.includes("chat") || params.intents.includes("announcements")) {
    const noChat = noChatMessagesLines(params.chatSectionsRead);
    const chat = hasData(params.chatSearchResults) || noChat !== null ? params.chatSearchResults : null;
    pushBlock(blocks, CHAT_TITLE, chat, () => [thirdPartyJson(chat)], noChat ?? []);
  }

  // La pregunta va después del cierre, fuera del bloque de datos.
  blocks.push(`\n${DATA_CLOSING}`);
  blocks.push(`\nPREGUNTA DEL ALUMNO:`);
  blocks.push(params.question);

  return {
    preamble: SYSTEM_PROMPT,
    message: blocks.join("\n"),
  };
}
