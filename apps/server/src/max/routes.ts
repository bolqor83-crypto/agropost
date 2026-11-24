/**
 * ЭТАП 10 — /api/max/*: статус бота, настройки (токен), проверка
 * подключения и публикация в свой MAX-канал.
 *
 * Все маршруты за авторизацией владельца (глобальный guard). Бот не
 * настроен (нет MAX_BOT_TOKEN и токена в Настройках) — приложение
 * работает как раньше: status честно отвечает configured=false,
 * publish/check — 503 MAX_NOT_CONFIGURED (полуавто не ломается).
 */

import type { FastifyInstance } from "fastify";
import { ApiError, badRequest } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import { isMaxConfigured } from "./config.js";
import { publishListingViaMaxBot } from "./publish.js";
import {
  currentMaxConfig,
  maxSettingsFromDb,
  resolveMaxDeps,
  saveMaxSettings,
  maxConfiguredSource,
} from "./runtime.js";
import type {
  MaxPublishDTO,
  MaxSettingsDTO,
  MaxStatusDTO,
  MaxCheckDTO,
} from "@shared/types";
import { z } from "zod";

export const maxPublishSchema = z.object({
  listingId: z.string().min(1),
  chatId: z.number().int().positive().optional(),
  confirm: z.boolean().optional(),
});

export const maxSettingsSchema = z.object({
  token: z
    .string()
    .trim()
    .min(10, "Токен MAX-бота слишком короткий")
    .max(512)
    .optional()
    .nullable(),
  ownerId: z.number().int().positive().optional().nullable(),
});

export async function maxRoutes(app: FastifyInstance): Promise<void> {
  /* Статус: бот, режим, новые лиды, MAX-каналы с привязками chat_id.
     Без токена — ни одного обращения к БД (status не падает в песочнице). */
  app.get("/api/max/status", async () => {
    const config = await currentMaxConfig();
    const configured = isMaxConfigured(config);

    const result: MaxStatusDTO = {
      ok: true,
      configured,
      configuredFrom: maxConfiguredSource(config),
      mode: "long-polling",
      bot: null,
      newLeads: 0,
      leadsToday: 0,
      channels: [],
      discovered: [],
    };

    if (configured) {
      const deps = await resolveMaxDeps();
      if (deps) {
        result.newLeads = await deps.db.countNewLeads();
        result.leadsToday = await deps.db.countLeadsToday();
        const [channels, bindings, discovered] = await Promise.all([
          deps.db.listMaxChannels(),
          deps.db.listChatBindings(),
          deps.db.listDiscoveredChats(),
        ]);
        result.channels = channels.map((c) => ({
          channelId: c.id,
          name: c.name,
          chatId: bindings.find((b) => b.channelId === c.id)?.chatId ?? null,
        }));
        result.discovered = discovered.map((d) => ({
          chatId: d.chatId,
          title: d.title,
          type: d.type,
        }));
        const me = await deps.botInfo();
        if (me) {
          result.bot = {
            username: me.username,
            url: me.username ? `https://max.ru/${me.username}` : null,
          };
        }
      }
    }
    return result;
  });

  /* Настройки (токен) — секрет маскируется, env-токен не отдаётся. */
  app.get("/api/max/settings", async () => {
    const config = await currentMaxConfig();
    const settings = await maxSettingsFromDb();
    const dto: MaxSettingsDTO = {
      tokenSet: Boolean(settings?.token),
      ownerId: settings?.ownerId ?? null,
      fromEnv: config.fromEnv,
    };
    return dto;
  });

  app.put("/api/max/settings", async (req) => {
    const config = await currentMaxConfig();
    if (config.fromEnv) {
      throw badRequest("Токен задан переменной окружения MAX_BOT_TOKEN — правка в UI недоступна (env имеет приоритет)");
    }
    const input = parseOrThrow(maxSettingsSchema, req.body ?? {});
    const current = (await maxSettingsFromDb()) ?? {};
    await saveMaxSettings({
      token: input.token !== undefined ? input.token : current.token ?? null,
      ownerId: input.ownerId !== undefined ? input.ownerId : current.ownerId ?? null,
    });
    const settings = await maxSettingsFromDb();
    const dto: MaxSettingsDTO = {
      tokenSet: Boolean(settings?.token),
      ownerId: settings?.ownerId ?? null,
      fromEnv: false,
    };
    return dto;
  });

  /* «Проверить подключение» — реальный GET /me. */
  app.post("/api/max/check", async () => {
    const deps = await resolveMaxDeps();
    if (!deps) {
      throw new ApiError(
        503,
        "MAX_NOT_CONFIGURED",
        "MAX-бот не настроен: задайте MAX_BOT_TOKEN или введите токен в «Настройки → MAX»",
      );
    }
    try {
      const me = await deps.api.getMe();
      const dto: MaxCheckDTO = {
        ok: true,
        botOk: true,
        username: me.username,
        firstName: me.firstName,
      };
      return dto;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "неизвестная ошибка";
      const dto: MaxCheckDTO = {
        ok: true,
        botOk: false,
        username: null,
        firstName: null,
        error: reason,
      };
      return dto;
    }
  });

  /* Публикация черновика в свой MAX-канал через бота. */
  app.post("/api/max/publish", async (req) => {
    const deps = await resolveMaxDeps();
    if (!deps) {
      throw new ApiError(
        503,
        "MAX_NOT_CONFIGURED",
        "MAX-бот не настроен: задайте MAX_BOT_TOKEN или введите токен в «Настройки → MAX»",
      );
    }
    const input = parseOrThrow(maxPublishSchema, req.body ?? {});
    const result = await publishListingViaMaxBot(input, deps);
    const response: MaxPublishDTO = {
      ok: true,
      listingId: result.listingId,
      chatId: result.chatId,
      url: result.url,
      publishedAt: result.publishedAt,
      ...(result.warning ? { warning: result.warning } : {}),
    };
    return response;
  });
}
