import { db } from "../../db/index.js";
import { AvatarController } from "./avatar.controller.js";
import { AvatarRepository } from "./avatar.repository.js";
import { createAvatarRoutes } from "./avatar.routes.js";
import { AvatarService } from "./avatar.service.js";

const avatarRepository = new AvatarRepository(db);
const avatarService = new AvatarService(avatarRepository);
const avatarController = new AvatarController(avatarService);

export const avatarRoutes = createAvatarRoutes(avatarController);

export { AvatarController } from "./avatar.controller.js";
export { AvatarRepository } from "./avatar.repository.js";
export { AvatarService } from "./avatar.service.js";
export { createAvatarRoutes } from "./avatar.routes.js";
export {
  TRANSFORMACION_AVATAR, construirUrlAvatar, firmaDeBorrado, firmaDeSubida,
  publicIdDe, puedeQuitarAvatar,
} from "./avatar.logic.js";
