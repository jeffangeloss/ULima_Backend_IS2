import { PortalLoginGuard } from "../../src/modules/portal-sync/portal-login-guard.js";
import { PortalRefreshService } from "../../src/modules/portal-sync/refresh/refresh.service.js";
import type { EvaluacionSilabo } from "../../src/modules/portal-sync/portal-sync.types.js";
import type { MatriculaActiva, RefreshInput } from "../../src/modules/portal-sync/refresh/refresh.types.js";
import type { UlimaGradesView } from "../../src/modules/grades/grades.types.js";
import type { HttpError } from "../../src/shared/errors/http-error.js";
import { PORTAL_PATHS, type OpcionesPagina } from "../../src/services/portal.client.js";
import {
  ALUMNO, CICLO, CURSOS, LAYOUT, MENU_ASISTENCIA, MENU_NOTA, asistenciaDe, marco, notaDe,
} from "./recarga.dobles.js";

/**
 * Dobles del servicio de la recarga (HU37). Cliente, repositorio, reloj y
 * registro falsos, con los datos inventados de la spec. `armar` devuelve el
 * servicio y todo lo que las pruebas necesitan mirar.
 */

export const STUDENT_ID = 42;
export const USER_ID = 7;
export const PRESUPUESTO = 60_000;
export const CREDENCIALES = { password: "clave-sintetica", passcode: "123456" };

export const MATRICULAS: MatriculaActiva[] = CURSOS.map((c) => ({
  enrollmentId: c.enrollmentId, sectionId: c.sectionId, courseCode: c.curso, sectionCode: c.seccion, courseName: c.nombre,
}));

/** Sílabo de cada matrícula. Los ids llevan la matrícula adelante (5011 es de la 501),
 *  para ver que ninguna pareja cruza de curso. */
export const silaboDe = (enrollmentId: number): EvaluacionSilabo[] => [
  { assessmentId: enrollmentId * 10 + 1, name: "Examen escrito", typeName: "Examen", week: 3, weight: 15 },
  { assessmentId: enrollmentId * 10 + 2, name: "Trabajo de producción", typeName: "Trabajo", week: 6, weight: 15 },
  { assessmentId: enrollmentId * 10 + 3, name: "Exposición", typeName: "Exposición", week: 11, weight: 20 },
  { assessmentId: enrollmentId * 10 + 4, name: "Examen escrito", typeName: "Examen", week: 12, weight: 20 },
  { assessmentId: enrollmentId * 10 + 5, name: "Proyecto final", typeName: "Proyecto", week: 15, weight: 30 },
];

export const VISTA: UlimaGradesView = { lastReadAt: "2026-09-25T15:42:10.000Z", courses: [] };

const porDefecto = (path: string): string => {
  if (path === PORTAL_PATHS.layout) return LAYOUT;
  if (path === PORTAL_PATHS.cursosAsistencia) return MENU_ASISTENCIA;
  if (path === PORTAL_PATHS.cursosNota) return MENU_NOTA;
  for (const c of CURSOS) {
    if (path === PORTAL_PATHS.asistenciaAlumno(c.aula)) return asistenciaDe(c.aula);
    if (path === PORTAL_PATHS.notaCurso(c.aula)) return notaDe(c.aula);
    if (path === PORTAL_PATHS.tareaAcademica(c.aula)) return marco();
  }
  throw new Error(`ruta inesperada en la prueba: ${path}`);
};

export type Opciones = {
  paginas?: Record<string, string | Error>;
  loginFalla?: HttpError;
  reloj?: { t: number; paso: number };
  contexto?: { period: { id: number; code: string } | null; matriculas: MatriculaActiva[] };
  userCode?: string | null;
  silabos?: Record<number, EvaluacionSilabo[]>;
  asistenciaToca?: boolean;
  notasAvanzan?: boolean;
  log?: (linea: string) => void;
};

export const armar = (o: Opciones = {}) => {
  const reloj = o.reloj ?? { t: 0, paso: 0 };
  const pedidos: Array<{ path: string; t: number; opciones?: OpcionesPagina }> = [];
  const logins: Array<{ usuario: string; password: string; passcode: string; deadline?: number }> = [];
  let cierres = 0;
  const client = {
    login: async (usuario: string, password: string, passcode: string, opciones: { deadline?: number } = {}) => {
      logins.push({ usuario, password, passcode, deadline: opciones.deadline });
      if (o.loginFalla) throw o.loginFalla;
      return { JSESSIONID: "sesion-de-prueba", LtpaToken2: "ltpa-de-prueba" };
    },
    fetchPage: async (path: string, _cookies: unknown, opciones?: OpcionesPagina) => {
      pedidos.push({ path, t: reloj.t, opciones });
      reloj.t += reloj.paso;
      const r = o.paginas?.[path] ?? porDefecto(path);
      if (r instanceof Error) throw r;
      return r;
    },
    logout: async () => {
      cierres++;
    },
  };

  const llamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const anotar = (metodo: string, ...args: unknown[]) => {
    llamadas.push({ metodo, args });
  };
  const repository = {
    findRefreshContext: async (studentId: number) => {
      anotar("findRefreshContext", studentId);
      return o.contexto ?? { period: { id: 2, code: CICLO }, matriculas: MATRICULAS };
    },
    findUserCode: async (userId: number) => {
      anotar("findUserCode", userId);
      return o.userCode === undefined ? ALUMNO : o.userCode;
    },
    findSyllabusCandidates: async (enrollmentId: number) => {
      anotar("findSyllabusCandidates", enrollmentId);
      return o.silabos?.[enrollmentId] ?? silaboDe(enrollmentId);
    },
    runInTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      anotar("runInTransaction");
      return fn({ transaccion: true });
    },
    lockRefresh: async (_tx: unknown, studentId: number) => {
      anotar("lockRefresh", studentId);
    },
    updateAttendanceHours: async (_tx: unknown, enrollmentId: number, horas: unknown, leidaEn: string) => {
      anotar("updateAttendanceHours", enrollmentId, horas, leidaEn);
      return o.asistenciaToca ?? true;
    },
    markGradesRead: async (_tx: unknown, enrollmentId: number, leidaEn: string) => {
      anotar("markGradesRead", enrollmentId, leidaEn);
      return o.notasAvanzan ?? true;
    },
    replacePortalScores: async (_tx: unknown, enrollmentId: number, filas: unknown) => {
      anotar("replacePortalScores", enrollmentId, filas);
    },
  };

  const guard = new PortalLoginGuard(() => reloj.t);
  const vistas: number[] = [];
  const servicio = new PortalRefreshService({
    repository: repository as never,
    client: client as never,
    guard,
    leerVista: async (studentId) => {
      vistas.push(studentId);
      return VISTA;
    },
    budgetMs: PRESUPUESTO,
    now: () => reloj.t,
    log: o.log ?? (() => {}),
  });
  const entrada = (over: Partial<RefreshInput> = {}): RefreshInput => ({
    userId: USER_ID, studentId: STUDENT_ID, credentials: CREDENCIALES, recibidaEn: 0,
    rastro: { portalTocado: false }, ...over,
  });
  const de = (metodo: string) => llamadas.filter((l) => l.metodo === metodo).map((l) => l.args);
  return { servicio, entrada, pedidos, logins, llamadas, de, guard, vistas, reloj, cierres: () => cierres };
};
