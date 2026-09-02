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
  datosPersonales: "ul/servlets/ComandoVisualizarDatosPersonales",
  logout: "servlets/CustomLogoutServlet",
} as const;

const sessionInvalid = () =>
  new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");

export class PortalClient {
  constructor(
    private readonly baseUrl: string = config.portal.baseUrl,
    private readonly timeoutMs: number = config.portal.timeoutMs,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private cookieHeader(c: PortalCookies): string {
    const parts = [`JSESSIONID=${c.JSESSIONID}`, `LtpaToken2=${c.LtpaToken2}`];
    if (c.LtpaToken) parts.push(`LtpaToken=${c.LtpaToken}`);
    return parts.join("; ");
  }

  async fetchPage(path: string, cookies: PortalCookies): Promise<string> {
    const url = `${this.baseUrl}${ROOT}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",                       // un 302 a inicio.jsp = sesión inválida
        signal: ac.signal,
        headers: { Cookie: this.cookieHeader(cookies), "User-Agent": UA, Accept: "text/html,*/*;q=0.8" },
      });
    } catch (e) {
      // Nunca propagamos el error original: puede llevar cabeceras o cuerpo.
      const aborted = (e as Error)?.name === "AbortError";
      throw aborted
        ? new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT")
        : new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }

    const location = res.headers.get("Location") ?? "";
    if (res.status >= 300 && res.status < 400) {
      if (/inicio\.jsp|solicitarValidarToken/i.test(location)) throw sessionInvalid();
      throw new HttpError(502, "Respuesta inesperada de miUlima.", "PORTAL_UNAVAILABLE");
    }
    if (res.status >= 500) throw new HttpError(502, "miUlima devolvió un error.", "PORTAL_UNAVAILABLE");
    if (res.status !== 200) throw new HttpError(502, "Respuesta inesperada de miUlima.", "PORTAL_UNAVAILABLE");

    const charset = res.headers.get("Content-Type")?.match(/charset=([\w-]+)/i)?.[1] ?? "ISO-8859-1";
    const buf = await res.arrayBuffer();
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
  }

  /** layout.jsp ya fue descargado por el service (de ahí sale el COCICLO). */
  async fetchAll(cociclo: string, cookies: PortalCookies) {
    if (!/^\d{5}$/.test(cociclo)) {
      throw new HttpError(502, "Ciclo del portal con formato inesperado.", "PORTAL_UNAVAILABLE");
    }
    const [matricula, record, datosPersonales] = await Promise.all([
      this.fetchPage(PORTAL_PATHS.matricula(cociclo), cookies),
      this.fetchPage(PORTAL_PATHS.record, cookies),
      this.fetchPage(PORTAL_PATHS.datosPersonales, cookies),
    ]);
    return { matricula, record, datosPersonales };
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
