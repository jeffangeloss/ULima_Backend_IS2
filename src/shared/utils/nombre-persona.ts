/**
 * Identidad de una persona a partir de su nombre.
 *
 * Vive acá, y no dentro de un módulo, porque la comparten portal-sync (que
 * escribe `teacher` al importar) y los seeds (que la escriben a mano). Cuando
 * cada uno tenía su propia regla, la misma persona entraba dos veces: el seed
 * la guardaba como "APELLIDOS, NOMBRES" y portal-sync como "NOMBRES APELLIDOS",
 * y ninguna comparación los reconocía. En producción eso dejó 11 docentes
 * duplicados (2026-09-05).
 */

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Mayúsculas, sin tildes, sin comas, espacios colapsados. Para COMPARAR, no para mostrar. */
export const normalizarNombre = (s: unknown): string =>
  sinTildes(String(s ?? "")).toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();

/** Palabras del nombre, únicas y ordenadas alfabéticamente. */
export const tokensNombre = (s: unknown): string[] =>
  [...new Set(normalizarNombre(s).split(" ").filter(Boolean))].sort();

/**
 * Clave de identidad: el conjunto de palabras del nombre, ordenado. Es lo que
 * hace que "DIAZ PARRA, JOSE RAUL" y "JOSE RAUL DIAZ PARRA" sean la misma
 * persona. Un nombre vacío da clave vacía.
 */
export const claveNombre = (s: unknown): string => tokensNombre(s).join(" ");

/**
 * ¿Son la misma persona? Igualdad EXACTA de conjunto de palabras: acá no se
 * tolera un nombre truncado ni un apellido de más, porque el resultado se
 * escribe en la base. La tolerancia con evidencia de truncado vive en el seed
 * de asesorías, donde el horario oficial sirve de juez.
 *
 * Dos nombres vacíos no son la misma persona: nadie es nadie.
 */
export const mismaPersona = (a: unknown, b: unknown): boolean => {
  const clave = claveNombre(a);
  return clave !== "" && clave === claveNombre(b);
};

/**
 * Parte un nombre guardado en apellidos y nombres.
 *
 * Los nombres se guardan como los entrega miUlima: APELLIDOS y después NOMBRES,
 * con la convención peruana de **dos apellidos**. De los 367 usuarios, 310
 * tienen exactamente cuatro palabras y todos siguen ese patrón.
 *
 * Es una CONVENCIÓN, no una deducción: desde el texto solo no hay forma de
 * saber dónde terminan los apellidos. Con dos apellidos acierta en la enorme
 * mayoría; con alguien de un solo apellido y tres nombres, no.
 *
 * Vivía copiada en siete archivos, todos tomando el ÚLTIMO token como apellido,
 * que es al revés: con ese criterio la tarjeta de contacto mostraba
 * "ANGELO, SANCHEZ PALACIOS JEFFERSON".
 */
export const partirNombre = (fullName: unknown): { firstName: string; lastName: string } => {
  const crudo = String(fullName ?? "").trim();
  // Forma "APELLIDOS, NOMBRES": la coma dice exactamente dónde está el corte,
  // así que no hay que adivinar nada. Aparece en las filas de docentes
  // sembradas a mano y en lo que imprime el horario oficial.
  if (crudo.includes(",")) {
    const [apellidos, ...resto] = crudo.split(",");
    return { lastName: apellidos.trim(), firstName: resto.join(",").trim() };
  }
  const partes = crudo.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { firstName: "", lastName: "" };
  if (partes.length === 1) return { firstName: partes[0], lastName: "" };
  const cuantosApellidos = partes.length === 2 ? 1 : 2;
  return {
    lastName: partes.slice(0, cuantosApellidos).join(" "),
    firstName: partes.slice(cuantosApellidos).join(" "),
  };
};
