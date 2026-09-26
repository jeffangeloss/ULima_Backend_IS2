import type { OpcionesPagina } from "../../../services/portal.client.js";
import type { UlimaGradesView } from "../../grades/grades.types.js";
import type { HorasAsistencia } from "../portal-sync.repository.js";
import type {
  AgregadoUlima, AsistenciaCurso, AsistenciaIdentificada, AulaMenu, EvaluacionEmparejada, EvaluacionUlima,
  SyncWarning,
} from "../portal-sync.types.js";

/**
 * Tipos de la recarga de notas parciales y asistencia (recarga-portal.spec.md).
 */

/** RS-BE-49. Una matrícula activa del alumno en el período activo. La recarga
 *  solo escribe sobre estas, resueltas en el servidor. */
export type MatriculaActiva = {
  enrollmentId: number;
  sectionId: number;
  courseCode: string;
  sectionCode: string;
  courseName: string;
};

/** RS-BE-49, condición previa 1. Sin período activo, `period` es null. */
export type ContextoRecarga = { period: { id: number; code: string } | null; matriculas: MatriculaActiva[] };

/** RS-BE-56. Fallo de una petición o de una lectura, para la precedencia sin cursos leídos. */
export type FalloPortal = "PORTAL_SESSION_INVALID" | "PORTAL_TIMEOUT" | "PORTAL_UNAVAILABLE" | "PORTAL_UNREADABLE";

/** Pide una página del Aula Virtual con la sesión de la recarga. */
export type Pedir = (path: string, opciones?: OpcionesPagina) => Promise<string>;

/** Lo que necesita una fase. `deadline` es el fin del presupuesto de RS-BE-50, en el reloj `now`. */
export type ContextoFase = { pedir: Pedir; now: () => number; deadline: number };

/** Un menú de la ronda de apertura, descargado o con su fallo. */
export type MenuDescargado = { ok: true; html: string } | { ok: false; fallo: FalloPortal };

export type EstadoMenu = "ok" | "unavailable" | "unreadable";

/** Un aula del menú y su posición, que fija el orden de los avisos. */
export type EnMenu = { aula: AulaMenu; i: number };

/** RS-BE-51. Resultado de un aula del menú de Asistencia. `contraste` es la
 *  sección del menú distinta de la de la página (RS-BE-48). */
export type AulaAsistencia =
  | (EnMenu & { estado: "leida"; datos: AsistenciaCurso; leidaEn: Date })
  | (EnMenu & { estado: "failed"; motivo: string })
  | (EnMenu & { estado: "contraste" })
  | (EnMenu & { estado: "unavailable"; fallo: FalloPortal })
  | (EnMenu & { estado: "not_reached" });

export type FaseAsistencia = {
  menu: EstadoMenu;
  aulas: AulaAsistencia[];
  /** Aula → par que verifica su propia página (RS-BE-51, punto 4). */
  identificadas: Map<string, AsistenciaIdentificada>;
  fallos: FalloPortal[];
  identityMismatch: boolean;
  otroCiclo: boolean;
};

/** RS-BE-52 y RS-BE-53. Resultado de un aula del menú de Nota. `contraste`
 *  es la página del curso que no coincide con el menú o con la asistencia. */
export type AulaNotas =
  | (EnMenu & {
    estado: "leida"; par: AsistenciaIdentificada; evaluaciones: EvaluacionUlima[];
    agregados: AgregadoUlima[]; leidaEn: Date;
  })
  | (EnMenu & { estado: "failed"; motivo: string })
  | (EnMenu & { estado: "contraste" })
  | (EnMenu & { estado: "unavailable"; fallo: FalloPortal })
  | (EnMenu & { estado: "not_reached" });

export type FaseNotas = {
  menu: EstadoMenu;
  aulas: AulaNotas[];
  /** Aula → par que verifica su página de notas, aunque el marco falle después. */
  identificadas: Map<string, AsistenciaIdentificada>;
  fallos: FalloPortal[];
};

/** RS-BE-56. Estado de cada matrícula en la respuesta. */
export type EstadoAsistencia = "updated" | "skipped" | "failed" | "unavailable" | "not_reached" | "missing";
export type EstadoNotas = "read" | "failed" | "unavailable" | "not_reached" | "missing";

/** RS-BE-55. Lo que la transacción escribe. */
export type EscrituraAsistencia = { enrollmentId: number; horas: HorasAsistencia; leidaEn: Date };
export type EscrituraNotas = { enrollmentId: number; filas: EvaluacionEmparejada[]; leidaEn: Date };

/** RS-BE-49. Entrada del servicio. `recibidaEn` es el instante en que el
 *  controlador recibe la petición y `rastro` lo deja el limitador (RS-BE-50). */
export type RefreshInput = {
  userId: number;
  studentId: number;
  credentials: { password: string; passcode: string };
  recibidaEn: number;
  rastro: { portalTocado: boolean };
};

export type RefreshCourse = {
  sectionId: number;
  courseCode: string;
  sectionCode: string;
  attendance: EstadoAsistencia;
  grades: EstadoNotas;
};

/** RS-BE-56. Respuesta 200 de POST /portal-sync/refresh. */
export type RefreshResult = {
  readAt: string;
  attendance: { updated: number; skipped: number; failed: number; unavailable: number };
  grades: { read: number; failed: number; unavailable: number; withValue: number };
  courses: RefreshCourse[];
  view: UlimaGradesView;
  warnings: SyncWarning[];
};
