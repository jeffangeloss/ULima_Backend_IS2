import { describe, expect, test } from "bun:test";
import { AttendanceRiskService } from "../../src/modules/attendance-risk/attendance-risk.service.js";
import type { AttendanceRiskRepository } from "../../src/modules/attendance-risk/attendance-risk.repository.js";
import type { AttendanceRiskRawRow, StudentNotifyRow } from "../../src/modules/attendance-risk/attendance-risk.types.js";
import type { EventBus } from "../../src/events/index.js";

/**
 * RS-BE-10: "sin datos" no puede seguir disfrazándose de "asistencia perfecta".
 *
 * Hoy `enrollment.absent_hours/attended_hours/total_hours` nunca se escriben
 * (portal-sync inserta 4 columnas y ninguna es de horas), así que TODO el
 * período activo está en 0. Con el denominador saliendo de `course_offering`
 * (48 h, 64 h), el servicio calcula 0/48 = 0% y clasifica a todo el mundo como
 * `normal`: el docente ve "0 impedidos, 0 en riesgo" y concluye que su salón
 * está sano, cuando en realidad no hay un solo dato cargado.
 *
 * La señal de procedencia sale gratis del CHECK `chk_enrollment_attendance_hours`
 * (attended + absent <= total): toda fila con dato real tiene `total_hours > 0`,
 * así que `enrollment.total_hours = 0` significa exactamente "nunca se escribió".
 */

const noopEvents = {} as unknown as EventBus;

const row = (over: Partial<AttendanceRiskRawRow> = {}): AttendanceRiskRawRow => ({
  code: "20230001",
  full_name: "Garcia Lopez, Maria",
  current_level: 5,
  absent_hours: "0",
  total_section_hours: "80",
  enrollment_total_hours: "80",
  cycle: 3,
  ...over,
});

const notifyRow = (over: Partial<StudentNotifyRow> = {}): StudentNotifyRow => ({
  student_id: 1,
  code: "20230001",
  full_name: "Garcia Lopez, Maria",
  current_level: 5,
  absent_hours: "0",
  total_section_hours: "80",
  enrollment_total_hours: "80",
  course_name: "CIBERSEGURIDAD",
  section_code: "751",
  cycle: 3,
  ...over,
});

const serviceWith = (rows: AttendanceRiskRawRow[]) =>
  new AttendanceRiskService(
    {
      findStudentsBySectionId: async () => rows,
      findModalSessionHours: async () => null,   // sin horario -> cae al 2 heredado (RS-BE-13)
    } as unknown as AttendanceRiskRepository,
    noopEvents,
  );

describe("estado sin_datos", () => {
  test("una matricula sin horas escritas es sin_datos, no normal", async () => {
    const res = await serviceWith([row({ enrollment_total_hours: "0" })]).getAttendanceRisk(1);
    expect(res.students[0].status).toBe("sin_datos");
  });

  test("sin_datos no inventa un 0% de ausencia", async () => {
    const res = await serviceWith([row({ enrollment_total_hours: "0" })]).getAttendanceRisk(1);
    expect(res.students[0].absencePercentage).toBeNull();
  });

  test("el resumen cuenta sin_datos aparte y NO lo suma a normal", async () => {
    const res = await serviceWith([
      row({ code: "1", enrollment_total_hours: "0" }),
      row({ code: "2", enrollment_total_hours: "0" }),
      row({ code: "3", absent_hours: "4" }),
    ]).getAttendanceRisk(1);
    expect(res.summary.sin_datos).toBe(2);
    expect(res.summary.normal).toBe(1);
    expect(res.summary.total).toBe(3);
  });

  test("con horas reales el diagnostico de impedido no cambia", async () => {
    // 30 de 80 h = 37.5% > 25% (ciclo 3) -> impedido, como siempre.
    const res = await serviceWith([row({ absent_hours: "30" })]).getAttendanceRisk(1);
    expect(res.students[0].status).toBe("impedido");
  });
});

describe("notifyStudents no alerta sobre datos ausentes", () => {
  const spyService = (rows: StudentNotifyRow[]) => {
    const captured: { studentId: number; title: string; message: string }[] = [];
    const service = new AttendanceRiskService(
      {
        findStudentDetailsBySectionId: async () => rows,
        findModalSessionHours: async () => null,   // sin horario -> cae al 2 heredado (RS-BE-13)
        createAlerts: async (d: typeof captured) => { captured.push(...d); return d.length; },
      } as unknown as AttendanceRiskRepository,
      noopEvents,
    );
    return { service, captured };
  };

  test("una matricula sin horas escritas nunca genera alerta", async () => {
    const { service, captured } = spyService([
      notifyRow({ student_id: 7, absent_hours: "30", enrollment_total_hours: "0" }),
    ]);
    const res = await service.notifyStudents(1);
    expect(captured).toHaveLength(0);
    expect(res.notified).toBe(0);
  });

  test("el mensaje distingue 'nadie en riesgo' de 'nadie tiene datos'", async () => {
    const { service } = spyService([
      notifyRow({ student_id: 7, enrollment_total_hours: "0" }),
      notifyRow({ student_id: 8, enrollment_total_hours: "0" }),
    ]);
    const res = await service.notifyStudents(1);
    // La respuesta vieja era "No hay alumnos que notificar.", que es una
    // afirmación falsa sobre la realidad académica de esos alumnos.
    expect(res.message).toContain("2");
    expect(res.message.toLowerCase()).toContain("sin datos");
  });

  test("con horas reales la alerta de impedido se sigue enviando", async () => {
    const { service, captured } = spyService([
      notifyRow({ student_id: 9, absent_hours: "30" }),
    ]);
    await service.notifyStudents(1);
    expect(captured).toHaveLength(1);
    expect(captured[0].studentId).toBe(9);
  });
});
