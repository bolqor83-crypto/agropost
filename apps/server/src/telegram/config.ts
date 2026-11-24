/**
 * Конфиг Telegram-модуля из env.
 *
 * На Render вебхук выводится сам: TELEGRAM_WEBHOOK_URL, а если её нет —
 * из автоматического RENDER_EXTERNAL_URL (Render подставляет свой домен
 * сервиса). Секрет: TELEGRAM_WEBHOOK_SECRET либо детерминированный
 * sha256("agropost:" + token) — стабилен между рестартами, чтобы
 * спящий инстанс не потерял валидацию заголовка.
 */

import { createHash } from "node:crypto";
import type { TelegramConfig } from "./types.js";

export const DEFAULT_WEB_URL = "https://agropost-web.onrender.com";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function derivedWebhookUrl(): string | null {
  const base = env("RENDER_EXTERNAL_URL");
  return base ? `${base.replace(/\/+$/, "")}/api/telegram/webhook` : null;
}

/** Детерминированный секрет: не печатается, не уходит в репозиторий. */
export function deriveWebhookSecret(token: string): string {
  return createHash("sha256").update(`agropost:${token}`).digest("hex").slice(0, 32);
}

export function loadTelegramConfig(): TelegramConfig {
  const token = env("TELEGRAM_BOT_TOKEN") ?? "";
  const ownerIdRaw = env("TELEGRAM_USER_ID");
  const ownerId = ownerIdRaw ? Number(ownerIdRaw) : null;
  return {
    token,
    ownerId: ownerId !== null && Number.isFinite(ownerId) ? ownerId : null,
    webUrl: env("TELEGRAM_WEB_URL") ?? DEFAULT_WEB_URL,
    webhookUrl: env("TELEGRAM_WEBHOOK_URL") ?? derivedWebhookUrl(),
    webhookSecret: env("TELEGRAM_WEBHOOK_SECRET") ?? (token ? deriveWebhookSecret(token) : ""),
  };
}
