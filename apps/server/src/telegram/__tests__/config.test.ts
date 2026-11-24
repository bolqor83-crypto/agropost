/**
 * Тесты конфига Telegram-модуля: детерминированный секрет вебхука
 * (стабилен между рестартами), вывод webhookUrl из RENDER_EXTERNAL_URL.
 */

import { describe, expect, test } from "bun:test";
import { deriveWebhookSecret, loadTelegramConfig } from "../config.js";

describe("Конфиг Telegram", () => {
  test("секрет детерминирован: одинаковый токен → одинаковый секрет", () => {
    const a = deriveWebhookSecret("bot-token-1");
    const b = deriveWebhookSecret("bot-token-1");
    const c = deriveWebhookSecret("bot-token-2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBe(32);
  });

  test("webhookUrl выводится из RENDER_EXTERNAL_URL", () => {
    const prev = process.env.RENDER_EXTERNAL_URL;
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.RENDER_EXTERNAL_URL = "https://agropost-api.onrender.com/";
    process.env.TELEGRAM_BOT_TOKEN = "t";
    try {
      const cfg = loadTelegramConfig();
      expect(cfg.webhookUrl).toBe("https://agropost-api.onrender.com/api/telegram/webhook");
      expect(cfg.webhookSecret).toBe(deriveWebhookSecret("t"));
    } finally {
      if (prev === undefined) delete process.env.RENDER_EXTERNAL_URL;
      else process.env.RENDER_EXTERNAL_URL = prev;
      if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    }
  });

  test("без env: токен пуст, бот не настроен", () => {
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "";
    try {
      const cfg = loadTelegramConfig();
      expect(cfg.token).toBe("");
      expect(cfg.webhookSecret).toBe("");
    } finally {
      if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    }
  });
});
