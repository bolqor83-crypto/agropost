/**
 * ЭТАП 10 — конфигурация MAX Bot API.
 *
 * Приоритет env > Настройки → MAX (БД, AppSetting "max"):
 * на Render токен задаётся MAX_BOT_TOKEN, локально можно ввести в UI.
 * Ничего не задано — приложение работает как раньше (полуавто),
 * маршруты честно отвечают MAX_NOT_CONFIGURED.
 *
 * Токен бесплатный: MAX (max.ru) → раздел для разработчиков dev.max.ru →
 * «Чат-боты» → создать бота и скопировать access_token.
 * MAX_USER_ID — ваш ID в MAX (приходит апдейтом bot_started, когда
 * владелец пишет боту; можно увидеть в «Настройки → MAX» после подключения).
 */

import type { MaxConfig } from "./types.js";

export const MAX_API_BASE_DEFAULT = "https://platform-api2.max.ru";
export const DEFAULT_MAX_WEB_URL = "https://agropost-web.onrender.com";

/** Секция настроек из БД (AppSetting "max"). */
export interface MaxSettingsRow {
  token?: string | null;
  ownerId?: number | null;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function envNumber(name: string): number | null {
  const raw = env(name);
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Слияние env и настроек из БД: env-токен сильнее (как у Авито). */
export function resolveMaxConfig(settings: MaxSettingsRow | null): MaxConfig {
  const envToken = env("MAX_BOT_TOKEN") ?? null;
  const envOwnerId = envNumber("MAX_USER_ID");

  return {
    token: envToken ?? settings?.token ?? null,
    ownerId: envOwnerId ?? settings?.ownerId ?? null,
    apiBase: env("MAX_API_BASE") ?? MAX_API_BASE_DEFAULT,
    webUrl: env("MAX_WEB_URL") ?? DEFAULT_MAX_WEB_URL,
    fromEnv: envToken !== null,
  };
}

/** Клиент настроен (токен есть) — бот работает. */
export function isMaxConfigured(config: MaxConfig): boolean {
  return config.token !== null && config.token.length > 0;
}

/** Источник конфигурации для MaxStatusDTO.configuredFrom. */
export function maxConfiguredFrom(config: MaxConfig): "env" | "settings" | "none" {
  if (isMaxConfigured(config)) return config.fromEnv ? "env" : "settings";
  return "none";
}
