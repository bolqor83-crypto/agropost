/**
 * ЭТАП 9 — конфигурация фидов из env.
 *
 * FEED_TOKEN — случайная строка ~32 символа (openssl rand -hex 16).
 * Не задан — фиды отключены: /api/feeds/* отвечает 403 и не раскрывает
 * структуру; приложение продолжает работать в полуавтоматическом режиме.
 *
 * FEED_SHOP_URL — публичная витрина для ссылок офферов (прод-домен web).
 * PUBLIC_API_URL — публичный адрес API: по нему Авито забирает фид
 * (на Render подставляется RENDER_EXTERNAL_URL автоматически).
 */

import { FEED_CACHE_TTL_MS_DEFAULT, type FeedConfig } from "./types.js";

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Токен фида: значимы и hex, и base64-строки — главное длина. */
export function readFeedToken(): string | null {
  const raw = env("FEED_TOKEN") ?? null;
  if (raw === null) return null;
  if (raw.length < 16) return null; /* короткий токен не считаем секретом */
  return raw;
}

/**
 * Действующий токен фида: env ⋁ секрет из AppSetting («Настройки» → «Фиды»).
 * Проверка подключения и выдача ссылок используют этот резолвер.
 */
export async function resolveFeedToken(): Promise<string | null> {
  const envToken = readFeedToken();
  if (envToken !== null) return envToken;
  const { getSecretValue } = await import("../settings/secrets.js");
  const stored = await getSecretValue("FEED_TOKEN").catch(() => null);
  if (stored === null || stored.length < 16) return null;
  return stored;
}

/** Конфиг с действующим токеном (env ⋁ БД) — для маршрутов и проверок. */
export async function loadFeedConfigAsync(): Promise<FeedConfig> {
  const config = loadFeedConfig();
  if (config.token !== null) return config;
  return { ...config, token: await resolveFeedToken() };
}

export function loadFeedConfig(): FeedConfig {
  const shopUrl =
    env("FEED_SHOP_URL") ??
    env("RENDER_WEB_URL") ??
    env("TELEGRAM_WEB_URL") ??
    "https://agropost-web.onrender.com";
  const publicApiUrl =
    env("PUBLIC_API_URL") ?? env("RENDER_EXTERNAL_URL") ?? "http://localhost:3001";
  const ttlRaw = Number(env("FEED_CACHE_TTL_MS") ?? "");
  return {
    token: readFeedToken(),
    shopUrl: shopUrl.replace(/\/+$/, ""),
    publicApiUrl: publicApiUrl.replace(/\/+$/, ""),
    cacheTtlMs: Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : FEED_CACHE_TTL_MS_DEFAULT,
  };
}

/** Полные адреса фидов (с токеном) — для кабинетов площадок и dry-run. */
export function feedUrls(config: FeedConfig): { yml: string | null; avito: string | null } {
  if (!config.token) return { yml: null, avito: null };
  const t = encodeURIComponent(config.token);
  return {
    yml: `${config.publicApiUrl}/api/feeds/yml?token=${t}`,
    avito: `${config.publicApiUrl}/api/feeds/avito?token=${t}`,
  };
}
