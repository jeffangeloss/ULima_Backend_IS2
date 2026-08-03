import type { ChatbotIntent, ChatbotMessageRow, OfficialCourseGrades } from "./chatbot.types.js";
import { PASSING_GRADE } from "../alerts/alerts.logic.js";

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
    ya no es posible aprobar.`;

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
  classmatesData?: unknown;
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

  if (params.intents.includes("classmates") && params.classmatesData) {
    blocks.push(`\nDATOS DE COMPANEROS:`);
    blocks.push(JSON.stringify(params.classmatesData, null, 2));
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

  if (params.chatSearchResults) {
    blocks.push(`\nMENSAJES DEL CHAT DE LA SECCION:`);
    blocks.push(JSON.stringify(params.chatSearchResults, null, 2));
  }

  blocks.push(`\nPREGUNTA DEL ALUMNO:`);
  blocks.push(params.question);

  return {
    preamble: SYSTEM_PROMPT,
    message: blocks.join("\n"),
  };
}
