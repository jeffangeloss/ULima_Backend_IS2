import { describe, expect, test } from "bun:test";
import { buildContext } from "../../src/modules/chatbot/context-builder.js";
import type { ChatbotIntent, ChatbotMessageRow } from "../../src/modules/chatbot/chatbot.types.js";

// ============================================================================
// CAJA NEGRA — buildContext() del chatbot ULimaBot (HU28, itsRon4ld)
// ----------------------------------------------------------------------------
// Funcionalidad con 15 campos de entrada (> 4):
//   studentName, careerName, currentLevel, intents, dateContext,
//   scheduleData, curriculumData, alertsData, announcementsData,
//   delegatesData, ownBlocks, chatSearchResults, officialGrades, localGrades,
//   question. `history` dejó de ser campo el 2026-09-25: los turnos previos
//   viajan aparte, como turnos de Cohere (BR-CB-07 y BR-CB-20).
//
// Se prueba por PARTICION DE EQUIVALENCIA y VALORES LIMITE sin conocer la
// implementacion, observando solo el texto del contexto que arma la funcion.
// Regla de negocio central: un bloque de datos aparece solo si su intent esta
// presente Y su dato se leyo (no es null ni ausente). Leido vacio, sale con una
// linea de «no hay» (BR-CB-24, ronda final del 2026-09-25). chatSearchResults
// sale con el intent 'chat' o 'announcements' (BR-CB-23). Ver context-builder.ts.
// ============================================================================

const baseDate = { today: "2026-07-13" };

// Fabrica un params completo y valido; cada test sobrescribe lo que necesita.
function make(over: Partial<Parameters<typeof buildContext>[0]> = {}) {
  return buildContext({
    studentName: "Ana Torres",
    careerName: "Ingenieria de Sistemas",
    currentLevel: 5,
    intents: [] as ChatbotIntent[],
    dateContext: baseDate,
    question: "Hola",
    ...over,
  });
}

describe("[CAJA NEGRA] buildContext — perfil del alumno (campos studentName, careerName, currentLevel)", () => {
  test("CV1 perfil completo: nombre, carrera y ciclo aparecen en el mensaje", () => {
    const { message, preamble } = make({ studentName: "Luis Rojas", careerName: "Derecho", currentLevel: 8 });
    expect(message).toContain("Luis Rojas");
    expect(message).toContain("Derecho");
    expect(message).toContain("Ciclo actual: 8");
    expect(preamble).toContain("ULimaBot");
  });

  test("CNV1 currentLevel = null: la linea de ciclo se OMITE (valor limite del perfil)", () => {
    const { message } = make({ currentLevel: null });
    expect(message).toContain("Ana Torres");
    expect(message).not.toContain("Ciclo actual");
  });
});

describe("[CAJA NEGRA] buildContext — bloques por intent + dato (schedule, curriculum, alerts, grades)", () => {
  test("CV2 intent 'schedule' + scheduleData presente: se incluye el bloque de horario", () => {
    const { message } = make({ intents: ["schedule"], scheduleData: { dia: "Lunes", curso: "ISW2" } });
    expect(message).toContain("DATOS DE HORARIO Y EVALUACIONES");
    expect(message).toContain("ISW2");
  });

  test("CNV2 intent 'schedule' SIN scheduleData: el bloque de horario se OMITE", () => {
    const { message } = make({ intents: ["schedule"], scheduleData: undefined });
    expect(message).not.toContain("DATOS DE HORARIO");
  });

  test("CNV3 scheduleData presente SIN intent 'schedule': el bloque se OMITE (falta la intencion)", () => {
    const { message } = make({ intents: [], scheduleData: { dia: "Martes" } });
    expect(message).not.toContain("DATOS DE HORARIO");
  });

  test("CV3 intent 'curriculum' + curriculumData: se incluye el bloque de malla", () => {
    const { message } = make({ intents: ["curriculum"], curriculumData: { avance: "60%" } });
    expect(message).toContain("DATOS DE MALLA CURRICULAR");
    expect(message).toContain("60%");
  });

  test("CV4 intent 'alerts' + alertsData: se incluye el bloque de alertas", () => {
    const { message } = make({ intents: ["alerts"], alertsData: [{ tipo: "academic_risk" }] });
    expect(message).toContain("DATOS DE ALERTAS");
    expect(message).toContain("academic_risk");
  });

  test("CV5 intent 'grades' + localGrades: la calculadora se rotula como SIMULACION NO OFICIAL", () => {
    const { message } = make({ intents: ["grades"], localGrades: { promedio: 14.2 } });
    expect(message).toContain("SIMULACION NO OFICIAL");
    expect(message).toContain("14.2");
  });

  test("CV5b intent 'grades' + officialGrades: bloque de notas oficiales + cuanto falta para aprobar", () => {
    const { message } = make({
      intents: ["grades"],
      officialGrades: [
        {
          courseName: "INGENIERIA DE SOFTWARE II",
          sectionCode: "856",
          evaluaciones: [
            { nombre: "EV01 Examen", peso: 30, nota: 8 },
            { nombre: "EV02 Proyecto", peso: 70, nota: null },
          ],
          pesoCalificado: 30,
          promedioActual: 8,
          notaAcumulada: 2.4,
          estado: "en_curso",
          necesitaEnLoRestante: 11.57,
        },
      ],
    });
    expect(message).toContain("NOTAS OFICIALES");
    expect(message).toContain("INGENIERIA DE SOFTWARE II");
    expect(message).toContain("EV01 Examen");
    expect(message).toContain("Para aprobar");
    expect(message).toContain("11.57");
  });
});

describe("[CAJA NEGRA] buildContext — chatSearchResults (intent 'chat' o 'announcements', BR-CB-23)", () => {
  const chat = [{ sectionName: "CURSO INVENTADO (801)", messages: [{ body: "hola grupo", date: "2026-07-13 10:00" }] }];

  test("CV6 chatSearchResults presente con intent 'chat': se incluye el bloque de chat", () => {
    const { message } = make({ intents: ["chat"], chatSearchResults: chat });
    expect(message).toContain("MENSAJES DEL CHAT DE LA SECCION");
    expect(message).toContain("hola grupo");
  });

  test("CV6b chatSearchResults presente con intent 'announcements': se incluye el bloque de chat", () => {
    const { message } = make({ intents: ["announcements"], chatSearchResults: chat });
    expect(message).toContain("hola grupo");
  });

  test("CNV4b chatSearchResults presente SIN intent de chat ni de avisos: el bloque se OMITE", () => {
    const { message } = make({ intents: ["grades"], chatSearchResults: chat });
    expect(message).not.toContain("MENSAJES DEL CHAT");
    expect(message).not.toContain("hola grupo");
  });

  test("CNV4 chatSearchResults ausente: el bloque de chat se OMITE", () => {
    const { message } = make({ chatSearchResults: undefined });
    expect(message).not.toContain("MENSAJES DEL CHAT");
  });
});

describe("[CAJA NEGRA] buildContext — sin historial (BR-CB-07 y BR-CB-20, ajuste del 2026-09-25)", () => {
  // Antes del ajuste, `history` era un campo y sus 10 ultimos mensajes se
  // pegaban en el mensaje de datos bajo HISTORIAL DE LA CONVERSACION. Ahora los
  // turnos previos viajan una sola vez, como turnos de Cohere, y el limite de 10
  // es de `getRecentMessages` (ver chatbot.history-turns.test.ts).
  test("CV7 con cualquier dominio, el mensaje de datos no trae el bloque de historial", () => {
    const { message } = make({ intents: ["grades", "schedule", "curriculum"] as ChatbotIntent[] });
    expect(message).not.toContain("HISTORIAL DE LA CONVERSACION");
    expect(message).not.toContain("ULimaBot:");
  });

  test("CNV5 un history de mas (campo retirado) no llega al mensaje de datos", () => {
    const history: ChatbotMessageRow[] = [
      { role: "user", content: "que nota saque" } as ChatbotMessageRow,
      { role: "assistant", content: "tu promedio es 14" } as ChatbotMessageRow,
    ];
    const { message } = buildContext({
      studentName: "Ana Torres",
      careerName: "Ingenieria de Sistemas",
      currentLevel: 5,
      intents: [] as ChatbotIntent[],
      dateContext: baseDate,
      question: "Hola",
      history,
    } as Parameters<typeof buildContext>[0]);
    expect(message).not.toContain("que nota saque");
    expect(message).not.toContain("tu promedio es 14");
    expect(message).not.toContain("HISTORIAL DE LA CONVERSACION");
  });
});

describe("[CAJA NEGRA] buildContext — dateContext y question (campos siempre presentes)", () => {
  test("CV8 dateContext con periodo y semana: se incluyen ambas lineas", () => {
    const { message } = make({
      dateContext: {
        today: "2026-07-13",
        academicPeriodCode: "2026-1",
        currentWeekNumber: 14,
        currentWeekRange: "13/07 - 19/07",
      },
    });
    expect(message).toContain("Periodo academico: 2026-1");
    expect(message).toContain("Hoy: 2026-07-13");
    expect(message).toContain("Semana actual: 14");
  });

  test("CNV6 dateContext minimo (solo today): sin lineas de periodo ni semana, pero 'Hoy' presente", () => {
    const { message } = make({ dateContext: { today: "2026-07-13" } });
    expect(message).toContain("Hoy: 2026-07-13");
    expect(message).not.toContain("Periodo academico");
    expect(message).not.toContain("Semana actual");
  });

  test("CV9 question siempre se agrega al final del contexto", () => {
    const { message } = make({ question: "cuantos creditos me faltan" });
    expect(message).toContain("PREGUNTA DEL ALUMNO");
    expect(message.trimEnd().endsWith("cuantos creditos me faltan")).toBe(true);
  });
});
