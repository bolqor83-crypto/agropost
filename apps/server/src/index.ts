/**
 * Точка входа API АгроПост. Сборка приложения — в app.ts (этап 5.1:
 * авторизация владельца + закрытые приватные маршруты).
 *
 * ЭТАП «СЕКРЕТЫ»: до импорта модулей, которые читают env один раз
 * (AI-gateway, Telegram), инжектируем сохранённые секреты из AppSetting
 * в process.env — платформенный env (Render) остаётся приоритетнее.
 */

import "dotenv/config";
import { injectStoredSecretsIntoEnv } from "./settings/secrets.js";

/* Секреты из «Настройок» → env (секция "secrets": фиды, AI, Telegram).
   Ошибка БД не роняет API — приложение стартует на одном env. */
await injectStoredSecretsIntoEnv().catch(() => undefined);

/* Импортируем приложение ПОСЛЕ инжекции: AI-gateway строит провайдеров
   из env в момент импорта модуля. */
const { buildApp } = await import("./app.js");
const { getTelegram, setupWebhookAtStartup } = await import("./telegram/index.js");

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

/* ЭТАП 10: MAX-бот — long polling апдейтов (GET /updates, marker),
   стартует фоном, если задан токен (env ⋁ Настройки → MAX).
   Ошибки внутри цикла не роняют сервис (backoff в poller.ts). */
const { buildMaxDeps } = await import("./max/runtime.js");
const { startMaxPolling } = await import("./max/poller.js");
const maxDeps = await buildMaxDeps();
if (maxDeps) {
  startMaxPolling(maxDeps, {
    info: (msg) => app.log.info(msg),
    error: (err) => app.log.error(err),
  });
} else {
  app.log.info("MAX-бот не настроен — long polling не запускается (приложение работает как раньше)");
}
