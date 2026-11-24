/**
 * ЭТАП 9 — конфигурация клиента Авито API.
 *
 * Приоритет env > Настройки → Авито API (БД, AppSetting "avito"):
 * на Render ключи задаются переменными AVITO_*, локально можно ввести
 * в UI. Ничего не задано — приложение работает как раньше (полуавто),
 * маршруты dry-run/publish честно отвечают AVITO_NOT_CONFIGURED.
 *
 * Ключи бесплатные: Авито → «Для бизнеса» → «Интеграции» → API
 * (client_id/client_secret, ИП/юрлицо). AVITO_USER_ID — id профиля.
 */

import type { AvitoCategoryMap } from "../../feeds/avito-xml.js";

export interface AvitoRuntimeConfig {
  clientId: string | null;
  clientSecret: string | null;
  /** Id профиля Авито (число аккаунта). */
  userId: string | null;
  /** Телефон продавца для ContactPhone в XML. */
  contactPhone: string | null;
  /** База API (тесты подменяют локальным сервером). */
  apiBase: string;
  /** Категории Авито по типу культуры (AVITO_CATEGORY_SEED/NUT). */
  categories: AvitoCategoryMap;
  /** true — конфигурация взята из env (UI-настройки игнорируются). */
  fromEnv: boolean;
}

/** Секция настроек из БД (AppSetting "avito"). */
export interface AvitoSettingsRow {
  clientId?: string | null;
  clientSecret?: string | null;
  userId?: string | null;
  phone?: string | null;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export const AVITO_API_BASE_DEFAULT = "https://api.avito.ru";

/**
 * Слияние env и настроек из БД. env-поля сильнее: если задан
 * AVITO_CLIENT_ID/SECRET — используются они, из БД добираются
 * остальные (userId, телефон).
 */
export function resolveAvitoConfig(settings: AvitoSettingsRow | null): AvitoRuntimeConfig {
  const envClientId = env("AVITO_CLIENT_ID") ?? null;
  const envClientSecret = env("AVITO_CLIENT_SECRET") ?? null;
  const envUserId = env("AVITO_USER_ID") ?? null;
  const envPhone = env("AVITO_CONTACT_PHONE") ?? null;

  const fromEnv = Boolean(envClientId && envClientSecret);

  return {
    clientId: envClientId ?? settings?.clientId ?? null,
    clientSecret: envClientSecret ?? settings?.clientSecret ?? null,
    userId: envUserId ?? settings?.userId ?? null,
    contactPhone: envPhone ?? settings?.phone ?? null,
    apiBase: env("AVITO_API_BASE") ?? AVITO_API_BASE_DEFAULT,
    categories: {
      seed: env("AVITO_CATEGORY_SEED") ?? "Товары для дома и дачи",
      nut: env("AVITO_CATEGORY_NUT") ?? "Продукты питания",
    },
    fromEnv,
  };
}

/** Клиент настроен и готов к OAuth (обязательны пара client_id+secret). */
export function isAvitoConfigured(config: AvitoRuntimeConfig): boolean {
  return Boolean(config.clientId && config.clientSecret);
}
