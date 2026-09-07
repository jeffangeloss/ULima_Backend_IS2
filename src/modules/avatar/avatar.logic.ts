/**
 * Lógica PURA de las fotos de perfil: firma de subida, construcción de la URL y
 * quién puede quitarle la foto a quién. Sin red ni base de datos.
 *
 * Las imágenes viven en Cloudinary y la base guarda solo el identificador. La
 * app sube DIRECTO a Cloudinary con una firma que emite este backend: Vercel
 * corta los cuerpos de petición en 4.5 MB y una foto de cámara los pasa, y
 * proxear los bytes gastaría tiempo de función sin ganar nada.
 */
import { createHash } from "node:crypto";

/**
 * Recorte cuadrado centrado en la cara, con formato y calidad decididos por el
 * CDN (WebP donde se pueda). Los avatares se pintan a 40 px en las listas:
 * servir la foto original gastaría datos móviles de los alumnos sin que se note.
 */
export const TRANSFORMACION_AVATAR = "w_160,h_160,c_fill,g_face,f_auto,q_auto";

const CARPETA_AVATARES = "ulima/avatars";

/** Identificador en Cloudinary. Determinista: una sola foto por persona, volver
 *  a subir la reemplaza, y no quedan huérfanas acumulándose en la cuenta. */
export const publicIdDe = (userId: number): string => `${CARPETA_AVATARES}/${userId}`;

/**
 * Parámetros que entran en la firma. Cloudinary excluye `file`, `cloud_name`,
 * `resource_type` y `api_key`.
 *
 * Fijar `public_id` es lo que hace segura esta firma: aunque alguien la
 * intercepte, solo le sirve para sobrescribir la foto de su propio dueño.
 */
export const paramsAFirmar = (input: { publicId: string; timestamp: number }): Record<string, string> => ({
  invalidate: "true",   // purga el CDN al reemplazar
  overwrite: "true",    // reemplazar es el caso normal
  public_id: input.publicId,
  timestamp: String(input.timestamp),
});

/** sha1 de los parámetros ordenados alfabéticamente como `k=v` unidos por `&`,
 *  más el secreto. Es el algoritmo que Cloudinary especifica para ambas firmas. */
const firmar = (params: Record<string, string>, apiSecret: string): string =>
  createHash("sha1")
    .update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&") + apiSecret)
    .digest("hex");

/** Firma de subida. */
export const firmaDeSubida = (input: { publicId: string; timestamp: number; apiSecret: string }): string =>
  firmar(paramsAFirmar(input), input.apiSecret);

/** Firma para BORRAR la imagen. Va aparte de la de subida porque el borrado no
 *  lleva `overwrite` ni `invalidate`, y firmar de más hace que Cloudinary
 *  rechace la petición. */
export const firmaDeBorrado = (input: { publicId: string; timestamp: number; apiSecret: string }): string =>
  firmar({ public_id: input.publicId, timestamp: String(input.timestamp) }, input.apiSecret);

/**
 * URL pública de la foto, construida al vuelo y NUNCA guardada: con la URL
 * persistida no se podría cambiar la transformación después ni borrar la imagen.
 *
 * Devuelve `null` cuando no hay foto o falta configuración, y quien la muestre
 * cae a las iniciales — que es exactamente el estado de hoy.
 */
export const construirUrlAvatar = (input: {
  cloudName: string; publicId: string | null; version: string | null;
}): string | null => {
  if (!input.cloudName || !input.publicId) return null;
  const version = input.version ? `v${input.version}/` : "";
  return `https://res.cloudinary.com/${input.cloudName}/image/upload/${TRANSFORMACION_AVATAR}/${version}${input.publicId}`;
};

/** Rol de quien pide, en una sección que COMPARTE con el objetivo. `null` = o no
 *  comparten sección, o es un compañero sin cargo. */
export type RolModerador = "delegate" | "subdelegate" | "teacher" | "jp" | null;

/**
 * ¿Puede quitarle la foto? El dueño siempre; y en una sección compartida, su
 * delegado, subdelegado, docente o jefe de práctica.
 *
 * Que el rol llegue en `null` es cómo se expresa "no comparten sección": el
 * repositorio solo devuelve rol si hay una en común, así que ser delegado de
 * otro curso no da ningún poder acá.
 */
export const puedeQuitarAvatar = (input: {
  solicitanteUserId: number; objetivoUserId: number; rolEnSeccionCompartida: RolModerador;
}): boolean =>
  input.solicitanteUserId === input.objetivoUserId || input.rolEnSeccionCompartida !== null;
