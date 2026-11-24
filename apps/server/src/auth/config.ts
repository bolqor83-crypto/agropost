/**
 * Конфиг авторизации владельца (этап 5.1).
 *
 * Пароль НЕ хранится ни в базе, ни в env открытым текстом: в env лежит
 * только Argon2id-хеш (OWNER_PASSWORD_HASH). Получить хеш для своего
 * пароля: `bun run hash-password` (scripts/hash-password.ts) — хеш
 * печатается локально у владельца, в репозиторий не попадает.
 *
 * Fail-closed: без OWNER_PASSWORD_HASH логин запрещён (503), приватные
 * маршруты остаются закрытыми — попасть в приложение нельзя.
 */

import { env } from "./env.js";

export interface AuthConfig {
  /** Логин владельца (не секрет; по умолчанию «agropost»). */
  login: string;
  /** Argon2id-хеш пароля владельца; null — авторизация не настроена. */
  passwordHash: string | null;
  /** Срок сессии, часы. */
  sessionTtlHours: number;
  /** Максимум неудачных попыток входа за окно. */
  loginMaxAttempts: number;
  /** Окно ограничения попыток входа, минуты. */
  loginWindowMinutes: number;
  /** Cookie-флаг Secure (production); локально по http можно выключить. */
  secureCookie: boolean;
}

export function loadAuthConfig(): AuthConfig {
  const passwordHash = env("OWNER_PASSWORD_HASH");
  const insecureCookie = env("AUTH_INSECURE_COOKIE") === "1";
  return {
    login: env("OWNER_LOGIN") ?? "agropost",
    passwordHash: passwordHash ?? null,
    sessionTtlHours: numberEnv("SESSION_TTL_HOURS", 24 * 14),
    loginMaxAttempts: numberEnv("LOGIN_MAX_ATTEMPTS", 10),
    loginWindowMinutes: numberEnv("LOGIN_WINDOW_MINUTES", 15),
    /* NODE_ENV=production (Render) → Secure cookie по умолчанию. */
    secureCookie: process.env.NODE_ENV === "production" && !insecureCookie,
  };
}

function numberEnv(name: string, fallback: number): number {
  const raw = env(name);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
