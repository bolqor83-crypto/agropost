/**
 * POST /api/telegram/webhook — приём апдейтов Telegram (часть B ТЗ).
 * Публичный маршрут (Telegram не умеет в наш auth) — защищён секретом
 * X-Telegram-Bot-Api-Secret-Token. Ошибки глушим: Telegram ретраит
 * не-200 бесконечно, поэтому всегда отвечаем ok.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { handleTelegramUpdate } from "../telegram/update.js";
import type { TelegramDeps, TgUpdate } from "../telegram/types.js";

export function telegramWebhookRoutes(deps: TelegramDeps) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post("/api/telegram/webhook", async (req, reply: FastifyReply) => {
      const header = req.headers["x-telegram-bot-api-secret-token"];
      if (typeof header !== "string" || header !== deps.cfg.webhookSecret) {
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
