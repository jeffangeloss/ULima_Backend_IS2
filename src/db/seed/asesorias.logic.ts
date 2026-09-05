/**
 * Lógica PURA de la carga de asesorías desde el Excel de la facultad, validada
 * contra el horario oficial del ciclo (PDF). Sin base de datos ni archivos:
 * todo entra por parámetros y sale por valor, y así se prueba con datos
 * inventados en test/HU18_jeff/asesorias.logic.test.ts.
 *
 * El runner (asesorias.ts) solo lee archivos, consulta la BD y aplica el plan.
 */

// ── tipos ────────────────────────────────────────────────────────────────────
export type FilaAtencion = {
  fila: number; docente: string | null; asignatura: unknown; dia: unknown;
  inicio: unknown; fin: unknown; ambiente: unknown; zoom: unknown;
};
export type FilaTesis = {
  fila: number; docente: string; dia: unknown; inicio: unknown; fin: unknown; ambiente: unknown; zoom: unknown;
};
export type DocenteBd = {
  id: number; teacherCode: string | null; fullName: string;
  /** teacher.user_id no nulo: es la fila que usa su cuenta para entrar. */
  conCuenta: boolean;
  /** alguna sección del período objetivo lo referencia como profesor o JP. */
  enSecciones: boolean;
};
export type CursoBd = { code: string; name: string; offeringId: number | null };
export type Modalidad = "classroom" | "virtual" | "hybrid";
export type HorarioPdf = {
  /** `${claveTokens(docente)}|${codigoCurso}` por cada sección del PDF. */
  pares: Set<string>;
  /** claveTokens(docente) → "APELLIDOS, NOMBRES" tal como lo imprime el PDF. */
  docentes: Map<string, string>;
  /** código → abreviaturas de nombre de curso vistas en el PDF. */
  cursos: Map<string, string[]>;
};
export type Categoria =
  | "respaldada" | "sin_juez" | "seminario" | "sospechosa" | "docente_no_en_pdf" | "docente_no_resuelto"
  | "hora_invalida" | "dia_invalido" | "curso_no_resuelto" | "curso_sin_oferta" | "duplicada";
export type Clasificacion = {
  estado: "cargar" | "retener"; categoria: Categoria; motivo: string;
  /** "APELLIDOS, NOMBRES" del PDF cuando el docente no existe en BD y hay que crearlo. */
  crearDocente?: string;
};
export type SesionPlan = {
  fila: number; origen: "atencion" | "tesis"; categoria: Categoria;
  code: string; offeringId: number;
  teacherId: number | null; docenteNuevo: string | null; docenteNombre: string;
  dayOfWeek: number; startTime: string; endTime: string;
  classroom: string | null; meetingUrl: string | null; modality: Modalidad; nota: string | null;
  sinDatosModalidad: boolean;
};
export type Retenida = { fila: number; origen: "atencion" | "tesis"; docente: string; asignatura: string; categoria: Categoria; motivo: string };
export type DocenteNuevo = { fullName: string; teacherCode: string; desde: string };
export type SesionExistente = { id: number; offeringId: number; teacherId: number; dayOfWeek: number; startTime: string; tieneRsvp: boolean };
export type DocenteResuelto = {
  nombreExcel: string; id: number | null; fullName: string | null; teacherCode: string | null;
  modo: "cuenta" | "portal" | "sembrado" | "prefijo" | "nuevo" | "sin_resolver";
};
export type Plan = {
  crear: SesionPlan[]; retener: Retenida[]; docentesNuevos: DocenteNuevo[];
  /** A qué fila de teacher se fue cada nombre del Excel: sin esto el DRY-RUN no
   *  deja ver un empate por prefijo equivocado antes de escribir. */
  docentesResueltos: DocenteResuelto[];
  borrar: SesionExistente[]; conservarConRsvp: SesionExistente[];
};

/** Seminarios de investigación: muchos asesores por sección y el PDF solo lista
 *  al titular, así que el PDF no puede juzgarlos. También son los tres cursos
 *  donde se replica la asesoría de tesis (decisión del owner, 2026-09-04). */
export const CURSOS_MULTIASESOR: ReadonlySet<string> = new Set(["650066", "650035", "650040"]);
const NOTA_TESIS = "Asesoría de tesis";
/** Más de esto no es una asesoría, es un error de tipeo (9→18 en el Excel real). */
const MAX_HORAS = 3;

// ── texto ────────────────────────────────────────────────────────────────────
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Mayúsculas, sin tildes ni eñes, sin comas, espacios colapsados. Para COMPARAR. */
export const normalizar = (s: unknown): string =>
  sinTildes(String(s ?? "")).toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
/** Mayúsculas y sin comas, pero CONSERVANDO tildes y eñes. Para ESCRIBIR en BD. */
export const nombreParaBd = (s: unknown): string =>
  String(s ?? "").toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
export const tokens = (s: unknown): string[] => [...new Set(normalizar(s).split(" ").filter(Boolean))].sort();
const tokensOrdenados = (s: unknown): string[] => normalizar(s).split(" ").filter(Boolean);
/** Los nombres sembrados desde un PDF viejo y los del PDF actual vienen cortados a
 *  32 caracteres. Solo con esa evidencia se acepta que el ÚLTIMO token sea un
 *  prefijo ("…ROBERTO CARL" ⊑ "…ROBERTO CARLOS"); sin ella, JUAN no es JUANA. */
const LARGO_TRUNCADO = 31;
/**
 * ¿El nombre `corto` es el mismo que `largo`? Verdadero si todos los tokens del
 * corto están en el largo (el Excel trae un apellido de más), o si el corto
 * muestra evidencia de corte y solo su último token es prefijo. Mínimo 3 tokens.
 */
const empataCorto = (corto: string, largo: string): boolean => {
  const c = tokensOrdenados(corto), l = tokens(largo);
  if (c.length < 3) return false;
  if (c.every((t) => l.includes(t))) return true;
  if (String(corto).trim().length < LARGO_TRUNCADO) return false;
  const ultimo = c[c.length - 1];
  return c.slice(0, -1).every((t) => l.includes(t)) && l.some((t) => t.startsWith(ultimo));
};
/** Clave independiente del orden: portal-sync escribe NOMBRES APELLIDOS y los seeds APELLIDOS NOMBRES. */
export const claveTokens = (s: unknown): string => tokens(s).join(" ");

const DIAS: Record<string, number> = { LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6, DOMINGO: 7 };
export const diaIso = (dia: unknown): number | null => DIAS[normalizar(dia)] ?? null;

/** 9 → "09:00:00". Acepta enteros, medias horas y "HH:MM[:SS]". Fuera de 0..23 → null. */
export const horaSql = (h: unknown): string | null => {
  if (h === null || h === undefined || h === "") return null;
  let horas: number, minutos = 0;
  if (typeof h === "number") { horas = Math.floor(h); minutos = Math.round((h - horas) * 60); }
  else {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*$/.exec(String(h));
    if (!m) { const n = Number(h); if (!Number.isFinite(n)) return null; horas = Math.floor(n); minutos = Math.round((n - horas) * 60); }
    else { horas = Number(m[1]); minutos = m[2] ? Number(m[2]) : 0; }
  }
  if (!Number.isInteger(horas) || horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:00`;
};
const minutosDe = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Misma convención que las 153 asesorías de 2026-1: Zoom + aula = hybrid. */
export const modalidadDe = (ambiente: unknown, zoom: unknown): { modalidad: Modalidad; sinDatos: boolean } => {
  const aula = normalizar(ambiente);
  const conZoom = typeof zoom === "string" && zoom.trim().length > 0;
  if (aula === "VIRTUAL") return { modalidad: "virtual", sinDatos: false };
  if (aula && conZoom) return { modalidad: "hybrid", sinDatos: false };
  if (aula) return { modalidad: "classroom", sinDatos: false };
  if (conZoom) return { modalidad: "virtual", sinDatos: false };
  return { modalidad: "hybrid", sinDatos: true };   // default de la tabla; el reporte lo señala
};

// ── docentes ─────────────────────────────────────────────────────────────────
/** Réplica exacta de teacherCodeFor (portal-sync.repository.ts). No se importa
 *  porque ese módulo abre la conexión a Postgres al evaluarse y esto es puro.
 *  Si aquella cambia, esta debe cambiar igual: es lo que evita duplicar docentes. */
export const codigoPortal = (fullName: string): string => {
  const slug = sinTildes(fullName ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return "PORTAL:SIN-DOCENTE";
  return `PORTAL:${slug}`.slice(0, 50).replace(/-+$/, "");
};

/** El PDF da "APELLIDOS, NOMBRES" (a veces truncado); el Excel da el nombre
 *  completo en orden APELLIDOS NOMBRES. Juntos permiten reconstruir el orden
 *  NOMBRES APELLIDOS que usa portal-sync, y de ahí su código. */
export const codigoPortalDesdePdf = (apellidosComa: string, nombreExcel: string): string => {
  const apellidos = tokensOrdenados(apellidosComa.split(",")[0]);
  // Los apellidos se quitan DONDE ESTÉN: el Excel suele venir APELLIDOS NOMBRES,
  // pero si alguna fila viniera al revés el código derivado seguiría siendo el
  // que portal-sync va a generar.
  const nombres = tokensOrdenados(nombreExcel).filter((t) => !apellidos.includes(t));
  return codigoPortal([...nombres, ...apellidos].join(" "));
};

export type ResolucionDocente = { modo: "cuenta" | "portal" | "sembrado" | "prefijo"; docente: DocenteBd };
/**
 * Elige UNA fila de teacher para un nombre del Excel. Hay duplicados en BD
 * (upsertTeacher solo deduplica por código), y elegir mal deja la asesoría
 * invisible en la vista del propio profesor:
 *   1. la fila vinculada a una cuenta (es la que él usa para entrar),
 *   2. la fila PORTAL: que ya referencian las secciones del período,
 *   3. cualquier PORTAL:, 4. la sembrada.
 * Sin empate exacto se intenta prefijo por palabra completa, y solo si es único.
 */
export const resolverDocente = (nombre: string, docentes: DocenteBd[]): ResolucionDocente | null => {
  const clave = claveTokens(nombre);
  const elegir = (candidatos: DocenteBd[]): ResolucionDocente | null => {
    if (!candidatos.length) return null;
    // Por id, siempre: dos filas con igual prioridad no pueden elegirse según el
    // orden físico de la tabla, o la segunda corrida cambiaría de teacher_id.
    const cands = [...candidatos].sort((a, b) => a.id - b.id);
    const cuenta = cands.find((d) => d.conCuenta); if (cuenta) return { modo: "cuenta", docente: cuenta };
    const esPortal = (d: DocenteBd) => (d.teacherCode ?? "").startsWith("PORTAL:");
    const portalSec = cands.find((d) => esPortal(d) && d.enSecciones); if (portalSec) return { modo: "portal", docente: portalSec };
    const portal = cands.find(esPortal); if (portal) return { modo: "portal", docente: portal };
    return { modo: "sembrado", docente: cands[0] };
  };
  const exactos = docentes.filter((d) => claveTokens(d.fullName) === clave);
  if (exactos.length) return elegir(exactos);
  // Reserva: BD truncada a 32 caracteres ("…ROBERTO CARL") o Excel con un
  // apellido de más. Si empatan filas de DISTINTA persona, es ambiguo: null.
  const porPrefijo = docentes.filter((d) => empataCorto(d.fullName, nombre) || empataCorto(nombre, d.fullName));
  if (!porPrefijo.length) return null;
  const claves = new Set(porPrefijo.map((d) => claveTokens(d.fullName)));
  if (claves.size > 1) return null;
  const r = elegir(porPrefijo);
  return r ? { ...r, modo: "prefijo" } : null;
};

// ── PDF ──────────────────────────────────────────────────────────────────────
/** Una línea de sección del PDF tal como la extrae pypdf:
 *    "7-97-9PEREZ RAMIREZ, JUAN CARLOS3514ESTRUCTURA DATO650059"
 *     horas   APELLIDOS, NOMBRES     sec cr nombre-curso    código
 *  Las filas de continuación no repiten curso ni código: heredan el anterior. */
// La sección tiene 3 dígitos hasta noveno nivel y 4 en DÉCIMO (1051, 1053…);
// el código de curso tiene 6 dígitos salvo los cursos legado (1327, 5674).
const LINEA_PDF = /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+?, ?[A-ZÁÉÍÓÚÑ ]+?)(\d{3,4})(?:\s*(\d)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\.\s/]{2,}?)(\d{4}|\d{6}))?\s*$/;
/** Línea que termina en un código de curso pero no se pudo leer como fila de
 *  sección: invalida el arrastre para no heredar un curso viejo. */
const CODIGO_AL_FINAL = /[A-ZÁÉÍÓÚÑ.]\s*\d{4,6}\s*$/;
/** pypdf parte una fila en el salto de página: la línea siguiente queda como
 *  " 3SIST.ERP650028" (crédito + curso + código, sin nombre ni coma). */
const FRAGMENTO_PARTIDO = /^\s*\d?[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\.\s/]*\d{4,6}\s*$/;
const TERMINA_EN_SECCION = /\d{3,4}\s*$/;
const unirFilasPartidas = (texto: string): string[] => {
  const salida: string[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const previa = salida[salida.length - 1];
    if (previa !== undefined && !linea.includes(",") && FRAGMENTO_PARTIDO.test(linea) && TERMINA_EN_SECCION.test(previa)) salida[salida.length - 1] = previa + linea;
    else salida.push(linea);
  }
  return salida;
};
export const parsearHorarioPdf = (texto: string): HorarioPdf => {
  const pares = new Set<string>(); const docentes = new Map<string, string>(); const cursos = new Map<string, string[]>();
  let codigoActual: string | null = null;
  for (const linea of unirFilasPartidas(texto)) {
    const m = LINEA_PDF.exec(linea);
    if (!m) { if (CODIGO_AL_FINAL.test(linea)) codigoActual = null; continue; }
    const nombre = m[1].trim(); const abreviatura = m[4]?.trim(); const codigo = m[5];
    if (codigo) {
      codigoActual = codigo;
      if (abreviatura) { const lista = cursos.get(codigo) ?? []; if (!lista.includes(abreviatura)) lista.push(abreviatura); cursos.set(codigo, lista); }
    }
    if (!codigoActual) continue;
    const clave = claveTokens(nombre);
    pares.add(`${clave}|${codigoActual}`);
    const previo = docentes.get(clave);
    if (!previo || nombre.length > previo.length) docentes.set(clave, nombre);
  }
  return { pares, docentes, cursos };
};

/** Clave del docente en el PDF, o null. El PDF trunca los nombres largos
 *  ("...RAFAEL MART"), así que además del exacto se acepta que cada token del
 *  PDF sea prefijo de alguno del Excel — con al menos 3 tokens para no
 *  empatar por un apellido suelto. */
export const docenteEnPdf = (nombre: string, pdf: HorarioPdf): string | null => {
  const clave = claveTokens(nombre);
  if (pdf.docentes.has(clave)) return clave;
  const empates = [...pdf.docentes].filter(([, forma]) => empataCorto(forma, nombre) || empataCorto(nombre, forma)).map(([k]) => k);
  return empates.length === 1 ? empates[0] : null;   // más de uno = ambiguo, no se adivina
};

// ── cursos ───────────────────────────────────────────────────────────────────
const compacto = (s: unknown) => normalizar(s).replace(/[^A-Z0-9]/g, "");
/** Numeral romano final SOLO si es token aparte ("SEM.INVES.II" sí; "SEGURIDAD DE SI",
 *  truncado, no): si no, las abreviaturas cortadas en I/V nunca resolvían por el PDF. */
const romano = (s: unknown) => /(?:^|[\s.])(I{1,3}|IV|V)$/.exec(normalizar(s))?.[1] ?? "";
const esRomano = (t: string) => /^(I{1,3}|IV|V)$/.test(t);
/**
 * Abreviatura del Excel → código. Primero por las abreviaturas del PDF (exacta,
 * luego prefijo respetando el numeral romano), después por el nombre completo
 * en BD (cada token del Excel es prefijo de un token del nombre; los romanos
 * tienen que ser iguales). Ante empate en BD gana el curso CON oferta en el
 * período: el otro es un código legado. Nunca adivina: ambiguo → null.
 */
export const resolverCurso = (asignatura: unknown, cursosPdf: Map<string, string[]>, cursosBd: CursoBd[]): string | null => {
  const a = compacto(asignatura);
  if (!a) return null;
  const exactos = [...cursosPdf].filter(([, abbrs]) => abbrs.some((x) => compacto(x) === a)).map(([c]) => c);
  if (exactos.length === 1) return exactos[0];
  const porPrefijo = new Set<string>();
  for (const [code, abbrs] of cursosPdf) for (const abbr of abbrs) {
    const x = compacto(abbr);
    if ((a.startsWith(x.slice(0, 12)) || x.startsWith(a.slice(0, 12))) && (romano(abbr) === romano(asignatura) || x.length >= 15)) porPrefijo.add(code);
  }
  if (porPrefijo.size === 1) return [...porPrefijo][0];
  const tks = normalizar(asignatura).split(/[\s./]+/).map((t) => t.replace(/\.$/, "")).filter(Boolean);
  const hits = cursosBd.filter((c) => {
    const nombre = normalizar(c.name).split(" ");
    return tks.every((tk) => esRomano(tk) ? nombre.includes(tk) : nombre.some((nt) => nt.startsWith(tk)));
  });
  if (hits.length === 1) return hits[0].code;
  const conOferta = hits.filter((h) => h.offeringId !== null);
  return conOferta.length === 1 ? conOferta[0].code : null;
};

// ── clasificación ────────────────────────────────────────────────────────────
type Contexto = { docente: DocenteBd | null; code: string | null; pdf: HorarioPdf; cursos: CursoBd[] };
export const clasificarFila = (fila: FilaAtencion, ctx: Contexto): Clasificacion => {
  const retener = (categoria: Categoria, motivo: string): Clasificacion => ({ estado: "retener", categoria, motivo });
  if (!fila.docente) return retener("docente_no_resuelto", "fila sin docente");
  if (diaIso(fila.dia) === null) return retener("dia_invalido", `día no reconocido: ${String(fila.dia)}`);
  const ini = horaSql(fila.inicio), fin = horaSql(fila.fin);
  if (!ini || !fin) return retener("hora_invalida", `hora no numérica: ${String(fila.inicio)}-${String(fila.fin)}`);
  const dur = (minutosDe(fin) - minutosDe(ini)) / 60;
  if (dur <= 0) return retener("hora_invalida", `fin (${fin}) no es posterior al inicio (${ini})`);
  if (dur > MAX_HORAS) return retener("hora_invalida", `${dur} horas seguidas: casi seguro un error de tipeo`);
  if (!ctx.code) return retener("curso_no_resuelto", `no se pudo resolver la asignatura ${JSON.stringify(String(fila.asignatura))}`);
  const curso = ctx.cursos.find((c) => c.code === ctx.code);
  if (!curso?.offeringId) return retener("curso_sin_oferta", `el curso ${ctx.code} no tiene oferta en el período objetivo`);
  const clavePdf = docenteEnPdf(fila.docente, ctx.pdf);
  let crearDocente: string | undefined;
  if (!ctx.docente) {
    if (!clavePdf) return retener("docente_no_resuelto", "no está en la BD ni en el horario del PDF");
    crearDocente = ctx.pdf.docentes.get(clavePdf);
  }
  if (!clavePdf) return retener("docente_no_en_pdf", "el PDF no lo lista dictando ningún curso este ciclo");
  const cargar = (categoria: Categoria, motivo: string): Clasificacion => ({ estado: "cargar", categoria, motivo, ...(crearDocente ? { crearDocente } : {}) });
  // Seminario ANTES que "ausente del PDF": es la razón más específica y no
  // depende de si ese ciclo el PDF llegó a listar el curso.
  if (CURSOS_MULTIASESOR.has(ctx.code)) return cargar("seminario", "seminario de investigación: el PDF solo lista al titular");
  if (!ctx.pdf.cursos.has(ctx.code)) return cargar("sin_juez", `el curso ${ctx.code} no aparece en el PDF: no se puede juzgar`);
  if (ctx.pdf.pares.has(`${clavePdf}|${ctx.code}`)) return cargar("respaldada", "el PDF lo lista dictando este curso");
  const titulares = [...ctx.pdf.pares].filter((p) => p.endsWith(`|${ctx.code}`)).map((p) => ctx.pdf.docentes.get(p.split("|")[0]) ?? "?");
  return retener("sospechosa", `según el PDF, ${ctx.code} lo dictan: ${titulares.join("; ") || "nadie"}`);
};

// ── plan ─────────────────────────────────────────────────────────────────────
type EntradaPlan = { atencion: FilaAtencion[]; tesis: FilaTesis[]; pdf: HorarioPdf; docentes: DocenteBd[]; cursos: CursoBd[]; existentes: SesionExistente[] };
export const planificar = (e: EntradaPlan): Plan => {
  const crear: SesionPlan[] = []; const retener: Retenida[] = [];
  const nuevos = new Map<string, DocenteNuevo>(); const vistas = new Set<string>();
  const offeringDe = (code: string) => e.cursos.find((c) => c.code === code)?.offeringId ?? null;

  const registrar = (s: Omit<SesionPlan, "sinDatosModalidad" | "modality" | "classroom" | "meetingUrl"> & { ambiente: unknown; zoom: unknown }, asignatura: string) => {
    const claveDoc = s.teacherId !== null ? `id:${s.teacherId}` : `nuevo:${claveTokens(s.docenteNuevo)}`;
    const clave = `${s.offeringId}|${claveDoc}|${s.dayOfWeek}|${s.startTime}`;
    if (vistas.has(clave)) { retener.push({ fila: s.fila, origen: s.origen, docente: s.docenteNombre, asignatura, categoria: "duplicada", motivo: "misma sesión ya planificada desde otra fila" }); return; }
    vistas.add(clave);
    const { modalidad, sinDatos } = modalidadDe(s.ambiente, s.zoom);
    const { ambiente, zoom, ...resto } = s;
    crear.push({ ...resto, modality: modalidad, sinDatosModalidad: sinDatos,
      classroom: typeof ambiente === "string" && ambiente.trim() ? ambiente.trim() : null,
      meetingUrl: typeof zoom === "string" && zoom.trim() ? zoom.trim() : null });
  };
  const resueltos = new Map<string, DocenteResuelto>();
  const anotarResuelto = (nombreExcel: string, r: ResolucionDocente | null, nuevo: string | null) => {
    if (resueltos.has(nombreExcel)) return;
    resueltos.set(nombreExcel, r
      ? { nombreExcel, id: r.docente.id, fullName: r.docente.fullName, teacherCode: r.docente.teacherCode, modo: r.modo }
      : { nombreExcel, id: null, fullName: nuevo, teacherCode: nuevo ? nuevos.get(claveTokens(nuevo))?.teacherCode ?? null : null, modo: nuevo ? "nuevo" : "sin_resolver" });
  };
  const anotarNuevo = (crearDocente: string, nombreExcel: string): string => {
    // Se indexa por tokens y se devuelve SIEMPRE el nombre guardado: la misma
    // persona escrita con y sin tilde en dos filas es un solo docente nuevo.
    const clave = claveTokens(nombreExcel);
    if (!nuevos.has(clave)) nuevos.set(clave, { fullName: nombreParaBd(nombreExcel), teacherCode: codigoPortalDesdePdf(crearDocente, nombreExcel), desde: crearDocente });
    return nuevos.get(clave)!.fullName;
  };

  for (const f of e.atencion) {
    const asignatura = String(f.asignatura ?? "");
    const res = f.docente ? resolverDocente(f.docente, e.docentes) : null;
    const code = resolverCurso(f.asignatura, e.pdf.cursos, e.cursos);
    const c = clasificarFila(f, { docente: res?.docente ?? null, code, pdf: e.pdf, cursos: e.cursos });
    if (c.estado === "retener") { if (f.docente) anotarResuelto(f.docente, res, null); retener.push({ fila: f.fila, origen: "atencion", docente: f.docente ?? "", asignatura, categoria: c.categoria, motivo: c.motivo }); continue; }
    const docenteNuevo = c.crearDocente ? anotarNuevo(c.crearDocente, f.docente!) : null;
    anotarResuelto(f.docente!, res, docenteNuevo);
    registrar({ fila: f.fila, origen: "atencion", categoria: c.categoria, code: code!, offeringId: offeringDe(code!)!,
      teacherId: res?.docente.id ?? null, docenteNuevo, docenteNombre: f.docente!,
      dayOfWeek: diaIso(f.dia)!, startTime: horaSql(f.inicio)!, endTime: horaSql(f.fin)!, nota: null, ambiente: f.ambiente, zoom: f.zoom }, asignatura);
  }

  for (const t of e.tesis) {
    const res = resolverDocente(t.docente, e.docentes);
    const dia = diaIso(t.dia), ini = horaSql(t.inicio), fin = horaSql(t.fin);
    const rechazar = (categoria: Categoria, motivo: string) => retener.push({ fila: t.fila, origen: "tesis", docente: t.docente, asignatura: NOTA_TESIS, categoria, motivo });
    if (dia === null) { rechazar("dia_invalido", `día no reconocido: ${String(t.dia)}`); continue; }
    if (!ini || !fin || minutosDe(fin) <= minutosDe(ini) || (minutosDe(fin) - minutosDe(ini)) / 60 > MAX_HORAS) { rechazar("hora_invalida", `horas ${String(t.inicio)}-${String(t.fin)}`); continue; }
    // A propósito NO se retiene por "en BD pero ausente del PDF": la asesoría de
    // tesis es otro rol y un asesor puede no ser titular de ninguna sección.
    let docenteNuevo: string | null = null;
    if (!res) {
      const clavePdf = docenteEnPdf(t.docente, e.pdf);
      if (!clavePdf) { anotarResuelto(t.docente, null, null); rechazar("docente_no_resuelto", "no está en la BD ni en el horario del PDF"); continue; }
      docenteNuevo = anotarNuevo(e.pdf.docentes.get(clavePdf)!, t.docente);
    }
    anotarResuelto(t.docente, res, docenteNuevo);
    for (const code of CURSOS_MULTIASESOR) {
      const offeringId = offeringDe(code);
      if (offeringId === null) { rechazar("curso_sin_oferta", `${code} sin oferta en el período`); continue; }
      registrar({ fila: t.fila, origen: "tesis", categoria: "seminario", code, offeringId, teacherId: res?.docente.id ?? null, docenteNuevo,
        docenteNombre: t.docente, dayOfWeek: dia, startTime: ini, endTime: fin, nota: NOTA_TESIS, ambiente: t.ambiente, zoom: t.zoom }, NOTA_TESIS);
    }
  }

  const clavesCrear = new Set(crear.filter((s) => s.teacherId !== null).map((s) => `${s.offeringId}|${s.teacherId}|${s.dayOfWeek}|${s.startTime}`));
  const sobrantes = e.existentes.filter((x) => !clavesCrear.has(`${x.offeringId}|${x.teacherId}|${x.dayOfWeek}|${x.startTime}`));
  return {
    crear, retener, docentesNuevos: [...nuevos.values()],
    docentesResueltos: [...resueltos.values()].sort((a, b) => a.nombreExcel.localeCompare(b.nombreExcel)),
    borrar: sobrantes.filter((x) => !x.tieneRsvp), conservarConRsvp: sobrantes.filter((x) => x.tieneRsvp),
  };
};
