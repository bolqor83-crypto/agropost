/**
 * Точка входа API АгроПост. Сборка приложения — в app.ts (этап 5.1:
 * авторизация владельца + закрытые приватные маршруты).
 */

import { buildApp } from "./app.js";
import { getTelegram, setupWebhookAtStartup } from "./telegram/index.js";
import "dotenv/config";

const app = await buildApp();

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/* setWebhook при старте (фоном): free tier просыпается апдейтом.
   URL — ТОЛЬКО из серверной конфигурации (TELEGRAM_WEBHOOK_URL или
   RENDER_EXTERNAL_URL): клиент произвольный адрес задать не может. */
const telegram = getTelegram();
if (telegram.api) {
  void setupWebhookAtStartup(telegram.api, telegram.cfg, {
    info: (msg) => app.log.info(msg),
    error: (err) => app.log.error(err),
  });
}
