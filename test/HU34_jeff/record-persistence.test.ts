import { describe, expect, spyOn, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type {
  AcademicGeneral,
  AcademicPeriodBlock,
  RecordRow,
} from "../../src/modules/portal-sync/portal-sync.types.js";
// ── Tarea 6: las tres escrituras vistas desde el service (RS-BE-22, RS-BE-25) ──
// Alias en los nombres que ya usa este archivo para las pruebas de SQL del
// repositorio.
import { PortalSyncService as ServicioPortalSync } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository as RepositorioPortalSync } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient as ClientePortal } from "../../src/services/portal.client.js";
import type {
  AcademicGeneral as GeneralAcademico,
  AcademicPeriodBlock as BloquePeriodo,
  RecordRow as FilaRecord,
} from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-22 y RS-BE-25: dentro de la transaccion de la importacion, con record
 * de confianza y consentimiento, se toma un candado por alumno y se reemplazan
 * la copia del record y el resumen por ciclo, y se pisa la foto acumulada.
 *
 * Estas pruebas miran el SQL RENDERIZADO ademas del resultado, como
 * `repository.progress-batch.test.ts` y `repository.withdraw-array.test.ts`:
 * la clase de defecto que importa aca la produce Postgres al ejecutar (un
 * parametro que se evapora, un arreglo que se vuelve constructor de fila, un
 * UNIQUE que aborta la transaccion entera) y no el codigo al armar. No abren
 * ninguna conexion: el `tx` es de mentira.
 *
 * Datos 100% inventados, alumno sintetico 20230001 (studentId interno 77).
 */
const fakeTx = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  return {
    tx: { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
    llamadas: () => capturadas.length,
  };
};

const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** Las 6 filas que la Tarea 1 lee de `test/HU34_jeff/fixtures/record.html`. */
const FILAS: RecordRow[] = [
  { periodCode: "2023-1", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 1, credits: 4,
    grade: 8, sectionCode: "101", gradeRaw: "08", observation: null },
  { periodCode: "2023-1", courseCode: "4901", courseName: "LENGUAJE DE PRUEBA", attempt: 1, credits: 3,
    grade: 14, sectionCode: "102", gradeRaw: "14", observation: null },
  { periodCode: "2023-2", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 2, credits: 4,
    grade: 12, sectionCode: "201", gradeRaw: "12", observation: null },
  { periodCode: "2023-2", courseCode: "659002", courseName: "TALLER DE PRUEBA", attempt: 1, credits: 1.5,
    grade: 17, sectionCode: "917", gradeRaw: "17", observation: "OBSERVACIÓN DE PRUEBA" },
  { periodCode: "2026-2", courseCode: "659003", courseName: "CURSO EN CURSO UNO", attempt: 1, credits: 3,
    grade: null, sectionCode: "301", gradeRaw: null, observation: null },
  { periodCode: "2026-2", courseCode: "659004", courseName: "CURSO EN CURSO DOS", attempt: 1, credits: 4,
    grade: null, sectionCode: "1302", gradeRaw: null, observation: null },
];

/** Bloque "Informacion General" del layout HU34, con los mismos valores inventados. */
const GENERAL: AcademicGeneral = {
  ppa: 14.25,
  relativePosition: "TERCIO SUPERIOR",
  convalidated: { courses: 2, credits: 6 },
  approved: { courses: 30, credits: 100 },
  creditsAccumulated: 106,
  creditsRequired: 210,
};

/** Misma forma que `EMPTY_GENERAL` (Tarea 3): el bloque no se pudo leer. */
const GENERAL_VACIO: AcademicGeneral = {
  ppa: null,
  relativePosition: null,
  convalidated: { courses: null, credits: null },
  approved: { courses: null, credits: null },
  creditsAccumulated: null,
  creditsRequired: null,
};

/** Bloque "Informacion por Periodo Academico: Ciclo 2026-1" del layout HU34. */
const PERIODO: AcademicPeriodBlock = {
  periodCode: "2026-1",
  average: 13.25,
  relativePosition: "MEDIO SUPERIOR",
  level: 4,
  convalidated: { courses: 1, credits: 3 },
  enrolled: { courses: 7, credits: 23 },
  approved: { courses: 5, credits: 16 },
  failed: { courses: 2, credits: 7 },
};

const FECHA = new Date("2026-09-19T15:00:00.000Z");

describe("lockAcademicRecord", () => {
  test("toma el candado por alumno con hashtext y un solo parametro", async () => {
    const { tx, consultas, llamadas } = fakeTx([]);
    await repo.lockAcademicRecord(tx, 77);
    expect(llamadas()).toBe(1);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("pg_advisory_xact_lock(hashtext('academic-record'), $1::int)");
    expect(params).toEqual([77]);
  });

  test("es candado de TRANSACCION, no de sesion", async () => {
    // `pg_advisory_lock` se suelta a mano o al cerrar la conexion, y la
    // conexion vuelve al pool: un candado colgado bloquearia al alumno para
    // siempre. `_xact_` se suelta solo en el commit o el rollback.
    const { tx, consultas } = fakeTx([]);
    await repo.lockAcademicRecord(tx, 77);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("pg_advisory_xact_lock(");
    expect(q).not.toContain("pg_advisory_lock(");
    expect(q).not.toContain("pg_try_advisory");
  });
});

describe("replaceRecordEntries", () => {
  test("reemplaza entera la copia del alumno: primero borra y despues inserta", async () => {
    const { tx, consultas, llamadas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    expect(llamadas()).toBe(2);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_record_entry where student_id = $1");
    expect(consultas()[0]!.params).toEqual([77]);
    expect(norm(consultas()[1]!.sql)).toContain("insert into student_record_entry");
  });

  test("las 6 filas viajan en UN solo parametro JSON", async () => {
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    const { sql: texto, params } = consultas()[1]!;
    // studentId + payload: el numero de parametros no crece con el record.
    expect(params).toHaveLength(2);
    expect(params[0]).toBe(77);
    expect(JSON.parse(String(params[1]))).toEqual([
      { p: "2023-1", c: "659001", n: "MATEMÁTICA DE PRUEBA", a: 1, cr: 4, g: 8, gr: "08", s: "101", o: null },
      { p: "2023-1", c: "4901", n: "LENGUAJE DE PRUEBA", a: 1, cr: 3, g: 14, gr: "14", s: "102", o: null },
      { p: "2023-2", c: "659001", n: "MATEMÁTICA DE PRUEBA", a: 2, cr: 4, g: 12, gr: "12", s: "201", o: null },
      { p: "2023-2", c: "659002", n: "TALLER DE PRUEBA", a: 1, cr: 1.5, g: 17, gr: "17", s: "917",
        o: "OBSERVACIÓN DE PRUEBA" },
      { p: "2026-2", c: "659003", n: "CURSO EN CURSO UNO", a: 1, cr: 3, g: null, gr: null, s: "301", o: null },
      { p: "2026-2", c: "659004", n: "CURSO EN CURSO DOS", a: 1, cr: 4, g: null, gr: null, s: "1302", o: null },
    ]);
    // Nada del record concatenado dentro del SQL.
    expect(texto).not.toContain("659001");
    expect(norm(texto)).toContain("from json_array_elements($2::json) as x");
  });

  test("escribe las diez columnas en el orden de la tabla", async () => {
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    expect(norm(consultas()[1]!.sql)).toContain(
      "insert into student_record_entry (student_id, period_code, course_code, course_name, "
      + "attempt, credits, grade, grade_raw, section_code, observation)",
    );
  });

  test("castea cada campo del JSON al tipo de su columna y la seccion vacia entra como null", async () => {
    // `x->>'…'` siempre devuelve texto: sin cast, `attempt` y `grade` (smallint)
    // y `credits` (numeric) fallarian con 42804 y abortarian la importacion.
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    const q = norm(consultas()[1]!.sql);
    expect(q).toContain("(x->>'a')::smallint");
    expect(q).toContain("(x->>'cr')::numeric");
    expect(q).toContain("(x->>'g')::smallint");
    expect(q).toContain("nullif(x->>'s', '')");
    // La seccion vacia del portal viaja como "" y es `nullif` quien la vuelve
    // NULL en la base: si el payload la mandara como null, `nullif` sobraria.
    const vacia = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(vacia.tx, 77, [{ ...FILAS[0]!, sectionCode: "" }]);
    const fila = JSON.parse(String(vacia.consultas()[1]!.params[1])) as Array<{ s: string }>;
    expect(fila[0]!.s).toBe("");
  });

  test("deduplica ciclo+curso+vez y se queda con la primera fila", async () => {
    // `uq_student_record_entry (student_id, period_code, course_code, attempt)`
    // responderia 23505 y tumbaria la transaccion ENTERA de la importacion.
    const repetida: RecordRow = { ...FILAS[0]!, courseName: "FILA REPETIDA" };
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, [...FILAS, repetida]);
    const payload = JSON.parse(String(consultas()[1]!.params[1])) as Array<{ c: string; n: string }>;
    expect(payload).toHaveLength(6);
    expect(payload[0]!.n).toBe("MATEMÁTICA DE PRUEBA");
    expect(payload.some((x) => x.n === "FILA REPETIDA")).toBe(false);
  });

  test("una fila descartada por el dedupe va al log del servidor", async () => {
    // Arreglo 4 de la revision final (minor): el dedupe no debe ser mudo. Con
    // dos filas de la misma clave, la que se descarta se cuenta y se avisa.
    const repetida: RecordRow = { ...FILAS[0]!, courseName: "FILA REPETIDA" };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { tx } = fakeTx([{ id: 1 }]);
      await repo.replaceRecordEntries(tx, 77, [...FILAS, repetida]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe(
        "[portal-sync] replaceRecordEntries descartó filas duplicadas del récord (mismo ciclo+curso+vez):",
      );
      expect(warn.mock.calls[0]?.[1]).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("sin duplicados no se registra nada en el log", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { tx } = fakeTx([{ id: 1 }]);
      await repo.replaceRecordEntries(tx, 77, FILAS);
      expect(warn).toHaveBeenCalledTimes(0);
    } finally {
      warn.mockRestore();
    }
  });

  test("sin filas borra igual y no intenta insertar nada", async () => {
    // El record confiable siempre trae filas (RS-BE-21 condicion 3), pero el
    // service llama igual con [] cuando `rec` no es ok: la copia vieja no
    // puede sobrevivir a una importacion aceptada.
    const { tx, consultas, llamadas } = fakeTx([]);
    expect(await repo.replaceRecordEntries(tx, 77, [])).toBe(0);
    expect(llamadas()).toBe(1);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_record_entry");
  });

  test("devuelve lo que la base dice haber escrito, no lo que se intento", async () => {
    // Se mandan 6 filas y la base devuelve 4 `returning id`: el metodo tiene
    // que contar las de la base, no `rows.length` ni las deduplicadas.
    const { tx } = fakeTx([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    expect(await repo.replaceRecordEntries(tx, 77, FILAS)).toBe(4);
  });
});

describe("upsertAcademicSnapshot", () => {
  // Regresion de produccion (2026-09-20): la foto se enviaba con el `Date` de
  // JavaScript como parametro y postgres.js lo rechaza al preparar la sentencia
  // ("The string argument must be ... Received an instance of Date"), asi que la
  // importacion entera respondia 500. El resto del repo escribe fechas como
  // `${fecha.toISOString()}::timestamptz` (ver upsertRepresentativeClaims).
  // La prueba mira los PARAMETROS, no solo el texto del SQL: el texto estaba bien.
  test("ningun parametro es un Date: las fechas viajan como texto ISO con cast", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL, FECHA);
    const { sql: texto, params } = consultas()[0]!;
    expect(params.some((p) => p instanceof Date)).toBe(false);
    expect(params).toContain(FECHA.toISOString());
    expect(norm(texto)).toContain("::timestamptz");
  });

  test("escribe la foto en UNA sentencia con ON CONFLICT sobre el alumno", async () => {
    const { tx, consultas, llamadas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL, FECHA);
    expect(llamadas()).toBe(1);
    // Arreglo 6 de la revision final (minor): un typo en el nombre de la tabla
    // hoy tumbaria la importacion entera en produccion (23P01/42P01) sin que
    // ninguna prueba lo notara, porque nada verificaba el nombre en el SQL.
    expect(norm(consultas()[0]!.sql)).toContain("insert into student_academic_snapshot");
    expect(norm(consultas()[0]!.sql)).toContain("on conflict (student_id) do update set");
  });

  test("el do update pisa TODAS las columnas, incluida synced_at", async () => {
    // Una columna olvidada dejaria mezclada la foto de dos importaciones y
    // `syncedAt` mentiria sobre la copia visible (RS-BE-25).
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL, FECHA);
    const q = norm(consultas()[0]!.sql);
    for (const columna of [
      "ppa", "relative_position", "convalidated_courses", "convalidated_credits",
      "approved_courses", "approved_credits", "credits_accumulated", "credits_required", "synced_at",
    ]) {
      expect(q).toContain(`${columna} = excluded.${columna}`);
    }
  });

  test("los valores viajan como parametros, en el orden de las columnas", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL, FECHA);
    expect(consultas()[0]!.params).toEqual([77, 14.25, "TERCIO SUPERIOR", 2, 6, 30, 100, 106, 210, FECHA.toISOString()]);
  });

  test("un campo que no se pudo leer entra como null, nunca como 0", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL_VACIO, FECHA);
    const { params } = consultas()[0]!;
    expect(params).toEqual([77, null, null, null, null, null, null, null, null, FECHA.toISOString()]);
    expect(params).not.toContain(0);
  });

  test("un campo undefined no se evapora del SQL", async () => {
    // La plantilla `sql` de Drizzle rinde un chunk `undefined` como CADENA
    // VACIA (sql.js, buildQueryFromSourceParams: `if (chunk === void 0) return
    // { sql: "", params: [] }`), no como parametro: el `values` quedaria con 9
    // elementos y el resto correria una columna. Por eso cada valor nulable va
    // con `?? null`.
    const roto = { ...GENERAL, relativePosition: undefined } as unknown as AcademicGeneral;
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, roto, FECHA);
    const { params } = consultas()[0]!;
    expect(params).toHaveLength(10);
    expect(params[2]).toBeNull();
  });
});

describe("replacePeriodSummaries", () => {
  test("reemplaza entero el resumen del alumno: borra y despues inserta", async () => {
    const { tx, consultas, llamadas } = fakeTx([{ id: 9 }]);
    expect(await repo.replacePeriodSummaries(tx, 77, [PERIODO])).toBe(1);
    expect(llamadas()).toBe(2);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_period_summary where student_id = $1");
    expect(consultas()[0]!.params).toEqual([77]);
    expect(norm(consultas()[1]!.sql)).toContain("insert into student_period_summary");
  });

  test("el bloque viaja en UN solo parametro JSON con sus doce campos", async () => {
    const { tx, consultas } = fakeTx([{ id: 9 }]);
    await repo.replacePeriodSummaries(tx, 77, [PERIODO]);
    const { params } = consultas()[1]!;
    expect(params).toHaveLength(2);
    expect(params[0]).toBe(77);
    expect(JSON.parse(String(params[1]))).toEqual([{
      pc: "2026-1", av: 13.25, rp: "MEDIO SUPERIOR", lv: 4,
      cc: 1, ccr: 3, ec: 7, ecr: 23, ac: 5, acr: 16, fc: 2, fcr: 7,
    }]);
  });

  test("castea el promedio y el nivel al tipo de su columna", async () => {
    const { tx, consultas } = fakeTx([{ id: 9 }]);
    await repo.replacePeriodSummaries(tx, 77, [PERIODO]);
    const q = norm(consultas()[1]!.sql);
    expect(q).toContain("(x->>'av')::numeric");
    expect(q).toContain("(x->>'lv')::smallint");
    expect(q).toContain("(x->>'cc')::int");
  });

  test("un campo no leido entra como null, nunca como 0", async () => {
    const vacio: AcademicPeriodBlock = {
      periodCode: "2026-1", average: null, relativePosition: null, level: null,
      convalidated: { courses: null, credits: null }, enrolled: { courses: null, credits: null },
      approved: { courses: null, credits: null }, failed: { courses: null, credits: null },
    };
    const { tx, consultas } = fakeTx([{ id: 9 }]);
    await repo.replacePeriodSummaries(tx, 77, [vacio]);
    expect(JSON.parse(String(consultas()[1]!.params[1]))).toEqual([{
      pc: "2026-1", av: null, rp: null, lv: null,
      cc: null, ccr: null, ec: null, ecr: null, ac: null, acr: null, fc: null, fcr: null,
    }]);
  });

  test("sin bloque por periodo borra igual y no inserta", async () => {
    // El layout puede no traer el bloque (RS-BE-24): entonces el resumen del
    // alumno queda vacio, no con el del ciclo anterior.
    const { tx, consultas, llamadas } = fakeTx([]);
    expect(await repo.replacePeriodSummaries(tx, 77, [])).toBe(0);
    expect(llamadas()).toBe(1);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_period_summary");
  });
});

// ── Nivel service: qué reciben exactamente los métodos de la Tarea 5 ──────────
// Fixtures INVENTADOS de HU34 (alumno sintético 20230001). Los de HU31 traen
// datos reales y no se usan acá.
const recordHU34 = await Bun.file("test/HU34_jeff/fixtures/record.html").text();
const layoutHU34Base = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();
const matriculaHU34 = await Bun.file("test/HU34_jeff/fixtures/matricula.html").text();

// El rótulo del ciclo vigente no está en el fixture de layout (es de la Tarea 3):
// sin él `parseCicloActivo` aborta con 502.
const layoutHU34 = layoutHU34Base.replace(
  "</body>", '<span class="PortalChannelText">CICLO: 2026-2</span></body>',
);
const cookiesHU34 = { JSESSIONID: "a", LtpaToken2: "b" };

/** Las seis filas del fixture, en el orden del documento. */
const RECORD_ESPERADO: FilaRecord[] = [
  {
    periodCode: "2023-1", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA",
    attempt: 1, credits: 4, grade: 8, sectionCode: "101", gradeRaw: "08", observation: null,
  },
  {
    periodCode: "2023-1", courseCode: "4901", courseName: "LENGUAJE DE PRUEBA",
    attempt: 1, credits: 3, grade: 14, sectionCode: "102", gradeRaw: "14", observation: null,
  },
  {
    periodCode: "2023-2", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA",
    attempt: 2, credits: 4, grade: 12, sectionCode: "201", gradeRaw: "12", observation: null,
  },
  {
    periodCode: "2023-2", courseCode: "659002", courseName: "TALLER DE PRUEBA",
    attempt: 1, credits: 1.5, grade: 17, sectionCode: "917", gradeRaw: "17",
    observation: "OBSERVACIÓN DE PRUEBA",
  },
  {
    periodCode: "2026-2", courseCode: "659003", courseName: "CURSO EN CURSO UNO",
    attempt: 1, credits: 3, grade: null, sectionCode: "301", gradeRaw: null, observation: null,
  },
  {
    periodCode: "2026-2", courseCode: "659004", courseName: "CURSO EN CURSO DOS",
    attempt: 1, credits: 4, grade: null, sectionCode: "1302", gradeRaw: null, observation: null,
  },
];

const GENERAL_ESPERADO: GeneralAcademico = {
  ppa: 14.25,
  relativePosition: "TERCIO SUPERIOR",
  convalidated: { courses: 2, credits: 6 },
  approved: { courses: 30, credits: 100 },
  creditsAccumulated: 106,
  creditsRequired: 210,
};

const PERIODO_ESPERADO: BloquePeriodo = {
  periodCode: "2026-1",
  average: 13.25,
  relativePosition: "MEDIO SUPERIOR",
  level: 4,
  convalidated: { courses: 1, credits: 3 },
  enrolled: { courses: 7, credits: 23 },
  approved: { courses: 5, credits: 16 },
  failed: { courses: 2, credits: 7 },
};

type EscrituraSvc =
  | { metodo: "lockAcademicRecord"; studentId: number }
  | { metodo: "replaceRecordEntries"; studentId: number; rows: FilaRecord[] }
  | { metodo: "upsertAcademicSnapshot"; studentId: number; general: GeneralAcademico; syncedAt: Date }
  | { metodo: "replacePeriodSummaries"; studentId: number; periods: BloquePeriodo[] };

/** La escritura del método pedido, ya estrechada, o falla el test nombrándolo. */
function escrituraSvc<T extends EscrituraSvc["metodo"]>(
  todas: EscrituraSvc[], metodo: T,
): Extract<EscrituraSvc, { metodo: T }> {
  const hallada = todas.find((e) => e.metodo === metodo);
  if (!hallada) throw new Error(`no se llamó a ${metodo}`);
  return hallada as Extract<EscrituraSvc, { metodo: T }>;
}

/** Mismo armado que test/HU34_jeff/consent-gate.test.ts; acá solo interesan los
 *  argumentos que reciben los métodos nuevos, no el orden. */
const armarServicioHU34 = (opts: { layout?: string } = {}) => {
  const escrituras: EscrituraSvc[] = [];

  const client = {
    fetchPage: async () => opts.layout ?? layoutHU34,
    fetchAll: async () => ({ matricula: matriculaHU34, record: recordHU34 }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  } as unknown as ClientePortal;

  const repo = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => "20230001",
    findStudent: async () => ({
      id: 7, userId: 3, careerId: 1, curriculumId: 1,
      currentLevel: null, careerName: "INGENIERÍA INDUSTRIAL",
    }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => ({
      id: 2, code: "2026-2", created: false, datesDefaulted: false,
      startDate: "2026-08-24", endDate: "2026-12-14",
    }),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      new Map(codes.map((c, i) => [c, 60 + i])),
    findEquivalentCurriculumCourseIds: async () => new Map<string, number>(),
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: unknown[]) => items.length,
    deleteImpedimentAlert: async () => 0,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    lockAcademicRecord: async (_tx: unknown, studentId: number) => {
      escrituras.push({ metodo: "lockAcademicRecord", studentId });
    },
    replaceRecordEntries: async (_tx: unknown, studentId: number, rows: FilaRecord[]) => {
      escrituras.push({ metodo: "replaceRecordEntries", studentId, rows });
      return rows.length;
    },
    upsertAcademicSnapshot: async (
      _tx: unknown, studentId: number, general: GeneralAcademico, syncedAt: Date,
    ) => {
      escrituras.push({ metodo: "upsertAcademicSnapshot", studentId, general, syncedAt });
    },
    replacePeriodSummaries: async (
      _tx: unknown, studentId: number, periods: BloquePeriodo[],
    ) => {
      escrituras.push({ metodo: "replacePeriodSummaries", studentId, periods });
      return periods.length;
    },
    deleteUnbackedElectives: async () => 0,
  } as unknown as RepositorioPortalSync;

  return { service: new ServicioPortalSync(repo, client), escrituras };
};

describe("la importacion con consentimiento guarda la copia del record (RS-BE-22)", () => {
  test("replaceRecordEntries recibe las seis filas del fixture, sin redondear los creditos", async () => {
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    const e = escrituraSvc(a.escrituras, "replaceRecordEntries");
    expect(e.rows).toEqual(RECORD_ESPERADO);
    expect(e.rows.map((f) => f.credits)).toContain(1.5);
    expect(e.studentId).toBe(7);
  });

  test("las filas en curso van con grade y gradeRaw en null, nunca en cadena vacia", async () => {
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    const enCurso = escrituraSvc(a.escrituras, "replaceRecordEntries")
      .rows.filter((f) => f.periodCode === "2026-2");
    expect(enCurso).toHaveLength(2);
    expect(enCurso.map((f) => f.grade)).toEqual([null, null]);
    expect(enCurso.map((f) => f.gradeRaw)).toEqual([null, null]);
  });
});

describe("la importacion con consentimiento guarda la foto y el resumen (RS-BE-25)", () => {
  test("upsertAcademicSnapshot recibe la informacion general del layout y la fecha de la importacion", async () => {
    const antes = Date.now();
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    const e = escrituraSvc(a.escrituras, "upsertAcademicSnapshot");
    expect(e.general).toEqual(GENERAL_ESPERADO);
    expect(e.syncedAt).toBeInstanceOf(Date);
    expect(e.syncedAt.getTime()).toBeGreaterThanOrEqual(antes);
    expect(e.syncedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("replacePeriodSummaries recibe el unico bloque por periodo del layout", async () => {
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    expect(escrituraSvc(a.escrituras, "replacePeriodSummaries").periods).toEqual([PERIODO_ESPERADO]);
  });

  test("un layout sin bloque por periodo deja el resumen vacio, pero la foto si se escribe", async () => {
    const sinPeriodo = layoutHU34.replace(
      "- Informaci&oacute;n por Per&iacute;odo", "- Otra secci&oacute;n",
    );
    const a = armarServicioHU34({ layout: sinPeriodo });
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    expect(escrituraSvc(a.escrituras, "replacePeriodSummaries").periods).toEqual([]);
    // La copia del récord se guarda igual: no depende del layout.
    expect(escrituraSvc(a.escrituras, "replaceRecordEntries").rows).toHaveLength(6);
    // Arreglo 3 (RS-BE-25): un bloque "por período" ausente es normal (alumno
    // de primer ciclo) y NO bloquea la foto — solo "general" ilegible lo hace.
    expect(escrituraSvc(a.escrituras, "upsertAcademicSnapshot").general).toEqual(GENERAL_ESPERADO);
  });

  // Arreglo 3 de la revisión final (decisión del dueño, RS-BE-25): si el
  // rótulo de "Información General" cambia y el bloque queda ilegible, ya NO
  // se escribe una foto vacía con fecha de hoy — se conserva la anterior tal
  // cual, con su fecha, y el motivo queda en el log. El récord (tabla
  // separada) sigue escribiéndose igual: es una página distinta del portal.
  test("un bloque general ilegible no pisa la foto ni el resumen: se conserva lo anterior con su fecha", async () => {
    const generalRota = layoutHU34.replace(
      'size="1">Cr&eacute;ditos Acumulados</font>',
      'size="1">Cr&eacute;ditos Totales</font>',
    );
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicioHU34({ layout: generalRota });
      await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
      expect(a.escrituras.some((e) => e.metodo === "upsertAcademicSnapshot")).toBe(false);
      expect(a.escrituras.some((e) => e.metodo === "replacePeriodSummaries")).toBe(false);
      // El récord y el layout son páginas distintas: la copia SÍ se escribe.
      expect(escrituraSvc(a.escrituras, "replaceRecordEntries").rows).toHaveLength(6);
      expect(warn.mock.calls.some((c) =>
        String(c[0]).startsWith("[portal-sync]") && String(c[0]).includes("información general ilegible"),
      )).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
