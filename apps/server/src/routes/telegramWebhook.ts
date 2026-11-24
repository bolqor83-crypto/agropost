/**
 * POST /api/telegram/webhook — приём апдейтов Telegram (часть B ТЗ).
 * Публичный маршрут (Telegram не умеет в наш auth) — защищён секретом
 * X-Telegram-Bot-Api-Secret-Token. Ошибки глушим: Telegram ретраит
 * не-200 бесконечно, поэтому обработанные апдейты всегда дают 200.
 *
 * Этап 5.1 (fail-closed):
 * - секрет обязателен: пустой секрет в production → 403, приём выключен
 *   (раньше пустая строка «совпадала» с пустым заголовком — fail-open);
 * - сравнение в постоянном времени (timing-safe);
 * - Ошибки не возвращаем Telegram, но логируем.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { safeEqual } from "../auth/sessions.js";
import { handleTelegramUpdate } from "../telegram/update.js";
import type { TelegramDeps, TgUpdate } from "../telegram/types.js";

export function telegramWebhookRoutes(deps: TelegramDeps) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post("/api/telegram/webhook", async (req, reply: FastifyReply) => {
      const secret = deps.cfg.webhookSecret;
      const header = req.headers["x-telegram-bot-api-secret-token"];
      const provided = typeof header === "string" ? header : null;

      /* Секрет не настроен — приём апдейтов выключен (fail-closed). */
      if (!secret) {
        app.log.warn("TELEGRAM_WEBHOOK_SECRET не задан — webhook приём отключён (fail-closed)");
        return reply
          .code(403)
          .send({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Секрет webhook не настроен" } });
      }
      if (provided === null || !safeEqual(provided, secret)) {
        return reply
          .code(401)
          .send({ error: { code: "UNAUTHORIZED", message: "Неверный секрет webhook" } });
      }

      try {
        await handleTelegramUpdate(req.body as TgUpdate, deps);
      } catch (err) {
        app.log.error(err);
      }
      /* Telegram ждёт 200: ошибки не возвращаем, чтобы не было ретраев. */
      return { ok: true };
    });
  };
}
