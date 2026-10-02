import { db } from "../../db/index.js";
import { modoEstatico } from "../app-setting/index.js";
import { scheduleService } from "../schedule/index.js";
// RS-BE-35: el único archivo del chatbot que importa esta función como valor.
import { readOwnTimeBlocksForAssistant } from "../time-blocks/index.js";
import { ChatbotRepository } from "./chatbot.repository.js";
import { ChatbotService } from "./chatbot.service.js";
import { ChatbotController } from "./chatbot.controller.js";
import { createChatbotRoutes } from "./chatbot.routes.js";

// RF-EST-8 y RF-IRM-3. El repositorio consulta el lector del modo en cada `getAlerts`, y se
// exporta para que la sonda de las pruebas compruebe su cableado.
export const chatbotRepository = new ChatbotRepository(db, { modoEstatico });

export const chatbotRoutes = (() => {
  const service = new ChatbotService(chatbotRepository, scheduleService, readOwnTimeBlocksForAssistant);
  const controller = new ChatbotController(service);
  return createChatbotRoutes(controller);
})();
