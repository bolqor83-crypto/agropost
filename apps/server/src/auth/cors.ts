/**
 * CORS: только доверенные origin из конфигурации (этап 5.1).
 * credentials — только для них; произвольные origin не получают
 * CORS-заголовков (браузер сам не даст прочитать ответ).
 *
 * TRUSTED_ORIGINS (env, через запятую) — например:
 *   https://agropost-web.onrender.com,https://my-domain.ru
 * По умолчанию: публичный домен веб-приложения + localhost для разработки.
 */

import { env } from "./env.js";
import type { FastifyCorsOptions } from "@fastify/cors";

const DEFAULT_ORIGINS = [
  "https://agropost-web.onrender.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://localhost:3000",
];

/** Список доверенных origin (нормализованные). */
export function trustedOrigins(): string[] {
  const raw = env("TRUSTED_ORIGINS");
  const list = raw
    ? raw.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean)
    : DEFAULT_ORIGINS;
  return [...new Set(list.map((o) => o.toLowerCase()))];
}

/** Настройка @fastify/cors для доверенных origin с credentials.
 * origin — callback-форма (boolean-форма в @fastify/cors не вызывает
 * колбэк и вешает запрос). Сервер-сервер без Origin: без CORS-заголовков,
 * но запрос проходит (CORS — только браузерная политика). */
export function corsOptions(): FastifyCorsOptions {
  const allowed = trustedOrigins();
  const originFn = (
    origin: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void,
  ): void => {
    if (!origin) {
      cb(null, false);
      return;
    }
    cb(null, allowed.includes(origin.replace(/\/+$/, "").toLowerCase()));
  };
  return {
    origin: originFn as FastifyCorsOptions["origin"],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  };
}
