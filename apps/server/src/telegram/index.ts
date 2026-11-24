/**
 * Сборка Telegram-модуля: grammY Bot (транспорт), конфиг, БД,
 * уведомитель, кэш getMe. Роуты импортируют getTelegram().
 */

import { Bot } from "grammy";
import { loadTelegramConfig } from "./config.js";
import { createTgApi } from "./api.js";
import { prismaTelegramDb } from "./db.js";
import { OwnerNotifier } from "./notifier.js";
import type { TelegramConfig, TelegramDeps, TgApi } from "./types.js";

export interface TelegramModule {
  cfg: TelegramConfig;
  /** null — токен не задан, бот не работает (все ручки вернут «не настроен»). */
  api: TgApi | null;
  deps: TelegramDeps;
}

let instance: TelegramModule | null = null;

/** Кэш getMe: username бота нужен для deep link в объявлениях. */
function memoBotInfo(api: TgApi): () => Promise<{ id: number; username: string } | null> {
  let cache: { id: number; username: string } | null | undefined;
  return async () => {
    if (cache !== undefined) return cache;
    try {
      const me = await api.getMe();
      cache = me.username ? { id: me.id, username: me.username } : null;
    } catch {
      cache = null;
    }
    return cache;
  };
}

export function getTelegram(): TelegramModule {
  if (instance) return instance;

  const cfg = loadTelegramConfig();
  let api: TgApi | null = null;

  if (cfg.token) {
    const bot = new Bot(cfg.token);
    api = createTgApi(bot);
  }

  const botInfo = api
    ? memoBotInfo(api)
    : (async () => null) satisfies () => Promise<{ id: number; username: string } | null>;

  const notify = new OwnerNotifier({
    api,
    ownerId: cfg.ownerId ?? 0,
    webUrl: cfg.webUrl,
    onError: () => undefined,
  });

  instance = {
    cfg,
    api,
    deps: {
      cfg,
      api: api as TgApi,
      db: prismaTelegramDb,
      notify,
      botInfo,
    },
  };
  return instance;
}

/** setWebhook при старте (часть B ТЗ) — фоном, не блокируя прослушивание. */
export async function setupWebhookAtStartup(
  api: TgApi,
  cfg: TelegramConfig,
  log: { info: (msg: string) => void; error: (err: unknown) => void },
): Promise<void> {
  if (!cfg.webhookUrl) {
    log.info("TELEGRAM_WEBHOOK_URL не задан и RENDER_EXTERNAL_URL не найден — webhook не ставится");
    return;
  }
  try {
    await api.setWebhook(cfg.webhookUrl, cfg.webhookSecret);
    const info = await api.getWebhookInfo();
    log.info(`webhook установлен: ${info.url ?? cfg.webhookUrl} (в очереди: ${info.pending_update_count})`);
  } catch (err) {
    log.error(err);
  }
}
