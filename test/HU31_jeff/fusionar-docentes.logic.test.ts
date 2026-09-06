import { describe, expect, test } from "bun:test";
import { planificarFusion, type Asesoria, type DocenteFila, type Seccion } from "../../src/db/seed/fusionar-docentes.logic.js";

/**
 * Fusión de docentes duplicados. El daño ya está hecho en producción (11 grupos
 * al 2026-09-05) porque `upsertTeacher` resolvía solo por `teacher_code` y las
 * filas sembradas no lo tienen.
 *
 * Repuntar filas es barato; equivocarse no. Tres constraints pueden reventar la
 * transacción y una elección mala deja al docente sin ver sus propias secciones,
 * así que lo que se prueba acá es a quién elige y cuándo se NIEGA a fusionar.
 */
const d = (id: number, fullName: string, o: Partial<DocenteFila> = {}): DocenteFila =>
  ({ id, fullName, teacherCode: null, institutionalEmail: null, userId: null, ...o });
const sec = (id: number, teacherId: number, jpId: number | null = null): Seccion => ({ id, teacherId, jpId });
const ase = (id: number, teacherId: number, o: Partial<Asesoria> = {}): Asesoria =>
  ({ id, teacherId, offeringId: 1, sectionId: null, dayOfWeek: 1, startTime: "09:00:00", kind: "recurring", sessionDate: null, ...o });
const plan = (o: Partial<Parameters<typeof planificarFusion>[0]>) =>
  planificarFusion({ docentes: [], secciones: [], asesorias: [], seccionesActivas: new Set(), ...o });

describe("agrupar", () => {
  test("el mismo nombre en distinto orden es un grupo; personas distintas no", () => {
    const p = plan({ docentes: [d(1, "DIAZ PARRA, JOSE RAUL"), d(2, "JOSE RAUL DIAZ PARRA"), d(3, "OTRA PERSONA DISTINTA")] });
    expect(p.fusionar).toHaveLength(1);
    expect(p.fusionar[0].perdedores.map((x) => x.id)).toEqual([2]);
  });
  test("un docente solo no genera trabajo", () => {
    expect(plan({ docentes: [d(1, "PEREZ RAMIREZ JUAN")] }).fusionar).toHaveLength(0);
  });
});

describe("a quién se conserva", () => {
  test("la fila con CUENTA gana aunque tenga id mayor", () => {
    // Es la fila con la que esa persona entra a la app: si se borra, pierde el acceso.
    const p = plan({ docentes: [d(12, "HERNAN QUINTANA CRUZ"), d(129, "QUINTANA CRUZ, HERNAN", { userId: 900 })] });
    expect(p.fusionar[0].superviviente.id).toBe(129);
  });
  test("sin cuenta, gana la referenciada por secciones del ciclo ACTIVO", () => {
    const p = plan({
      docentes: [d(5, "MACHUCA DE PINA, JUAN"), d(229, "JUAN MACHUCA DE PINA", { teacherCode: "PORTAL:X" })],
      secciones: [sec(70, 229), sec(80, 5)], seccionesActivas: new Set([70]),
    });
    expect(p.fusionar[0].superviviente.id).toBe(229);
  });
  test("empatadas, gana la que tiene teacher_code y luego el id menor", () => {
    expect(plan({ docentes: [d(9, "ANA LOPEZ SOTO"), d(4, "LOPEZ SOTO, ANA", { teacherCode: "DOC004" })] })
      .fusionar[0].superviviente.id).toBe(4);
    expect(plan({ docentes: [d(9, "ANA LOPEZ SOTO"), d(4, "LOPEZ SOTO, ANA")] })
      .fusionar[0].superviviente.id).toBe(4);
  });
});

describe("qué se arrastra al superviviente", () => {
  test("secciones, jefaturas de práctica y asesorías de los perdedores", () => {
    const p = plan({
      docentes: [d(1, "ANA LOPEZ SOTO"), d(2, "LOPEZ SOTO, ANA")],
      secciones: [sec(70, 2), sec(80, 90, 2)], asesorias: [ase(500, 2)],
    });
    const f = p.fusionar[0];
    expect(f.superviviente.id).toBe(1);
    expect({ secciones: f.secciones, jps: f.jps, asesorias: f.asesorias }).toEqual({ secciones: [70], jps: [80], asesorias: [500] });
  });
  test("se rellena el teacher_code solo si al superviviente le falta, tomándolo del perdedor", () => {
    const conCodigo = plan({ docentes: [d(1, "ANA LOPEZ SOTO", { userId: 9 }), d(2, "LOPEZ SOTO, ANA", { teacherCode: "PORTAL:ANA-LOPEZ-SOTO" })] });
    expect(conCodigo.fusionar[0].rellenarCodigo).toBe("PORTAL:ANA-LOPEZ-SOTO");
    const yaTenia = plan({ docentes: [d(1, "ANA LOPEZ SOTO", { userId: 9, teacherCode: "DOC001" }), d(2, "LOPEZ SOTO, ANA", { teacherCode: "PORTAL:X" })] });
    expect(yaTenia.fusionar[0].rellenarCodigo).toBeNull();
  });
  test("el correo institucional del perdedor se rescata si el superviviente no tiene", () => {
    // `institutional_email` es unique: si no se mueve antes de borrar, se pierde.
    const p = plan({ docentes: [d(1, "ANA LOPEZ SOTO", { userId: 9 }), d(2, "LOPEZ SOTO, ANA", { institutionalEmail: "alopez@ulima.edu.pe" })] });
    expect(p.fusionar[0].moverEmail).toBe("alopez@ulima.edu.pe");
  });
});

describe("cuándo se NIEGA a fusionar (se salta el grupo y se reporta)", () => {
  test("dos filas con cuenta: no se puede decidir sin un humano", () => {
    const p = plan({ docentes: [d(1, "ANA LOPEZ SOTO", { userId: 9 }), d(2, "LOPEZ SOTO, ANA", { userId: 10 })] });
    expect(p.fusionar).toHaveLength(0);
    expect(p.saltados[0].motivo).toContain("cuenta");
  });
  test("la misma persona es profesor y JP de la MISMA sección: violaría chk_section_jp_not_teacher", () => {
    const p = plan({ docentes: [d(1, "ANA LOPEZ SOTO"), d(2, "LOPEZ SOTO, ANA")], secciones: [sec(70, 1, 2)] });
    expect(p.fusionar).toHaveLength(0);
    expect(p.saltados[0].motivo).toContain("sección 70");
  });
  test("quedaría como JP de dos secciones: violaría uq_section_jp", () => {
    const p = plan({ docentes: [d(1, "ANA LOPEZ SOTO"), d(2, "LOPEZ SOTO, ANA")], secciones: [sec(70, 90, 1), sec(80, 91, 2)] });
    expect(p.fusionar).toHaveLength(0);
    expect(p.saltados[0].motivo).toContain("jefe de práctica");
  });
  test("dos asesorías que chocarían en el mismo curso, día y hora", () => {
    // Decisión del owner (2026-09-05): saltar el grupo y reportarlo, en vez de
    // borrar en silencio una asesoría que puede tener alumnos confirmados.
    const p = plan({
      docentes: [d(1, "ANA LOPEZ SOTO"), d(2, "LOPEZ SOTO, ANA")],
      asesorias: [ase(500, 1), ase(501, 2)],
    });
    expect(p.fusionar).toHaveLength(0);
    expect(p.saltados[0].motivo).toContain("asesoría");
  });
  test("asesorías del mismo par pero en distinto día NO chocan: el grupo se fusiona", () => {
    const p = plan({ docentes: [d(1, "ANA LOPEZ SOTO"), d(2, "LOPEZ SOTO, ANA")], asesorias: [ase(500, 1), ase(501, 2, { dayOfWeek: 3 })] });
    expect(p.fusionar).toHaveLength(1);
    expect(p.fusionar[0].asesorias).toEqual([501]);
  });
  test("una extra y una recurrente a la misma hora no chocan: sus índices son distintos", () => {
    const p = plan({ docentes: [d(1, "ANA LOPEZ SOTO"), d(2, "LOPEZ SOTO, ANA")],
      asesorias: [ase(500, 1), ase(501, 2, { kind: "extra", sessionDate: "2026-09-10" })] });
    expect(p.fusionar).toHaveLength(1);
  });
  test("un grupo saltado no impide fusionar los demás", () => {
    const p = plan({ docentes: [
      d(1, "ANA LOPEZ SOTO", { userId: 9 }), d(2, "LOPEZ SOTO, ANA", { userId: 10 }),
      d(3, "BETO RUIZ MAR"), d(4, "RUIZ MAR, BETO"),
    ] });
    expect(p.fusionar.map((f) => f.superviviente.id)).toEqual([3]);
    expect(p.saltados).toHaveLength(1);
  });
});
