import { cellsOf, inputValueByName, trsOf, type ParseResult } from "./html.js";
import type { AsistenciaCurso, AsistenciaIdentificada } from "../portal-sync.types.js";

/**
 * RS-BE-15 — panel Asistencia del Aula Virtual, vista del alumno
 * (`av/servlets/ComandoListarAsistenciaAulaVirtualAlumno?prm_sNuAula=<aula>`).
 *
 * Devuelve SOLO los tres agregados más la identificación del curso. Las filas
 * por sesión se leen como checksum y se descartan; la columna "Observación" ni
 * se mira. Que `AsistenciaCurso` tenga exactamente cinco campos es la garantía
 * de minimización, no un olvido: esa página trae el nombre del alumno, el del
 * docente y texto libre que menciona a terceros.
 *
 * Los mensajes de `reason` llevan solo literales fijos y valores que ya pasaron
 * una regex de dígitos. Nunca un fragmento del HTML del portal.
 */

/** Etiquetas de la cabecera, en las posiciones pares de una fila de 9 celdas. */
const CABECERA = ["fecha", "hora", "duracion", "asistencia", "observacion"];

const sinAcentos = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const NUM = /^\d{1,4}(?:[.,]\d{1,2})?$/;
/** "0 horas / 0 %" — `horas?` cubre el singular, que no se observó todavía. */
const INASISTENCIAS = /^(\d{1,4}(?:[.,]\d{1,2})?)\s*horas?\s*\/\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*%$/;
const FECHA = /^\d{2}\/\d{2}\/\d{4}$/;
const MARCA_SI = /^s[ií]$/i;

const aNumero = (s: string): number => Number(s.replace(",", "."));

/**
 * `ParseResult` más la identificación verificada, que va FUERA de `data` para
 * que `AsistenciaCurso` siga con sus cinco campos. Sale también cuando la página
 * falla después de identificarse, porque de ese par dependen los delegados y el
 * nombre del curso en los avisos cuando el menú no trae el código.
 *
 * RS-BE-49 y RS-BE-51. `identityMismatch` marca solo un código de alumno
 * presente, no vacío y distinto, para que la recarga aborte entera, y
 * `otroCiclo` marca solo unos ocultos del ciclo bien formados que declaran otro.
 */
export type AsistenciaResult = ParseResult<AsistenciaCurso> & {
  identificado?: AsistenciaIdentificada;
  identityMismatch?: true;
  otroCiclo?: true;
};

const falla = (reason: string, identificado?: AsistenciaIdentificada): AsistenciaResult =>
  identificado ? { ok: false, reason, identificado } : { ok: false, reason };

export const parseAsistenciaCurso = (
  html: string,
  aulaEsperada: string,
  alumnoEsperado: string,
  /** RS-BE-51. "AAAA-N". Sin él no se revisa el ciclo. */
  cicloEsperado?: string,
): AsistenciaResult => {
  // ── Identificación. `inputValueByName` ancla el nombre COMPLETO: la página
  // trae `prm_sCoSecc` junto a `prm_sCoSeccAcd`, y un `includes` los confunde.
  const courseCode = inputValueByName(html, "prm_sCoCurs");
  if (!courseCode || !/^\d{4,6}$/.test(courseCode)) {
    // Mata de un tiro las tres respuestas inválidas con HTTP 200 que el portal
    // devuelve: la página de login, la de passcode y el cuerpo vacío.
    return falla("la respuesta no es una página de asistencia");
  }
  const sectionCode = inputValueByName(html, "prm_sCoSecc");
  if (!sectionCode || !/^\d{1,4}$/.test(sectionCode)) {
    return falla("la respuesta no trae el código de sección");
  }
  const aula = inputValueByName(html, "prm_sNuAula");
  if (!aula || !/^\d{1,10}$/.test(aula) || aula !== aulaEsperada) {
    return falla("la respuesta no corresponde al aula que se pidió");
  }
  const alumno = inputValueByName(html, "prm_sCoUserAlum");
  // RS-BE-49. Ausente o vacío es un fallo común de lectura de este curso.
  if (!alumno) return falla("la página no trae el código de alumno");
  if (alumno !== alumnoEsperado) {
    // Sin imprimir ninguno de los dos códigos: el recibido sería de un tercero.
    return {
      ok: false, reason: "la página declara un código de alumno distinto del autenticado", identityMismatch: true,
    };
  }
  // RS-BE-51, punto 3. La página de notas no trae ciclo, así que el de la
  // asistencia es la guarda contra leer notas de un ciclo que ULima++ no activó.
  if (cicloEsperado !== undefined) {
    const anio = inputValueByName(html, "prm_sAaCicl");
    const numero = inputValueByName(html, "prm_sNuCicl");
    if (!anio || !/^\d{4}$/.test(anio) || !numero || !/^[0-3]$/.test(numero)) {
      return falla("la página es de otro ciclo");
    }
    if (`${anio}-${numero}` !== cicloEsperado) {
      return { ok: false, reason: "la página es de otro ciclo", otroCiclo: true };
    }
  }
  // Desde acá el par es la identificación verificada, y todo fallo lo lleva.
  const identificado: AsistenciaIdentificada = { courseCode, sectionCode };

  const filas = trsOf(html).map(cellsOf);

  // ── Puerta de cabecera. Es lo único que garantiza que la columna de la marca
  // siga siendo la misma el día que el portal agregue una columna.
  const hayCabecera = filas.some(
    (c) => c.length === 9 && CABECERA.every((etq, i) => sinAcentos(c[i * 2]) === etq),
  );
  if (!hayCabecera) return falla("la tabla de sesiones no tiene la cabecera esperada", identificado);

  // ── Agregados: filas de 5 celdas con ":" al medio. Se busca sobre el texto ya
  // normalizado por `clean`, nunca sobre el crudo: el JSP emite
  // "Total  horas  asistidas" con espacios dobles.
  let total: number | null = null;
  let asistidas: number | null = null;
  let ausentes: number | null = null;
  let vistos = 0;

  for (const c of filas) {
    if (c.length !== 5 || c[2] !== ":") continue;
    const etq = sinAcentos(c[0]);
    const valor = c[4];
    if (etq.startsWith("total horas programadas")) {
      vistos++;
      if (!NUM.test(valor)) return falla("un total de asistencia no es un número", identificado);
      total = aNumero(valor);
    } else if (etq.startsWith("total horas asistidas")) {
      vistos++;
      if (!NUM.test(valor)) return falla("un total de asistencia no es un número", identificado);
      asistidas = aNumero(valor);
    } else if (etq.startsWith("total inasistencias")) {
      vistos++;
      const m = INASISTENCIAS.exec(valor);
      // Jamás asumir cero: nadie ha visto todavía este bloque con faltas reales.
      if (!m) return falla("el bloque de inasistencias tiene un formato desconocido", identificado);
      ausentes = aNumero(m[1]);
      // El porcentaje se lee para validar la forma de la celda y se descarta.
    }
  }
  if (vistos !== 3 || total === null || asistidas === null || ausentes === null) {
    return falla(`faltan los totales de asistencia (${vistos} de 3)`, identificado);
  }

  // ── Checksum con las filas por sesión, que después se tiran. Vale bajo las
  // dos hipótesis vivas sobre qué suma el portal, por eso son cotas y no una
  // igualdad. Solo se aplica si TODAS las duraciones parsean.
  const sesiones = filas.filter((c) => c.length === 9 && FECHA.test(c[0]));
  if (sesiones.length > 0 && sesiones.every((c) => NUM.test(c[4]))) {
    let sumSi = 0;
    let sumTodas = 0;
    for (const c of sesiones) {
      const h = aNumero(c[4]);
      sumTodas += h;
      if (MARCA_SI.test(c[6])) sumSi += h;
    }
    const eps = 0.001;
    if (asistidas < sumSi - eps || asistidas > sumTodas + eps) {
      return falla("los totales no cuadran con las sesiones listadas", identificado);
    }
  }

  return {
    ok: true,
    data: { courseCode, sectionCode, totalHours: total, attendedHours: asistidas, absentHours: ausentes },
    identificado,
  };
};
