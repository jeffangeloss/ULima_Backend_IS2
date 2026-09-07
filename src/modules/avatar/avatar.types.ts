import type { RolModerador } from "./avatar.logic.js";

/** Lo que la app necesita para subir directo a Cloudinary. El secreto NO va acá. */
export interface FirmaSubida {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
}

export interface AvatarGuardado {
  publicId: string | null;
  version: string | null;
  updatedAt: Date | null;
}

export type { RolModerador };
