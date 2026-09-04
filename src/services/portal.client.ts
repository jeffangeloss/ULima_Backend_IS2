import { config } from "../config/app-config.js";
import { HttpError } from "../shared/errors/http-error.js";
import type { PortalCookies } from "../modules/portal-sync/portal-sync.types.js";

const ROOT = "/portalUL/";
const UA = "Mozilla/5.0 (compatible; ULimaPlus/1.0)";

/**
 * Valida el número de aula del Aula Virtual (`prm_sNuAula`) ANTES de que se
 * interpole en el query string, y devuelve el mismo valor para poder usarlo
 * inline en el template (RS-8).
 *
 * El criterio es el MISMO que el de `fetchAll` con el COCICLO (`^\d{5}$`) y el
 * de `fetchSyllabus` con el código de curso (`^\d{4,6}$`): regex anclada en
 * ambos extremos y solo dígitos. La razón para validar acá y no confiar en el
 * llamador es que el aula NO sale de nuestra base: sale del HTML del sidebar
 * del portal, o sea de una fuente que puede cambiar sin aviso. Un valor con
 * `&`, `?`, `/` o `..` colado en `?prm_sNuAula=` deja de ser un parámetro y
 * pasa a ser otra petición al portal hecha con la sesión viva del alumno.
 *
 * El rango 4-8 es lo observado el 2026-09-04 (aulas de 6 dígitos, tipo
 * `154508`) con holgura a los dos lados: el portal no documenta el ancho y
 * clavarlo en 6 sería atar el cliente a una muestra de 10 nóminas.
 *
 * Mismo error que un COCICLO mal formado —502 `PORTAL_UNAVAILABLE`, no 4xx—
 * porque la culpa sería del portal y no del cliente: este valor jamás llega
 * desde la API pública, y el 409 está reservado para sesión inválida.
 */
const assertAula = (aula: string): string => {
  if (!/^\d{4,8}$/.test(aula)) {
    throw new HttpError(502, "Aula del portal con formato inesperado.", "PORTAL_UNAVAILABLE");
  }
  return aula;
};

/** Rutas fijas. Lo único interpolado son el COCICLO (`^\d{5}$`, validado en
 *  `fetchAll`) y el aula del panel de delegados (`^\d{4,8}$`, validada acá
 *  mismo por `assertAula`). */
export const PORTAL_PATHS = {
  layout: "layout.jsp",
  matricula: (cociclo: string) => `gama/servlets/ComandoMostrarConsMatr?COCICLO=${cociclo}&Fg=1`,
  record: "gada/servlets/ComandoListarRecordAcademico?ac=1",
  logout: "servlets/CustomLogoutServlet",
  securityCheck: "j_security_check",

  // ── Panel de delegados ───────────────────────────────────────────────────
  // `ComandoIngresarAulaVirtualBBDelegado` NO devuelve la nómina: devuelve un
  // frameset, y el dato vive dos saltos más adentro. Estas son las rutas de
  // esos dos saltos. No hace falta un método nuevo en el cliente: `fetchPage`
  // ya es genérico y ambas cuelgan de `ROOT` como el resto.

  /** Sidebar del panel. Un `OpenDelegado('<aula>')` por curso más los arrays
   *  JS planos `aNuAula`/`aCurs`/`aSecc` que mapean aula → curso → sección.
   *  Sin parámetros a propósito: el servlet responde según la sesión, así que
   *  acá no hay nada que validar. */
  cursosDelegado: "av/servlets/ComandoListarCursosXOpcionAulaVirtualDelegado",

  /** Nómina de una sección: la tabla real, con las únicas dos casillas
   *  marcadas de toda la página. El aula pasa por `assertAula` antes de
   *  interpolarse; un aula basura revienta acá y nunca llega a la red. */
  nominaDelegado: (aula: string) =>
    `av/servlets/ComandoListarAulaDelegadoAulaVirtual?prm_sNuAula=${assertAula(aula)}`,
} as const;

/** Vista Domino de sílabos. Vive en un host DISTINTO de `webaloe` (ver
 *  `config.syllabus.baseUrl`), no bajo `ROOT`. */
const SYLLABUS_VIEW_PATH = "/ac/ac_bd001.nsf/vSyllabusXCicloAV";

const sessionInvalid = () =>
  new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");

/**
 * Credenciales o passcode rechazados.
 *
 * 409 y NUNCA 401: el `ApiClient` de la app trata cualquier 401 como expiración
 * del JWT y cierra la sesión de ULima++. Un tipeo en un código de 6 dígitos que
 * caduca cada 30 s no puede echar al alumno de la app.
 *
 * El mensaje no dice si falló la contraseña o el passcode: distinguirlo le daría
 * a un atacante una forma de verificar contraseñas contra el portal.
 */
const loginRejected = () =>
  new HttpError(
    409,
    "miUlima rechazó los datos. Revisa tu contraseña y el código del authenticator.",
    "PORTAL_LOGIN_REJECTED",
  );

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
   * `fetchPage`.
   *
   * OJO: hoy ese 409 no lo consume nadie. El único llamador
   * (`portal-sync.service.ts`, §3.5) lo atrapa junto con cualquier otra
   * excepción y lo degrada a "sin sílabo para este curso", como la spec exige
   * (§Manejo de errores): un fallo de sílabo nunca aborta la importación. Se
   * lanza igual, en vez de devolver `null` acá, para que la señal quede
   * disponible si un llamador futuro quiere distinguirla — p. ej. dejar de
   * pedir los sílabos restantes cuando la sesión ya murió, que ahorraría N-1
   * peticiones. El llamador de hoy la descarta a propósito.
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

  // ── Login con credenciales ───────────────────────────────────────────────
  //
  // Solo se usa cuando el cliente manda `credentials` en vez de `cookies`. El
  // flujo es el mismo que se verificó empíricamente contra el portal real (ver
  // §Cómo se obtiene la sesión en la spec), y sus dos trampas están anotadas
  // abajo, en el paso donde muerden.

  /** Acumula las `Set-Cookie` de toda la cadena. `webaloe` reparte la sesión
   *  entre varias redirecciones, así que ninguna respuesta sola alcanza. */
  private collectCookies(jar: Map<string, string>, res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const par = raw.split(";")[0] ?? "";
      const i = par.indexOf("=");
      if (i <= 0) continue;
      const nombre = par.slice(0, i).trim();
      const valor = par.slice(i + 1).trim();
      // Un valor vacío es el portal BORRANDO la cookie; hay que respetarlo.
      if (valor) jar.set(nombre, valor); else jar.delete(nombre);
    }
  }

  /** Una petición del login: manda el jar, recoge lo que llegue, no sigue
   *  redirecciones (las sigue `chase`, que necesita ver cada salto). */
  private async hop(
    jar: Map<string, string>, method: "GET" | "POST", url: string,
    form?: Record<string, string>, referer?: string,
  ): Promise<{ status: number; location: string | null; body: string }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const headers: Record<string, string> = { "User-Agent": UA };
      if (cookie) headers.Cookie = cookie;
      if (referer) headers.Referer = referer;
      if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
      const res = await this.fetchImpl(url, {
        method, redirect: "manual", signal: ac.signal, headers,
        body: form ? new URLSearchParams(form).toString() : undefined,
      });
      this.collectCookies(jar, res);
      const buf = await res.arrayBuffer();
      return {
        status: res.status,
        location: res.headers.get("location"),
        // ISO-8859-1 como el resto de `webaloe` (el tipado de Bun no lo declara,
        // igual que en `fetchPage`). Solo se usa para buscar marcadores ASCII;
        // este cuerpo nunca se devuelve al cliente.
        body: new TextDecoder("iso-8859-1" as Bun.Encoding).decode(buf),
      };
    } catch (e) {
      throw portalFailure(e);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sigue la cadena de 302 acumulando cookies. Devuelve dónde terminó. */
  private async chase(
    jar: Map<string, string>, inicio: { status: number; location: string | null; body: string },
    urlActual: string, saltos = 8,
  ): Promise<{ url: string; body: string }> {
    let paso = inicio;
    let url = urlActual;
    for (let i = 0; i < saltos && paso.status >= 300 && paso.status < 400 && paso.location; i++) {
      url = new URL(paso.location, url).toString();
      // TRAMPA: `redirectJsp.jsp` no se vuelve a pedir NUNCA. Es una página que
      // solo lleva un `window.location.replace` a layout.jsp, y volver a
      // pedirla tumba la sesión recién creada. Se corta acá y el paso 4 va
      // directo a layout.jsp.
      if (url.includes("redirectJsp.jsp")) return { url, body: "" };
      paso = await this.hop(jar, "GET", url, undefined, urlActual);
    }
    return { url, body: paso.body };
  }

  /**
   * Inicia sesión en miUlima y devuelve las cookies de la sesión creada.
   *
   * `userCode` NO viene del cliente: sale de `app_user.code` a partir del JWT.
   * `password` y `passcode` se usan y se descartan: no se registran en ningún
   * log, no se persisten y no aparecen en ningún mensaje de error.
   */
  async login(userCode: string, password: string, passcode: string): Promise<PortalCookies> {
    const jar = new Map<string, string>();
    const base = `${this.baseUrl}${ROOT}`;

    // 1. Sin sesión: fija WASReqURL y rebota a inicio.jsp.
    const p1 = await this.hop(jar, "GET", `${base}${PORTAL_PATHS.layout}`);
    await this.chase(jar, p1, `${base}${PORTAL_PATHS.layout}`);

    // 2. Usuario y contraseña. `ac` es el timestamp que manda el formulario.
    const p2 = await this.hop(jar, "POST", `${base}${PORTAL_PATHS.securityCheck}`, {
      ac: String(Date.now()), url2: "", j_username: userCode, j_password: password,
    }, `${base}inicio.jsp`);
    const tras2 = await this.chase(jar, p2, `${base}${PORTAL_PATHS.securityCheck}`);

    // Volver a inicio.jsp sin pasar por el segundo factor = credenciales malas.
    if (tras2.url.includes("inicio.jsp") && !tras2.url.includes("solicitarValidarToken")) {
      throw loginRejected();
    }

    // 3. Segundo factor, si el portal lo pide.
    if (tras2.url.includes("solicitarValidarToken")) {
      const p3 = await this.hop(jar, "POST", tras2.url, { url2: "", sPasscode: passcode }, tras2.url);
      // TRAMPA: un passcode rechazado devuelve 200 con la MISMA página y sin
      // mensaje de error. La redirección es la única señal fiable de éxito, así
      // que el criterio es esa y no el status ni el texto.
      if (p3.status < 300 || p3.status >= 400) throw loginRejected();
      await this.chase(jar, p3, tras2.url);
    }

    // 4. Verificación. Se va DIRECTO a layout.jsp (ver la trampa de `chase`).
    const p4 = await this.hop(jar, "GET", `${base}${PORTAL_PATHS.layout}`, undefined, `${base}redirectJsp.jsp`);
    const tras4 = await this.chase(jar, p4, `${base}${PORTAL_PATHS.layout}`);
    const cuerpo = tras4.body || p4.body;
    if (tras4.url.includes("inicio.jsp") || !cuerpo.includes("Bienvenid")) throw loginRejected();

    const JSESSIONID = jar.get("JSESSIONID");
    const LtpaToken2 = jar.get("LtpaToken2");
    if (!JSESSIONID || !LtpaToken2) throw loginRejected();
    const LtpaToken = jar.get("LtpaToken");
    return LtpaToken ? { JSESSIONID, LtpaToken2, LtpaToken } : { JSESSIONID, LtpaToken2 };
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
