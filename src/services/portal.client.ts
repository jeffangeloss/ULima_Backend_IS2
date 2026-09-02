import { config } from "../config/app-config.js";
import { HttpError } from "../shared/errors/http-error.js";
import type { PortalCookies } from "../modules/portal-sync/portal-sync.types.js";

const ROOT = "/portalUL/";
const UA = "Mozilla/5.0 (compatible; ULimaPlus/1.0)";

/** Rutas fijas. Lo único interpolado es el COCICLO, validado como ^\d{5}$. */
export const PORTAL_PATHS = {
  layout: "layout.jsp",
  matricula: (cociclo: string) => `gama/servlets/ComandoMostrarConsMatr?COCICLO=${cociclo}&Fg=1`,
  record: "gada/servlets/ComandoListarRecordAcademico?ac=1",
  logout: "servlets/CustomLogoutServlet",
} as const;

/** Vista Domino de sílabos. Vive en un host DISTINTO de `webaloe` (ver
 *  `config.syllabus.baseUrl`), no bajo `ROOT`. */
const SYLLABUS_VIEW_PATH = "/ac/ac_bd001.nsf/vSyllabusXCicloAV";

const sessionInvalid = () =>
  new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");

/**
 * Traduce un fallo de red — o de LECTURA del cuerpo, que es el mismo fallo más
 * tarde — a un `HttpError` de mensaje fijo. Nunca se propaga el error original:
 * puede llevar cabeceras o cuerpo del portal.
 */
const portalFailure = (e: unknown): HttpError =>
  (e as Error)?.name === "AbortError"
    ? new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT")
    : new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");

export class PortalClient {
  constructor(
    private readonly baseUrl: string = config.portal.baseUrl,
    private readonly timeoutMs: number = config.portal.timeoutMs,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Público a propósito: el parser del sílabo arma la URL que se persiste
     *  con ESTA base, la misma con la que se descargó (ver `parseSyllabusEntry`). */
    readonly syllabusBaseUrl: string = config.syllabus.baseUrl,
  ) {}

  /** Cookies para `webaloe`: las tres, tal como las mandaría el navegador. */
  private cookieHeader(c: PortalCookies): string {
    const parts = [`JSESSIONID=${c.JSESSIONID}`, `LtpaToken2=${c.LtpaToken2}`];
    if (c.LtpaToken) parts.push(`LtpaToken=${c.LtpaToken}`);
    return parts.join("; ");
  }

  /**
   * Cookies para el host de sílabos: SOLO el token LTPA. Según la §SSO de la
   * spec, lo que autentica Domino es el LTPA (`Domain=.ulima.edu.pe`);
   * `JSESSIONID` es la sesión de WebSphere atada a `webaloe`, y un navegador
   * nunca la mandaría a otro host. Enviarla dejaba el identificador de sesión
   * vivo del alumno en los logs de acceso, proxies o errores de un segundo
   * servidor, sin ninguna necesidad.
   */
  private ltpaCookieHeader(c: PortalCookies): string {
    const parts = [`LtpaToken2=${c.LtpaToken2}`];
    if (c.LtpaToken) parts.push(`LtpaToken=${c.LtpaToken}`);
    return parts.join("; ");
  }

  /**
   * El `clearTimeout` va en un `finally` que envuelve TAMBIÉN la lectura del
   * cuerpo, no solo el `fetch`: `fetch` resuelve en cuanto llegan las
   * cabeceras, así que desarmar el timer ahí dejaba `res.arrayBuffer()`
   * corriendo sin límite de tiempo y con el AbortController ya desactivado. Un
   * host que responde 200 y deja de emitir bytes (proxy a medio morir,
   * respuesta chunked truncada) colgaba la promesa para siempre.
   */
  async fetchPage(path: string, cookies: PortalCookies): Promise<string> {
    const url = `${this.baseUrl}${ROOT}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: "GET",
          redirect: "manual",                       // un 302 a inicio.jsp = sesión inválida
          signal: ac.signal,
          headers: { Cookie: this.cookieHeader(cookies), "User-Agent": UA, Accept: "text/html,*/*;q=0.8" },
        });
      } catch (e) {
        throw portalFailure(e);
      }

      const location = res.headers.get("Location") ?? "";
      if (res.status >= 300 && res.status < 400) {
        if (/inicio\.jsp|solicitarValidarToken/i.test(location)) throw sessionInvalid();
        throw new HttpError(502, "Respuesta inesperada de miUlima.", "PORTAL_UNAVAILABLE");
      }
      if (res.status >= 500) throw new HttpError(502, "miUlima devolvió un error.", "PORTAL_UNAVAILABLE");
      if (res.status !== 200) throw new HttpError(502, "Respuesta inesperada de miUlima.", "PORTAL_UNAVAILABLE");

      const charset = res.headers.get("Content-Type")?.match(/charset=([\w-]+)/i)?.[1] ?? "ISO-8859-1";
      let buf: ArrayBuffer;
      try {
        buf = await res.arrayBuffer();            // sigue bajo el mismo timeout
      } catch (e) {
        throw portalFailure(e);
      }
      let html: string;
      try {
        // El tipado de Bun para TextDecoder solo declara "utf-8" | "windows-1252" | "utf-16",
        // pero en runtime acepta cualquier etiqueta WHATWG (incluida "ISO-8859-1", que es la
        // que llega en el Content-Type real del portal). El cast es solo para el compilador.
        html = new TextDecoder(charset as Bun.Encoding).decode(buf);
      } catch {
        html = new TextDecoder("iso-8859-1" as Bun.Encoding).decode(buf);
      }
      if (/solicitarValidarToken|j_security_check/i.test(html)) throw sessionInvalid();
      return html;
    } finally {
      clearTimeout(timer);
    }
  }

  /** layout.jsp ya fue descargado por el service (de ahí sale el COCICLO). */
  async fetchAll(cociclo: string, cookies: PortalCookies) {
    if (!/^\d{5}$/.test(cociclo)) {
      throw new HttpError(502, "Ciclo del portal con formato inesperado.", "PORTAL_UNAVAILABLE");
    }
    const [matricula, record] = await Promise.all([
      this.fetchPage(PORTAL_PATHS.matricula(cociclo), cookies),
      this.fetchPage(PORTAL_PATHS.record, cookies),
    ]);
    return { matricula, record };
  }

  /**
   * Sílabo de un curso en un ciclo, desde la base Domino de sílabos —
   * `cactus.ulima.edu.pe`, un host distinto de `webaloe` (ver
   * `config.syllabus.baseUrl`, allowlist propia en `env.ts`).
   *
   * La sesión SSO (LTPA) que abre `webaloe` también autentica esta base: se
   * comprobó empíricamente (2026-09-02) que la MISMA cookie de sesión del
   * portal devuelve el mismo documento que un login directo a Domino — sin
   * segundo login ni credenciales adicionales.
   *
   * Valida `cociclo` (`^\d{5}$`) y `courseCode` (`^\d{4,6}$`) antes de
   * interpolarlos en la URL, igual que `fetchAll` con el COCICLO.
   *
   * A diferencia de `fetchPage`/`fetchAll`, un sílabo es un dato adicional
   * (no el propósito de la importación): cualquier problema que NO sea
   * sesión inválida se degrada a `null` en vez de lanzar (timeout, error de
   * red, status inesperado). Solo una redirección — la única señal de
   * sesión muerta verificable en HTTP; no existe, a diferencia de
   * `inicio.jsp`/`solicitarValidarToken` en `webaloe`, un marcador conocido
   * de "página de login" de Domino — sigue lanzando el mismo 409 que
   * `fetchPage`, para que quien llama sepa que la sesión murió.
   *
   * Se decodifica SIEMPRE como UTF-8: Cactus declara un charset en el
   * `Content-Type` que no coincide con el cuerpo real (comprobado en el
   * spike del 2026-09-02); decodificar según lo declarado mancha los
   * acentos.
   */
  async fetchSyllabus(cociclo: string, courseCode: string, cookies: PortalCookies): Promise<string | null> {
    if (!/^\d{5}$/.test(cociclo) || !/^\d{4,6}$/.test(courseCode)) return null;

    const url =
      `${this.syllabusBaseUrl}${SYLLABUS_VIEW_PATH}?ReadViewEntries&OutputFormat=JSON&Count=5` +
      `&RestrictToCategory=${cociclo}_${courseCode}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: "GET",
          redirect: "manual",
          signal: ac.signal,
          headers: {
            Cookie: this.ltpaCookieHeader(cookies), "User-Agent": UA, Accept: "application/json,*/*;q=0.8",
          },
        });
      } catch {
        // Timeout o error de red: se degrada a "no hay sílabo", nunca aborta.
        return null;
      }

      if (res.status >= 300 && res.status < 400) throw sessionInvalid();
      if (res.status !== 200) return null;

      try {
        const buf = await res.arrayBuffer();       // sigue bajo el mismo timeout
        return new TextDecoder("utf-8").decode(buf);
      } catch {
        // El cuerpo se cortó, o el timeout venció leyéndolo: sin sílabo.
        return null;
      }
    } finally {
      // Igual que en `fetchPage`: el timer cubre TAMBIÉN la lectura del cuerpo.
      // Desarmarlo al llegar las cabeceras dejaba colgada la promesa si el host
      // dejaba de emitir bytes, y con ella el `Promise.all` de los N sílabos.
      clearTimeout(timer);
    }
  }

  /** Best effort: cerrar la sesión del portal nunca debe romper la importación. */
  async logout(cookies: PortalCookies): Promise<void> {
    try {
      await this.fetchPage(PORTAL_PATHS.logout, cookies);
    } catch {
      /* ignorado a propósito */
    }
  }
}

export const portalClient = new PortalClient();
