import { describe, expect, test } from "bun:test";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import { ALUMNO, CURSOS, HOJAS, asistenciaDe, marco, notaDe } from "./recarga.dobles.js";
import { CREDENCIALES, MATRICULAS, STUDENT_ID, VISTA, armar } from "./recarga.servicio.js";

/**
 * RS-BE-49 a RS-BE-56 · servicio de la recarga con un cliente, un repositorio
 * y un reloj falsos (recarga.servicio.ts). Datos inventados de la spec.
 */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const caido = () => new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");

describe("RS-BE-49 · condiciones previas, antes de tocar el portal", () => {
  test("sin período activo responde 409 IMPORT_REQUIRED sin iniciar sesión", async () => {
    const a = armar({ contexto: { period: null, matriculas: [] } });
    const entrada = a.entrada();
    await expect(a.servicio.refresh(entrada)).rejects.toMatchObject({
      statusCode: 409, code: "IMPORT_REQUIRED", message: "Primero carga tus datos del ciclo.",
    });
    expect(a.logins).toHaveLength(0);
    expect(entrada.rastro.portalTocado).toBe(false);
  });

  test("sin matrícula activa en el período, lo mismo", async () => {
    const a = armar({ contexto: { period: { id: 2, code: "2026-2" }, matriculas: [] } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ code: "IMPORT_REQUIRED" });
    expect(a.logins).toHaveLength(0);
  });

  test("sin app_user.code responde 422 sin iniciar sesión", async () => {
    const a = armar({ userCode: null });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 422, code: "PORTAL_IDENTITY_UNVERIFIABLE",
    });
    expect(a.logins).toHaveLength(0);
  });

  test("otra recarga del mismo alumno en curso responde 409 PORTAL_REFRESH_IN_PROGRESS", async () => {
    const a = armar();
    a.guard.tryStart(STUDENT_ID, "refresh");
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 409, code: "PORTAL_REFRESH_IN_PROGRESS",
      message: "Ya hay una lectura de miUlima en curso. Espera a que termine.",
    });
    expect(a.logins).toHaveLength(0);
  });

  test("una importación con credentials en curso también", async () => {
    const a = armar();
    a.guard.tryStart(STUDENT_ID, "import");
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ code: "PORTAL_REFRESH_IN_PROGRESS" });
  });

  test("tres rechazos en 15 minutos dan 429 rejected_logins sin iniciar sesión y sueltan la guarda", async () => {
    const a = armar();
    for (let i = 0; i < 3; i++) a.guard.recordRejectedLogin(STUDENT_ID);
    const entrada = a.entrada();
    await expect(a.servicio.refresh(entrada)).rejects.toMatchObject({
      statusCode: 429, code: "RATE_LIMITED", details: { retryAfterMinutes: 15, kind: "rejected_logins" },
    });
    expect(a.logins).toHaveLength(0);
    expect(entrada.rastro.portalTocado).toBe(false);
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("el orden es matrícula, código, guarda y tope", async () => {
    const a = armar({ contexto: { period: null, matriculas: [] }, userCode: null });
    a.guard.tryStart(STUDENT_ID, "refresh");
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ code: "IMPORT_REQUIRED" });
    const b = armar({ userCode: null });
    b.guard.tryStart(STUDENT_ID, "refresh");
    await expect(b.servicio.refresh(b.entrada())).rejects.toMatchObject({ code: "PORTAL_IDENTITY_UNVERIFIABLE" });
  });
});

describe("RS-BE-49 · inicio de sesión y ronda de apertura", () => {
  test("inicia sesión una sola vez, con app_user.code y el plazo del presupuesto", async () => {
    const a = armar();
    await a.servicio.refresh(a.entrada({ recibidaEn: 1_000 }));
    expect(a.logins).toEqual([{
      usuario: ALUMNO, password: CREDENCIALES.password, passcode: CREDENCIALES.passcode, deadline: 61_000,
    }]);
  });

  test("marca el rastro antes de iniciar sesión", async () => {
    const a = armar();
    const entrada = a.entrada();
    await a.servicio.refresh(entrada);
    expect(entrada.rastro.portalTocado).toBe(true);
  });

  test("un rechazo suma al tope, no pide ninguna página y suelta la guarda", async () => {
    const a = armar({ loginFalla: new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED") });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 409, code: "PORTAL_LOGIN_REJECTED" });
    expect(a.pedidos).toHaveLength(0);
    expect(a.cierres()).toBe(0);
    a.guard.recordRejectedLogin(STUDENT_ID);
    a.guard.recordRejectedLogin(STUDENT_ID);
    expect(a.guard.rejectedLoginsWait(STUDENT_ID)).not.toBeNull();
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("layout.jsp con otro ciclo responde 409 sin pedir ningún curso, sin escribir y cerrando la sesión", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.layout]: "<html><body>CICLO: 2026-1</body></html>" } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 409, code: "IMPORT_REQUIRED", message: "La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.",
    });
    expect(a.pedidos.map((p) => p.path).sort()).toEqual(
      [PORTAL_PATHS.cursosAsistencia, PORTAL_PATHS.cursosNota, PORTAL_PATHS.layout].sort(),
    );
    expect(a.de("runInTransaction")).toHaveLength(0);
    expect(a.cierres()).toBe(1);
  });

  test("una página de asistencia de otro ciclo responde el mismo 409, sin notas y sin escribir", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900103")]: asistenciaDe("900103", { prm_sNuCicl: "1" }) } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 409, code: "IMPORT_REQUIRED" });
    expect(a.pedidos.some((p) => p.path === PORTAL_PATHS.notaCurso("900101"))).toBe(false);
    expect(a.de("runInTransaction")).toHaveLength(0);
  });

  test("layout.jsp sin ciclo responde 502 PORTAL_UNREADABLE", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.layout]: "<html><body>Bienvenido</body></html>" } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 502, code: "PORTAL_UNREADABLE" });
  });

  test("si la petición de layout.jsp falla, responde el error de esa petición", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.layout]: new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT") } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
    expect(a.cierres()).toBe(1);
  });

  test("una página con otro código de alumno aborta con 403 y no escribe nada", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900102")]: asistenciaDe("900102", { prm_sCoUserAlum: "20230002" }) } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 403, code: "PORTAL_IDENTITY_MISMATCH" });
    expect(a.pedidos.some((p) => p.path === PORTAL_PATHS.notaCurso("900101"))).toBe(false);
    expect(a.de("runInTransaction")).toHaveLength(0);
    expect(a.cierres()).toBe(1);
  });

  test("una página sin código de alumno es un fallo común de ese curso", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900102")]: asistenciaDe("900102", { prm_sCoUserAlum: "" }) } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[1]).toMatchObject({ courseCode: "690418", attendance: "failed", grades: "read" });
    expect(res.warnings).toContainEqual({
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se entendió la asistencia de 690418/812: la página no trae el código de alumno",
    });
  });
});

describe("RS-BE-51, RS-BE-54 y RS-BE-55 · camino completo", () => {
  test("lee las cinco matrículas, escribe en una transacción con el candado primero y devuelve la vista", async () => {
    const a = armar();
    const res = await a.servicio.refresh(a.entrada());
    expect(res.attendance).toEqual({ updated: 5, skipped: 0, failed: 0, unavailable: 0 });
    expect(res.grades).toEqual({ read: 5, failed: 0, unavailable: 0, withValue: 0 });
    expect(res.courses).toEqual(MATRICULAS.map((m) => ({
      sectionId: m.sectionId, courseCode: m.courseCode, sectionCode: m.sectionCode, attendance: "updated", grades: "read",
    })));
    expect(res.warnings).toEqual([]);
    expect(res.view).toBe(VISTA);
    expect(a.vistas).toEqual([STUDENT_ID]);
    expect(res.readAt).toMatch(ISO);
    const orden = a.llamadas.map((l) => l.metodo);
    expect(orden[orden.indexOf("runInTransaction") + 1]).toBe("lockRefresh");
    expect(a.de("updateAttendanceHours").map(([id, horas, leida]) => [id, horas, ISO.test(leida as string)])).toEqual(
      CURSOS.map((c) => [c.enrollmentId, { total: "48.00", attended: "4.00", absent: "2.00" }, true]),
    );
    expect(a.de("markGradesRead").map(([id]) => id)).toEqual(CURSOS.map((c) => c.enrollmentId));
    expect(a.cierres()).toBe(1);
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("cada matrícula pide sus candidatas por separado y ninguna pareja cruza de curso", async () => {
    const a = armar();
    await a.servicio.refresh(a.entrada());
    expect(a.de("findSyllabusCandidates").map(([id]) => id)).toEqual(CURSOS.map((c) => c.enrollmentId));
    const reemplazos = a.de("replacePortalScores") as Array<[number, Array<{ key: string; assessmentId: number | null; match: string }>]>;
    expect(reemplazos).toHaveLength(5);
    for (const [id, filas] of reemplazos) {
      expect(filas.map((f) => [f.key, f.assessmentId, f.match])).toEqual([
        ["07.13", id * 10 + 1, "exact"], ["07.14", id * 10 + 2, "exact"], ["07.15", id * 10 + 3, "week_shift"],
        ["07.16", id * 10 + 4, "exact"], ["07.17", id * 10 + 5, "exact"],
      ]);
    }
  });

  test("una fila que salta la guarda de lectura más reciente cuenta como updated", async () => {
    const a = armar({ asistenciaToca: false });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.attendance.updated).toBe(5);
    expect(res.courses.every((c) => c.attendance === "updated")).toBe(true);
  });

  test("unos totales que no cuadran dejan la matrícula skipped y no llegan al UPDATE", async () => {
    const sinHoras = asistenciaDe("900101").replace('<strong class="textos">48</strong>', '<strong class="textos">0</strong>');
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900101")]: sinHoras } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.attendance).toEqual({ updated: 4, skipped: 1, failed: 0, unavailable: 0 });
    expect(res.courses[0]!.attendance).toBe("skipped");
    expect(a.de("updateAttendanceHours").map(([id]) => id)).not.toContain(501);
    expect(res.warnings).toContainEqual({
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se escribió la asistencia de 690417/812: el portal no reporta horas programadas.",
    });
  });

  test("una lectura de notas más vieja no reemplaza las filas y el curso cuenta como read", async () => {
    const a = armar({ notasAvanzan: false });
    const res = await a.servicio.refresh(a.entrada());
    expect(a.de("replacePortalScores")).toHaveLength(0);
    expect(res.grades.read).toBe(5);
  });

  test("un curso de miUlima sin matrícula en ULima++ no se escribe y avisa NOT_ENROLLED", async () => {
    const a = armar({ contexto: { period: { id: 2, code: "2026-2" }, matriculas: MATRICULAS.slice(0, 4) } });
    const res = await a.servicio.refresh(a.entrada());
    const mensaje = "El curso 690421/903 de miUlima no está en tu matrícula de ULima++.";
    expect(res.warnings).toContainEqual({ code: "NOT_ENROLLED", block: "asistencia", message: mensaje });
    expect(res.warnings).toContainEqual({ code: "NOT_ENROLLED", block: "nota", message: mensaje });
    expect(a.de("updateAttendanceHours").map(([id]) => id)).not.toContain(505);
    expect(res.courses).toHaveLength(4);
    expect(res.attendance.updated).toBe(4);
  });

  test("un sílabo vacío avisa SYLLABUS_MISMATCH y el curso se guarda igual, sin parejas", async () => {
    const a = armar({ silabos: { 501: [] } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.warnings).toContainEqual({
      code: "SYLLABUS_MISMATCH", block: "nota",
      message: "El sílabo cargado en ULima++ no coincide con las evaluaciones de la ULima en 690417/812.",
    });
    const reemplazos = a.de("replacePortalScores") as Array<[number, Array<{ match: string }>]>;
    const [, filas] = reemplazos.find(([id]) => id === 501)!;
    expect(filas.every((f) => f.match === "none")).toBe(true);
  });

  test("un promedio de la ULima que no cuadra con las notas avisa sin ninguna cifra y guarda igual", async () => {
    const a = armar({ paginas: {
      [PORTAL_PATHS.notaCurso("900101")]: notaDe("900101", { notaPROM: "18" }),
      [PORTAL_PATHS.tareaAcademica("900101")]: marco(HOJAS.map((h) => ({ ...h, nota: "10" }))),
    } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.warnings).toContainEqual({
      code: "PORTAL_AVERAGE_MISMATCH", block: "nota",
      message: "El promedio que publica la ULima no coincide con sus evaluaciones en 690417/812.",
    });
    expect(res.grades.withValue).toBe(1);
    expect(a.de("replacePortalScores").map(([id]) => id)).toContain(501);
  });
});

describe("RS-BE-48 y RS-BE-56 · atribución y respuesta", () => {
  test("la asistencia de un aula que no se descarga se atribuye por su página de notas", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900101")]: caido() } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[0]).toMatchObject({ courseCode: "690417", attendance: "unavailable", grades: "read" });
    expect(res.warnings).toContainEqual({
      code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: "No se pudo traer la asistencia de 690417/812.",
    });
    expect(res.attendance).toEqual({ updated: 4, skipped: 0, failed: 0, unavailable: 1 });
  });

  test("una página de asistencia que no se entiende queda failed con el curso de su página de notas", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900101")]: "<html><body>otra cosa</body></html>" } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[0]!.attendance).toBe("failed");
    expect(res.warnings).toContainEqual({
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se entendió la asistencia de 690417/812: la respuesta no es una página de asistencia",
    });
  });

  test("sin ninguna página que la identifique, los avisos nombran el aula y la matrícula queda missing", async () => {
    const a = armar({ paginas: {
      [PORTAL_PATHS.asistenciaAlumno("900101")]: caido(),
      [PORTAL_PATHS.notaCurso("900101")]: caido(),
    } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[0]).toMatchObject({ courseCode: "690417", attendance: "missing", grades: "missing" });
    expect(res.warnings).toContainEqual({
      code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: "No se pudo traer la asistencia del aula 900101.",
    });
    expect(res.warnings).toContainEqual({
      code: "NOTAS_UNAVAILABLE", block: "nota", message: "No se pudieron traer las notas del aula 900101.",
    });
    expect(res.warnings.some((w) => w.message.includes("null"))).toBe(false);
  });

  test("readAt es el instante más reciente entre las lecturas que se guardan", async () => {
    const a = armar({ reloj: { t: 1_000, paso: 1 } });
    const res = await a.servicio.refresh(a.entrada({ recibidaEn: 1_000 }));
    expect(res.readAt).toBe(new Date(a.reloj.t).toISOString());
  });
});

describe("RS-BE-56 · sin ningún curso leído", () => {
  const todas = (fallo: (aula: string) => Array<[string, HttpError]>) =>
    Object.fromEntries(CURSOS.flatMap((c) => fallo(c.aula)));
  const sesion = () => new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");
  const tiempo = () => new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT");

  test("PORTAL_SESSION_INVALID gana a los demás, sin escribir y cerrando la sesión", async () => {
    const a = armar({ paginas: todas((aula) => [
      [PORTAL_PATHS.asistenciaAlumno(aula), sesion()], [PORTAL_PATHS.notaCurso(aula), tiempo()],
    ]) });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 409, code: "PORTAL_SESSION_INVALID" });
    expect(a.de("runInTransaction")).toHaveLength(0);
    expect(a.cierres()).toBe(1);
  });

  test("PORTAL_TIMEOUT gana a PORTAL_UNAVAILABLE", async () => {
    const a = armar({ paginas: todas((aula) => [
      [PORTAL_PATHS.asistenciaAlumno(aula), tiempo()], [PORTAL_PATHS.notaCurso(aula), caido()],
    ]) });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
  });

  test("solo fallos de red dan 502 PORTAL_UNAVAILABLE", async () => {
    const a = armar({ paginas: todas((aula) => [
      [PORTAL_PATHS.asistenciaAlumno(aula), caido()], [PORTAL_PATHS.notaCurso(aula), caido()],
    ]) });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 502, code: "PORTAL_UNAVAILABLE" });
  });

  test("los dos menús en un formato desconocido dan 502 PORTAL_UNREADABLE con su mensaje", async () => {
    const a = armar({ paginas: {
      [PORTAL_PATHS.cursosAsistencia]: "<html><body>otra cosa</body></html>",
      [PORTAL_PATHS.cursosNota]: "<html><body>otra cosa</body></html>",
    } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 502, code: "PORTAL_UNREADABLE", message: "miUlima responde con páginas que ULima++ no sabe leer.",
    });
  });
});
