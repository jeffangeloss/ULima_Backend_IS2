import { HttpError } from "../../../shared/errors/http-error.js";
import { PORTAL_PATHS, type PortalClient } from "../../../services/portal.client.js";
import type { UlimaGradesView } from "../../grades/grades.types.js";
import { parseCicloActivo } from "../parsers/index.js";
import { refreshInProgress, tooManyRejectedLogins, type PortalLoginGuard } from "../portal-login-guard.js";
import { resolveAttendanceHours } from "../portal-sync.repository.js";
import type { AsistenciaIdentificada, PortalCookies, SyncWarning } from "../portal-sync.types.js";
import { emparejarEvaluaciones, silaboNoCoincide } from "./emparejar.js";
import { leerAsistencia } from "./fase-asistencia.js";
import { leerNotas } from "./fase-notas.js";
import {
  RegistroFases, clavePar, deAula, errorDeFallo, errorSinCursos, falloDe, parDeAula, promedioNoCuadra,
} from "./refresh.logic.js";
import type { PortalRefreshRepository } from "./refresh.repository.js";
import type {
  EscrituraAsistencia, EscrituraNotas, EstadoAsistencia, EstadoNotas, FaseAsistencia, FaseNotas,
  MatriculaActiva, MenuDescargado, Pedir, RefreshInput, RefreshResult,
} from "./refresh.types.js";

/**
 * RS-BE-49 a RS-BE-56 · POST /portal-sync/refresh.
 *
 * Con un solo inicio de sesión en miUlima, lee la asistencia y las notas
 * parciales del alumno autenticado, fuera de la transacción, y guarda todo en
 * una sola transacción al final. Nunca crea período, curso, sección ni
 * matrícula, y nunca toca sílabos, récord, alertas, delegados, `student_score`
 * ni `simulated_grades`.
 */

/** Dependencias de la recarga. `index.ts` pasa las reales y las pruebas, dobles. */
export type RefreshDeps = {
  repository: PortalRefreshRepository;
  client: Pick<PortalClient, "login" | "fetchPage" | "logout">;
  guard: PortalLoginGuard;
  /** RS-BE-56. La vista de GET /grades/me/ulima, leída ya con lo guardado. */
  leerVista: (studentId: number) => Promise<UlimaGradesView>;
  /** RS-BE-50. `config.portal.refreshBudgetMs`, ya acotado por el timeout. */
  budgetMs: number;
  now?: () => number;
  log?: (linea: string) => void;
};

const ORDEN_ASISTENCIA: readonly EstadoAsistencia[] = ["updated", "skipped", "failed", "unavailable", "not_reached"];
const ORDEN_NOTAS: readonly EstadoNotas[] = ["read", "failed", "unavailable", "not_reached"];

const otroCiclo = (): HttpError =>
  new HttpError(409, "La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.", "IMPORT_REQUIRED");

const noMatriculado = (block: "asistencia" | "nota", donde: string): SyncWarning => ({
  code: "NOT_ENROLLED", block, message: `El curso ${donde} de miUlima no está en tu matrícula de ULima++.`,
});

const menuDe = (r: PromiseSettledResult<string>): MenuDescargado =>
  (r.status === "fulfilled" ? { ok: true, html: r.value } : { ok: false, fallo: falloDe(r.reason) });

/** El primer estado de `orden` que aparece entre los de las aulas atribuidas a la matrícula. */
const elegir = <E extends string>(estados: E[] | undefined, orden: readonly E[], sinAula: E): E =>
  orden.find((e) => estados?.includes(e)) ?? sinAula;

type Resumen = {
  avisos: SyncWarning[];
  asistencia: EscrituraAsistencia[];
  notas: EscrituraNotas[];
  estadosAsistencia: Map<number, EstadoAsistencia[]>;
  estadosNotas: Map<number, EstadoNotas[]>;
  contadores: Pick<RefreshResult, "attendance" | "grades">;
  leidas: Date[];
};

export class PortalRefreshService {
  private readonly now: () => number;
  private readonly log: (linea: string) => void;

  constructor(private readonly deps: RefreshDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.log = deps.log ?? ((linea) => console.info(linea));
  }

  async refresh(entrada: RefreshInput): Promise<RefreshResult> {
    const { userId, studentId, rastro } = entrada;
    const { repository, client, guard } = this.deps;
    // RS-BE-50. El presupuesto cuenta desde que el controlador recibe la
    // petición y cubre también el inicio de sesión.
    const deadline = entrada.recibidaEn + this.deps.budgetMs;

    // RS-BE-49. Condiciones previas, antes de tocar el portal y en este orden.
    const contexto = await repository.findRefreshContext(studentId);
    if (!contexto.period || !contexto.matriculas.length) {
      throw new HttpError(409, "Primero carga tus datos del ciclo.", "IMPORT_REQUIRED");
    }
    const ciclo = contexto.period.code;
    const userCode = await repository.findUserCode(userId);
    if (!userCode) throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
    if (!guard.tryStart(studentId, "refresh")) throw refreshInProgress();
    try {
      const espera = guard.rejectedLoginsWait(studentId);
      if (espera !== null) throw tooManyRejectedLogins(espera);

      const registro = new RegistroFases(this.now, this.log);
      // Desde acá la recarga ya envía peticiones al portal, y el limitador solo
      // devuelve el cupo ante un rechazo (RS-BE-50).
      rastro.portalTocado = true;
      const cookies = await this.iniciarSesion(entrada, userCode, deadline, registro);
      try {
        return await this.leerYGuardar(studentId, userCode, ciclo, contexto.matriculas, cookies, deadline, registro);
      } finally {
        // Siempre que exista una sesión, con éxito, con error o sin presupuesto.
        await client.logout(cookies);
      }
    } finally {
      guard.finish(studentId, "refresh");
    }
  }

  /**
   * RS-BE-49. Una sola llamada a `PortalClient.login`, con el plazo de RS-BE-50.
   * El usuario del portal nunca viene del cliente, y la contraseña y el código
   * se usan en esta llamada y se descartan. Un rechazo suma al tope compartido.
   */
  private async iniciarSesion(
    entrada: RefreshInput, userCode: string, deadline: number, registro: RegistroFases,
  ): Promise<PortalCookies> {
    registro.empezar("login");
    try {
      const cookies = await this.deps.client.login(
        userCode, entrada.credentials.password, entrada.credentials.passcode, { deadline },
      );
      registro.anotar("login", "200");
      return cookies;
    } catch (e) {
      registro.anotar("login", e instanceof HttpError ? String(e.statusCode) : "error");
      if (e instanceof HttpError && e.code === "PORTAL_LOGIN_REJECTED") this.deps.guard.recordRejectedLogin(entrada.studentId);
      throw e;
    } finally {
      registro.terminar("login");
    }
  }

  private async leerYGuardar(
    studentId: number, userCode: string, ciclo: string, matriculas: MatriculaActiva[],
    cookies: PortalCookies, deadline: number, registro: RegistroFases,
  ): Promise<RefreshResult> {
    const { client, repository } = this.deps;
    const pedirEn = (fase: string): Pedir => async (path, opciones) => {
      try {
        const html = await client.fetchPage(path, cookies, opciones);
        registro.anotar(fase, "200");
        return html;
      } catch (e) {
        registro.anotar(fase, e instanceof HttpError ? String(e.statusCode) : "error");
        throw e;
      }
    };

    // RS-BE-49. Ronda de apertura, antes de leer ningún curso.
    if (this.now() >= deadline) throw errorDeFallo("PORTAL_TIMEOUT");
    registro.empezar("apertura");
    const apertura = pedirEn("apertura");
    const [layout, menuAsistencia, menuNota] = await Promise.allSettled([
      apertura(PORTAL_PATHS.layout),
      apertura(PORTAL_PATHS.cursosAsistencia),
      apertura(PORTAL_PATHS.cursosNota),
    ]);
    registro.terminar("apertura");
    if (layout.status === "rejected") throw layout.reason;
    const cicloPortal = parseCicloActivo(layout.value);
    if (!cicloPortal.ok) throw errorDeFallo("PORTAL_UNREADABLE");
    // Decisión abierta 19. La página de notas y su marco no traen ciclo.
    if (cicloPortal.data.periodCode !== ciclo) throw otroCiclo();

    // RS-BE-51. La asistencia va primero porque su mapa contrasta el panel Nota.
    registro.empezar("asistencia");
    const asistencia = await leerAsistencia(
      { pedir: pedirEn("asistencia"), now: this.now, deadline }, menuDe(menuAsistencia), userCode, ciclo,
    );
    registro.terminar("asistencia");
    if (asistencia.identityMismatch) {
      throw new HttpError(403, "La cuenta de miUlima no corresponde a tu usuario.", "PORTAL_IDENTITY_MISMATCH");
    }
    if (asistencia.otroCiclo) throw otroCiclo();

    // RS-BE-52 y RS-BE-53.
    registro.empezar("notas");
    const notas = await leerNotas(
      { pedir: pedirEn("notas"), now: this.now, deadline }, menuDe(menuNota), asistencia.identificadas,
    );
    registro.terminar("notas");

    const resumen = await this.resumir(matriculas, asistencia, notas);
    const asistenciaSinPedir = asistencia.aulas.some((x) => x.estado === "not_reached");
    const notasSinPedir = notas.aulas.some((x) => x.estado === "not_reached");
    // RS-BE-56. Sin ningún curso leído, el código sale de los fallos vistos por
    // precedencia, y no se escribe nada.
    if (!resumen.leidas.length) {
      throw errorSinCursos([
        ...asistencia.fallos, ...notas.fallos,
        ...(asistenciaSinPedir || notasSinPedir ? ["PORTAL_TIMEOUT" as const] : []),
      ]);
    }
    if (asistenciaSinPedir || notasSinPedir) {
      resumen.avisos.push({
        code: "REFRESH_BUDGET_EXCEEDED", block: asistenciaSinPedir ? "asistencia" : "nota",
        message: "La lectura de miUlima tardó demasiado y algunos cursos quedaron sin leer.",
      });
    }

    // RS-BE-55. Una sola transacción al final, con el candado primero.
    if (resumen.asistencia.length || resumen.notas.length) {
      registro.empezar("transaccion");
      await repository.runInTransaction(async (tx) => {
        await repository.lockRefresh(tx, studentId);
        for (const e of resumen.asistencia) {
          await repository.updateAttendanceHours(tx, e.enrollmentId, e.horas, e.leidaEn.toISOString());
        }
        for (const e of resumen.notas) {
          // Solo si la hora de las notas avanza se reemplazan las filas.
          if (await repository.markGradesRead(tx, e.enrollmentId, e.leidaEn.toISOString())) {
            await repository.replacePortalScores(tx, e.enrollmentId, e.filas);
          }
        }
      });
      registro.terminar("transaccion");
    }

    const guardadas = [...resumen.asistencia, ...resumen.notas].map((e) => e.leidaEn.getTime());
    const instantes = guardadas.length ? guardadas : resumen.leidas.map((d) => d.getTime());
    return {
      readAt: new Date(Math.max(...instantes)).toISOString(),
      attendance: resumen.contadores.attendance,
      grades: resumen.contadores.grades,
      courses: matriculas.map((m) => ({
        sectionId: m.sectionId,
        courseCode: m.courseCode,
        sectionCode: m.sectionCode,
        attendance: elegir(resumen.estadosAsistencia.get(m.enrollmentId), ORDEN_ASISTENCIA,
          asistenciaSinPedir ? "not_reached" : "missing"),
        grades: elegir(resumen.estadosNotas.get(m.enrollmentId), ORDEN_NOTAS, notasSinPedir ? "not_reached" : "missing"),
      })),
      view: await this.deps.leerVista(studentId),
      warnings: resumen.avisos,
    };
  }

  /**
   * RS-BE-48, RS-BE-54 y RS-BE-56. Atribuye cada aula a su matrícula, arma los
   * avisos al final, en el orden de cada menú, y decide qué se escribe.
   *
   * Los contadores cuentan aulas de cada menú. Un curso leído sin matrícula en
   * ULima++ no se escribe, no suma a ningún contador y lleva su aviso
   * NOT_ENROLLED.
   */
  private async resumir(matriculas: MatriculaActiva[], asistencia: FaseAsistencia, notas: FaseNotas): Promise<Resumen> {
    const porClave = new Map(matriculas.map((m) => [clavePar(m), m]));
    const r: Resumen = {
      avisos: [], asistencia: [], notas: [], estadosAsistencia: new Map(), estadosNotas: new Map(),
      contadores: {
        attendance: { updated: 0, skipped: 0, failed: 0, unavailable: 0 },
        grades: { read: 0, failed: 0, unavailable: 0, withValue: 0 },
      },
      leidas: [],
    };
    const { attendance, grades } = r.contadores;
    const anotar = <E>(mapa: Map<number, E[]>, par: AsistenciaIdentificada | null, estado: E): void => {
      const m = par ? porClave.get(clavePar(par)) : undefined;
      if (m) mapa.set(m.enrollmentId, [...(mapa.get(m.enrollmentId) ?? []), estado]);
    };

    if (asistencia.menu === "unavailable") {
      r.avisos.push({ code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: "No se pudo abrir el panel de asistencia en miUlima." });
    }
    if (asistencia.menu === "unreadable") {
      r.avisos.push({ code: "PARSER_FAILED", block: "asistencia", message: "No se entendió el menú de asistencia de miUlima." });
    }
    for (const x of asistencia.aulas) {
      if (x.estado === "leida") {
        r.leidas.push(x.leidaEn);
        // RS-BE-51, punto 5. La matrícula sale del par que declara la página.
        const par = { courseCode: x.datos.courseCode, sectionCode: x.datos.sectionCode };
        const donde = `${par.courseCode}/${par.sectionCode}`;
        const m = porClave.get(clavePar(par));
        if (!m) {
          r.avisos.push(noMatriculado("asistencia", donde));
          continue;
        }
        const horas = resolveAttendanceHours(x.datos);
        if (!horas.ok) {
          attendance.skipped++;
          anotar(r.estadosAsistencia, par, "skipped");
          r.avisos.push({
            code: "PARSER_FAILED", block: "asistencia", message: `No se escribió la asistencia de ${donde}: ${horas.reason}.`,
          });
          continue;
        }
        // Una fila que luego salta la guarda de lectura más reciente también
        // cuenta como updated, porque ya tiene horas más nuevas (decisión 5).
        attendance.updated++;
        anotar(r.estadosAsistencia, par, "updated");
        r.asistencia.push({ enrollmentId: m.enrollmentId, horas: horas.hours, leidaEn: x.leidaEn });
        continue;
      }
      const par = parDeAula(x.aula, asistencia.identificadas, notas.identificadas);
      if (x.estado === "unavailable") {
        attendance.unavailable++;
        anotar(r.estadosAsistencia, par, "unavailable");
        r.avisos.push({
          code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: `No se pudo traer la asistencia ${deAula(x.aula, par)}.`,
        });
      } else if (x.estado === "failed") {
        attendance.failed++;
        anotar(r.estadosAsistencia, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "asistencia", message: `No se entendió la asistencia ${deAula(x.aula, par)}: ${x.motivo}`,
        });
      } else if (x.estado === "contraste") {
        attendance.failed++;
        anotar(r.estadosAsistencia, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "asistencia",
          message: `La sección del menú no coincide con la de la página de asistencia del aula ${x.aula.aula}.`,
        });
      } else {
        anotar(r.estadosAsistencia, par, "not_reached");
      }
    }

    if (notas.menu === "unavailable") {
      r.avisos.push({ code: "NOTAS_UNAVAILABLE", block: "nota", message: "No se pudo abrir el panel de notas en miUlima." });
    }
    if (notas.menu === "unreadable") {
      r.avisos.push({ code: "PARSER_FAILED", block: "nota", message: "No se entendió el menú de notas de miUlima." });
    }
    for (const x of notas.aulas) {
      if (x.estado === "leida") {
        r.leidas.push(x.leidaEn);
        const donde = `${x.par.courseCode}/${x.par.sectionCode}`;
        const m = porClave.get(clavePar(x.par));
        if (!m) {
          r.avisos.push(noMatriculado("nota", donde));
          continue;
        }
        grades.read++;
        if (x.evaluaciones.some((e) => e.mark === "graded")) grades.withValue++;
        anotar(r.estadosNotas, x.par, "read");
        // RS-BE-54. Las candidatas de cada matrícula se piden por separado y
        // nunca se juntan con las de otro curso.
        const silabo = await this.deps.repository.findSyllabusCandidates(m.enrollmentId);
        const filas = emparejarEvaluaciones(x.evaluaciones, silabo);
        if (silaboNoCoincide(filas, silabo)) {
          r.avisos.push({
            code: "SYLLABUS_MISMATCH", block: "nota",
            message: `El sílabo cargado en ULima++ no coincide con las evaluaciones de la ULima en ${donde}.`,
          });
        }
        // RS-BE-53, punto 7. Sin ninguna cifra en el mensaje, y el curso se guarda igual.
        if (promedioNoCuadra(x.evaluaciones, x.agregados)) {
          r.avisos.push({
            code: "PORTAL_AVERAGE_MISMATCH", block: "nota",
            message: `El promedio que publica la ULima no coincide con sus evaluaciones en ${donde}.`,
          });
        }
        r.notas.push({ enrollmentId: m.enrollmentId, filas, leidaEn: x.leidaEn });
        continue;
      }
      const par = parDeAula(x.aula, notas.identificadas, asistencia.identificadas);
      if (x.estado === "unavailable") {
        grades.unavailable++;
        anotar(r.estadosNotas, par, "unavailable");
        r.avisos.push({ code: "NOTAS_UNAVAILABLE", block: "nota", message: `No se pudieron traer las notas ${deAula(x.aula, par)}.` });
      } else if (x.estado === "failed") {
        grades.failed++;
        anotar(r.estadosNotas, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "nota", message: `No se entendieron las notas ${deAula(x.aula, par)}: ${x.motivo}`,
        });
      } else if (x.estado === "contraste") {
        grades.failed++;
        anotar(r.estadosNotas, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "nota", message: `El curso del aula ${x.aula.aula} no coincide entre los paneles de miUlima.`,
        });
      } else {
        anotar(r.estadosNotas, par, "not_reached");
      }
    }
    return r;
  }
}
