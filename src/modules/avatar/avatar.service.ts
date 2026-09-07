import { config } from "../../config/app-config.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  firmaDeBorrado, firmaDeSubida, paramsAFirmar, publicIdDe, puedeQuitarAvatar,
} from "./avatar.logic.js";
import type { AvatarRepository } from "./avatar.repository.js";
import type { FirmaSubida } from "./avatar.types.js";

/** Cloudinary no configurado: la feature está apagada y todos se ven con
 *  iniciales. 503 y no 500 porque no es un fallo, es un estado del servicio. */
const apagado = () =>
  new HttpError(503, "Las fotos de perfil no están habilitadas.", "AVATAR_DISABLED");

export class AvatarService {
  constructor(
    private readonly repository: AvatarRepository,
    /** Inyectable para poder probar el borrado sin salir a la red. */
    private readonly destruirEnCloudinary = destruirImagen,
  ) {}

  /**
   * Datos para que la APP suba directo a Cloudinary.
   *
   * El backend no toca los bytes: Vercel corta los cuerpos en 4.5 MB y una foto
   * de cámara los pasa. La firma fija el `public_id`, así que aunque se
   * intercepte solo sirve para sobrescribir la foto de su propio dueño.
   */
  firmarSubida(userId: number): FirmaSubida {
    if (!config.cloudinary.enabled) throw apagado();
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = publicIdDe(userId);
    return {
      cloudName: config.cloudinary.cloudName,
      apiKey: config.cloudinary.apiKey,
      timestamp,
      signature: firmaDeSubida({ publicId, timestamp, apiSecret: config.cloudinary.apiSecret }),
      publicId,
    };
  }

  /**
   * Confirma una subida ya hecha. Sin esto la imagen existe en Cloudinary pero
   * la app no la muestra: la base es la fuente de verdad.
   */
  async confirmar(userId: number, version: string): Promise<void> {
    if (!config.cloudinary.enabled) throw apagado();
    await this.repository.guardar(userId, publicIdDe(userId), version);
  }

  /**
   * Quita la foto de `objetivoUserId`. El dueño siempre puede; y en una sección
   * compartida, su delegado, subdelegado, docente o jefe de práctica.
   */
  async quitar(solicitanteUserId: number, objetivoUserId: number): Promise<void> {
    if (!(await this.repository.existeUsuario(objetivoUserId))) {
      throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");
    }
    const rolEnSeccionCompartida = solicitanteUserId === objetivoUserId
      ? null
      : await this.repository.rolEnSeccionCompartida(solicitanteUserId, objetivoUserId);
    if (!puedeQuitarAvatar({ solicitanteUserId, objetivoUserId, rolEnSeccionCompartida })) {
      throw new HttpError(403, "No puedes quitar la foto de esta persona.", "AVATAR_FORBIDDEN");
    }

    const publicId = await this.repository.publicIdDe(objetivoUserId);
    await this.repository.borrar(objetivoUserId);
    if (!publicId) return;

    // Se borra también en Cloudinary: anular solo la columna dejaría la imagen
    // accesible por URL para quien la hubiera guardado. Si eso falla, la fila
    // YA quedó limpia y no se revierte — para quien pidió que le quiten la
    // foto, lo que importa es que la app deje de mostrarla.
    try {
      await this.destruirEnCloudinary(publicId);
    } catch (e) {
      console.error("No se pudo borrar la imagen en Cloudinary", { publicId, error: (e as Error).message });
    }
  }
}

/** Borrado real en Cloudinary. Fuera de la clase para poder sustituirlo en tests. */
async function destruirImagen(publicId: string): Promise<void> {
  if (!config.cloudinary.enabled) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: config.cloudinary.apiKey,
    signature: firmaDeBorrado({ publicId, timestamp, apiSecret: config.cloudinary.apiSecret }),
  });
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/destroy`,
    { method: "POST", body, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`Cloudinary respondió ${res.status}`);
}

export { paramsAFirmar };
