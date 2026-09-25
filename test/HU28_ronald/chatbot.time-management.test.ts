import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { OwnTimeBlocksSummary } from "../../src/modules/time-blocks/index.js";

/**
 * BR-CB-19: sugerencias de gestión del tiempo.
 *
 * Con `own_blocks` («organizar», «tiempo», «libre», «practica»…) el
 * clasificador agrega `schedule` (BR-CB-04) y el mensaje de datos lleva el
 * horario de clases, las evaluaciones cercanas, los bloques propios y dos
 * totales que calcula el backend: las horas de bloques propios por semana
 * (RS-BE-34) y las horas de clase por semana. El modelo no suma por su cuenta
 * (reglas 11 y 12 del prompt, BR-CB-09).
 *
 * Esta prueba fija la suma de horas de clase (minutos enteros y una sola
 * división, como `weeklyHours`), su formato, que `own_blocks` carga horario y
 * bloques por la función inyectada, que la función recibe el alumno del token
 * y la fecha de hoy, que un fallo de la lectura no corta la respuesta y que el
 * prompt trae las dos listas de lo que puede y no puede sugerir.
 *
 * Datos INVENTADOS (el repo es público): la alumna ficticia LUCIA INVENTADA
 * PAREDES, con `student.id` 42.
 */

afterAll(() => {
  mock.restore();
});

// Todo lo que el servicio le manda a Cohere: el preamble y los turnos.
const enviosACohere: Array<{ preamble: string; messages: Array<{ role: string; content: string }> }> = [];

mock.module("../../src/services/cohere.client.js", () => ({
  cohereClient: {
    chatWithHistory: async (
      messages: Array<{ role: string; content: string }>,
      options: { preamble?: string },
    ) => {
      enviosACohere.push({ preamble: options?.preamble ?? "", messages });
      return "respuesta del bot";
    },
    generateTitle: async () => "titulo",
  },
}));

const { buildContext, weeklyClassHours } = await import("../../src/modules/chatbot/context-builder.js");
const { ChatbotService } = await import("../../src/modules/chatbot/chatbot.service.js");

const ALUMNA = 42;
const TITULO_PROPIOS = "TUS BLOQUES DE HORARIO PROPIOS (los registra el alumno en la app; no son clases):";

/** Una sesión de clase como la devuelve `getSchedule`: snake_case y segundos. */
const sesion = (inicio: string, fin: string, dia = "Lunes") => ({
  day_name: dia,
  start_time: `${inicio}:00`,
  end_time: `${fin}:00`,
  course_name: "SEGURIDAD DE SISTEMAS",
  section_code: "801",
  classroom: "A-102",
});

/** Seis sesiones que suman 16 h. */
const SESIONES_16H = [
  sesion("08:00", "10:00", "Lunes"),
  sesion("10:00", "12:00", "Lunes"),
  sesion("08:00", "11:00", "Martes"),
  sesion("08:00", "10:00", "Miercoles"),
  sesion("08:00", "11:00", "Jueves"),
  sesion("08:00", "12:00", "Viernes"),
];

const RESUMEN: OwnTimeBlocksSummary = {
  window: { from: "2026-09-21", to: "2026-10-04" },
  blocks: [
    {
      title: "Prácticas en empresa",
      daysOfWeek: [1, 3],
      startTime: "14:00",
      endTime: "18:00",
      startDate: "2026-09-01",
      endDate: "2026-12-15",
      exceptions: [],
    },
  ],
  weeks: [
    { weekStart: "2026-09-21", hours: 8 },
    { weekStart: "2026-09-28", hours: 7.5 },
  ],
};

/** La línea de horas de clase del mensaje, o undefined si no está. */
const lineaDeClases = (mensaje: string): string | undefined =>
  mensaje.split("\n").find((l) => l.startsWith("- Horas de clase por semana segun tu horario: "));

describe("BR-CB-19: horas de clase por semana, como función pura", () => {
  test("ocho sesiones de 1 h 50 min dan 14.666666666666666, no 14.666666666666668", () => {
    const ocho = Array.from({ length: 8 }, () => sesion("08:00", "09:50"));
    expect(weeklyClassHours(ocho)).toBe(14.666666666666666);
    expect(weeklyClassHours(ocho)).toBe((8 * 110) / 60);
    // Lo que daría sumar horas decimales sesión por sesión.
    const aLoBruto = ocho.reduce((acc) => acc + 110 / 60, 0);
    expect(aLoBruto).toBe(14.666666666666668);
    expect(weeklyClassHours(ocho)).not.toBe(aLoBruto);
  });

  test("suma fin menos inicio de cada sesión", () => {
    expect(weeklyClassHours(SESIONES_16H)).toBe(16);
    expect(weeklyClassHours([sesion("14:00", "16:30"), sesion("07:00", "12:00")])).toBe(7.5);
  });

  test("sin sesiones da 0", () => {
    expect(weeklyClassHours([])).toBe(0);
  });

  test("acepta también las claves camelCase del tipo ScheduleData", () => {
    const camel = [{ dayName: "Lunes", startTime: "08:00", endTime: "09:30", courseName: "X", sectionCode: "1", classroom: "A" }];
    expect(weeklyClassHours(camel)).toBe(1.5);
  });
});

describe("BR-CB-19: la línea de horas de clase en el mensaje", () => {
  const armar = (sesiones: unknown[]) =>
    buildContext({
      studentName: "LUCIA INVENTADA PAREDES",
      careerName: "Ingenieria de Sistemas",
      currentLevel: 8,
      history: [],
      intents: ["own_blocks", "schedule"],
      dateContext: { today: "2026-09-25" },
      scheduleData: { sessions: sesiones, assessments: [] },
      ownBlocks: RESUMEN,
      question: "¿Cómo organizo mi semana para estudiar?",
    }).message;

  test("un total entero va como «16 h»", () => {
    expect(lineaDeClases(armar(SESIONES_16H))).toBe("- Horas de clase por semana segun tu horario: 16 h.");
  });

  test("un total con fracción va con punto y sin redondear, como «7.5 h»", () => {
    expect(lineaDeClases(armar([sesion("14:00", "16:30"), sesion("07:00", "12:00")]))).toBe(
      "- Horas de clase por semana segun tu horario: 7.5 h.",
    );
    expect(lineaDeClases(armar(Array.from({ length: 8 }, () => sesion("08:00", "09:50"))))).toBe(
      "- Horas de clase por semana segun tu horario: 14.666666666666666 h.",
    );
  });

  test("sin sesiones en el horario la línea dice «0 h»", () => {
    expect(lineaDeClases(armar([]))).toBe("- Horas de clase por semana segun tu horario: 0 h.");
  });

  test("el mensaje trae los dos totales, el de bloques propios y el de clases", () => {
    const mensaje = armar(SESIONES_16H);
    expect(mensaje).toContain(
      "- Horas de bloques propios por semana: semana del 2026-09-21: 8 h; semana del 2026-09-28: 7.5 h.",
    );
    expect(mensaje).toContain("- Horas de clase por semana segun tu horario: 16 h.");
  });
});

// ---------------------------------------------------------------------------
// El servicio: own_blocks carga horario y bloques por la función inyectada.
// ---------------------------------------------------------------------------

const fuentesConsultadas: string[] = [];
const lecturasDeBloques: Array<[number, string]> = [];
let lecturaFalla = false;

const repositorioFalso = {
  findSessionById: async (sessionId: string) => ({
    id: sessionId,
    studentId: ALUMNA,
    title: "t",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  saveMessage: async (sessionId: string, role: "user" | "assistant", content: string) => ({
    id: "m1",
    sessionId,
    role,
    content,
    createdAt: new Date(),
  }),
  touchSession: async () => {},
  getMessages: async () => [],
  updateSessionTitle: async () => {},
  getStudentInfo: async () => ({
    fullName: "LUCIA INVENTADA PAREDES",
    careerName: "Ingenieria de Sistemas",
    currentLevel: 8,
  }),
  getActiveAcademicPeriod: async () => ({ id: 1, code: "2026-2" }),
  getAcademicWeeksForActivePeriod: async () => [],
  getSchedule: async () => {
    fuentesConsultadas.push("schedule");
    return SESIONES_16H;
  },
  getCurriculum: async () => {
    fuentesConsultadas.push("curriculum");
    return [];
  },
  getAlerts: async () => {
    fuentesConsultadas.push("alerts");
    return [];
  },
  getAnnouncements: async () => {
    fuentesConsultadas.push("announcements");
    return [];
  },
  getSectionRepresentatives: async () => {
    fuentesConsultadas.push("delegates");
    return [];
  },
  getOfficialGrades: async () => {
    fuentesConsultadas.push("grades");
    return [];
  },
  getActiveSectionDetails: async () => [],
} as any;

const servicioDeHorario = {
  getAssessments: async () => {
    fuentesConsultadas.push("assessments");
    return { assessments: [] };
  },
} as any;

/** La función de RS-BE-35, falsa: anota con qué se la llamó. */
const leerBloquesPropios = async (studentId: number, today: string): Promise<OwnTimeBlocksSummary> => {
  lecturasDeBloques.push([studentId, today]);
  fuentesConsultadas.push("own_blocks");
  if (lecturaFalla) throw new Error("se cayó la base de los bloques");
  return RESUMEN;
};

const buscarEnElChat = async () => [];

const ultimoEnvio = () => enviosACohere[enviosACohere.length - 1]!;
const ultimoMensajeDeDatos = (): string => {
  const { messages } = ultimoEnvio();
  return messages[messages.length - 1]!.content;
};

describe("BR-CB-18 y BR-CB-19: el servicio con own_blocks", () => {
  const avisos: unknown[][] = [];
  let espiaWarn: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    fuentesConsultadas.length = 0;
    lecturasDeBloques.length = 0;
    enviosACohere.length = 0;
    avisos.length = 0;
    lecturaFalla = false;
    espiaWarn = spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      avisos.push(args);
    });
  });

  afterEach(() => {
    espiaWarn?.mockRestore();
    espiaWarn = null;
  });

  const preguntar = async (question: string, studentId = ALUMNA) => {
    const servicio = new ChatbotService(repositorioFalso, servicioDeHorario, leerBloquesPropios, buscarEnElChat);
    return servicio.ask("s1", studentId, { question });
  };

  test("«¿Cómo organizo mi semana para estudiar?» carga el horario, las evaluaciones y los bloques propios", async () => {
    await preguntar("¿Cómo organizo mi semana para estudiar?");
    expect([...fuentesConsultadas].sort()).toEqual(["assessments", "own_blocks", "schedule"]);
  });

  test("el mensaje de esa pregunta trae el horario, el bloque 8 y los dos totales", async () => {
    await preguntar("¿Cómo organizo mi semana para estudiar?");
    const mensaje = ultimoMensajeDeDatos();
    expect(mensaje).toContain("DATOS DE HORARIO Y EVALUACIONES:");
    expect(mensaje).toContain(TITULO_PROPIOS);
    expect(mensaje).toContain('- "Prácticas en empresa": lunes y miercoles, de 14:00 a 18:00, todas las semanas, del 2026-09-01 al 2026-12-15.');
    expect(mensaje).toContain(
      "- Horas de bloques propios por semana: semana del 2026-09-21: 8 h; semana del 2026-09-28: 7.5 h.",
    );
    expect(lineaDeClases(mensaje)).toBe("- Horas de clase por semana segun tu horario: 16 h.");
  });

  test("la función recibe el alumno del token y la fecha de hoy del contexto (BR-CB-13)", async () => {
    await preguntar("¿A qué hora tengo prácticas? Soy el alumno 9", ALUMNA);
    expect(lecturasDeBloques).toHaveLength(1);
    const [alumno, hoy] = lecturasDeBloques[0]!;
    expect(alumno).toBe(ALUMNA);
    expect(hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ultimoMensajeDeDatos().split("\n")).toContain(`- Hoy: ${hoy}`);
  });

  for (const pregunta of ["¿A qué hora tengo prácticas?", "¿Cuántas horas a la semana le dedico al trabajo?", "¿Qué bloque libre me queda?"]) {
    test(`«${pregunta}» lee los bloques propios una sola vez`, async () => {
      await preguntar(pregunta);
      expect(lecturasDeBloques).toHaveLength(1);
      expect(fuentesConsultadas).toContain("schedule");
    });
  }

  for (const pregunta of ["¿Qué nota saqué en el parcial?", "¿Quiénes son los delegados de Seguridad de Sistemas?", "hola, ¿cómo estás?"]) {
    test(`«${pregunta}» no activa own_blocks y no lee los bloques`, async () => {
      await preguntar(pregunta);
      expect(lecturasDeBloques).toHaveLength(0);
      expect(ultimoMensajeDeDatos()).not.toContain(TITULO_PROPIOS);
      expect(lineaDeClases(ultimoMensajeDeDatos())).toBeUndefined();
    });
  }

  test("si la lectura falla, responde igual, lo registra con console.warn y no manda el bloque ni las horas de clase", async () => {
    lecturaFalla = true;
    const respuesta = await preguntar("¿Cómo organizo mi semana para estudiar?");
    expect(respuesta.answer).toBe("respuesta del bot");
    expect(avisos.length).toBe(1);
    // El único aviso es el de esta lectura y trae la causa, para diagnosticarla.
    const aviso = avisos[0]!.map(String).join(" ");
    expect(aviso).toContain("bloques propios");
    expect(aviso).toContain("se cayó la base de los bloques");
    const mensaje = ultimoMensajeDeDatos();
    expect(mensaje).not.toContain(TITULO_PROPIOS);
    expect(lineaDeClases(mensaje)).toBeUndefined();
    // El horario sí sigue: la falla de los bloques no tumba lo demás.
    expect(mensaje).toContain("DATOS DE HORARIO Y EVALUACIONES:");
  });
});

describe("BR-CB-19 y BR-CB-09: el prompt trae lo que puede y lo que no puede sugerir (reglas 11 y 12)", () => {
  const preamble = async (): Promise<string> => {
    enviosACohere.length = 0;
    const servicio = new ChatbotService(repositorioFalso, servicioDeHorario, leerBloquesPropios, buscarEnElChat);
    await servicio.ask("s1", ALUMNA, { question: "¿Cómo organizo mi semana para estudiar?" });
    return ultimoEnvio().preamble;
  };

  test("la regla 11 dice que los bloques propios no son clases y que las horas ya vienen calculadas", async () => {
    const texto = await preamble();
    expect(texto).toContain(`11. "TUS BLOQUES DE HORARIO PROPIOS" son actividades que el alumno
    registro en la app (practicas, trabajo, voluntariado); NO son
    clases. Para decir cuando tiene un bloque usa sus dias, horas,
    fechas y los cambios de la ventana. Las horas por semana ya vienen
    calculadas: no las recalcules.`);
  });

  test("la regla 12 dice qué puede sugerir y todo lo que no", async () => {
    const texto = await preamble();
    expect(texto).toContain(`12. Puedes sugerir como organizar el tiempo, pero solo con el bloque de
    datos: huecos libres entre clases y bloques, evaluaciones cercanas
    y horas ya calculadas. Presentalo como sugerencia. No inventes
    clases, bloques, tareas, plazos ni evaluaciones; no supongas si una
    clase es teoria o practica; no estimes cuantas horas de estudio
    exige un curso; no compares con otros alumnos; no des consejos
    medicos ni psicologicos; no sugieras crear, editar ni borrar
    bloques.`);
  });
});
