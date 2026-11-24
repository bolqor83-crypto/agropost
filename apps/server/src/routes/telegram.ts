/**
 * /api/telegram/* — статус бота, ручная установка webhook,
 * публикация в свои каналы (часть C/D ТЗ, этап 3.2).
 */

import type { FastifyInstance } from "fastify";
import { ApiError, badRequest } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import { telegramPublishSchema, telegramSetupWebhookSchema } from "../validation.js";
import { getTelegram } from "../telegram/index.js";
import { publishListingViaBot } from "../telegram/publish.js";
import type { TelegramPublishDTO, TelegramStatusDTO } from "@shared/types";

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  /* Статус: бот, webhook, новые лиды, свои каналы. */
  app.get("/api/telegram/status", async () => {
    const telegram = getTelegram();
    const result: TelegramStatusDTO = {
      ok: true,
      configured: Boolean(telegram.api),
      bot: null,
      webhook: null,
      newLeads: 0,
      leadsToday: 0,
      channels: [],
    };

    if (!telegram.api) {
      result.newLeads = await telegram.deps.db.countNewLeads();
      result.leadsToday = await telegram.deps.db.countLeadsToday();
      return result;
    }

    const me = await telegram.deps.botInfo();
    if (me) {
      result.bot = { username: me.username, url: `https://t.me/${me.username}` };
    }
    try {
      const info = await telegram.api.getWebhookInfo();
      result.webhook = info.url
        ? {
            url: info.url,
            pendingUpdateCount: info.pending_update_count,
            ...(info.last_error_message ? { lastErrorMessage: info.last_error_message } : {}),
          }
        : null;
    } catch {
      /* Telegram недоступен — оставляем null, не роняем статус. */
    }
    result.newLeads = await telegram.deps.db.countNewLeads();
    result.leadsToday = await telegram.deps.db.countLeadsToday();
    result.channels = (await telegram.deps.db.listBotChannels()).map((c) => ({
      channelId: c.channelId,
      name: c.name,
      url: c.url,
    }));
    return result;
  });

  /* Ручная установка webhook (если Render перезапустился и авто-сетап не сработал). */
  app.post("/api/telegram/setup-webhook", async (req) => {
    const telegram = getTelegram();
    if (!telegram.api) {
      throw new ApiError(503, "TELEGRAM_NOT_CONFIGURED", "Бот не настроен: задайте TELEGRAM_BOT_TOKEN");
    }
    const input = parseOrThrow(telegramSetupWebhookSchema, req.body ?? {});
    const url = input.url ?? telegram.cfg.webhookUrl;
    if (!url) {
      throw badRequest(
        "URL не задан: передайте url в теле или установите TELEGRAM_WEBHOOK_URL (на Render выводится автоматически)",
      );
    }
    await telegram.api.setWebhook(url, telegram.cfg.webhookSecret);
    const info = await telegram.api.getWebhookInfo();
    return {
      ok: true,
      webhook: {
        url: info.url ?? url,
        pendingUpdateCount: info.pending_update_count,
        ...(info.last_error_message ? { lastErrorMessage: info.last_error_message } : {}),
      },
    };
  });

  /* Публикация черновика в свой канал через бота. */
  app.post("/api/telegram/publish", async (req) => {
    const telegram = getTelegram();
    if (!telegram.api) {
      throw new ApiError(503, "TELEGRAM_NOT_CONFIGURED", "Бот не настроен: задайте TELEGRAM_BOT_TOKEN");
    }
    const input = parseOrThrow(telegramPublishSchema, req.body ?? {});
    const result = await publishListingViaBot(input, telegram.deps);
    const response: TelegramPublishDTO = {
      ok: true,
      listingId: result.listingId,
      url: result.url,
      publishedAt: result.publishedAt,
      ...(result.warning ? { warning: result.warning } : {}),
    };
    return response;
  });
}
