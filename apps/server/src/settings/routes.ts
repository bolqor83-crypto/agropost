/**
 * /api/settings/* — управление переменными (секретами) из UI.
 *
 * Все маршруты за авторизацией владельца (глобальный guard, ничего
 * добавлять в PUBLIC_API_PATHS не нужно). Значения клиенту не отдаются —
 * только маски и флаги. «Проверить подключение» делает реальный запрос
 * к API сервиса (Авито OAuth, MAX GET /me, OpenRouter auth/key,
 * Telegram getMe; фиды — запрос к собственному API по токену).
 */

import type { FastifyInstance } from "fastify";
import type { SecretTestDTO } from "@shared/types";
import { z } from "zod";
import { ApiError, badRequest, notFound } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import {
  getSecretValues,
  SECRET_DEFS,
  setSecret,
  secretsStatus,
  type SecretDef,
  type SecretTest,
} from "./secrets.js";

export const secretSaveSchema = z.object({
  key: z.string().trim().min(1).max(64),
  value: z.string().max(512).nullable().optional(),
});

function env(name: string): string | undefined {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

const TEST_TIMEOUT_MS = 10_000;

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

/* ---------- Проверки подключения (реальные API, без утечки значений) ---------- */

async function testFeeds(token: string): Promise<SecretTestDTO> {
  const port = env("PORT") ?? "3001";
  const url = `http://127.0.0.1:${port}/api/feeds/yml?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
    if (res.ok) {
      return { ok: true, key: "FEED_TOKEN", pass: true, message: "Фид отвечает по токену — ссылку можно отдавать площадкам" };
    }
    return { ok: true, key: "FEED_TOKEN", pass: false, message: `Фид ответил ${res.status} — токен не совпал` };
  } catch (err) {
    return { ok: true, key: "FEED_TOKEN", pass: false, message: `Не удалось обратиться к фиду: ${err instanceof Error ? err.message : "ошибка сети"}` };
  }
}

async function testAvito(): Promise<SecretTestDTO> {
  const values = await getSecretValues(["AVITO_CLIENT_ID", "AVITO_CLIENT_SECRET"]);
  const clientId = values["AVITO_CLIENT_ID"];
  const clientSecret = values["AVITO_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    return { ok: true, key: "AVITO_CLIENT_SECRET", pass: false, message: "Нужны оба ключа: AVITO_CLIENT_ID и AVITO_CLIENT_SECRET" };
  }
  const apiBase = env("AVITO_API_BASE") ?? "https://api.avito.ru";
  try {
    const res = await fetchJson(`${apiBase}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (res.ok) {
      return { ok: true, key: "AVITO_CLIENT_SECRET", pass: true, message: "Авито выдал access_token — ключи верные" };
    }
    return { ok: true, key: "AVITO_CLIENT_SECRET", pass: false, message: `Авито отклонил ключи (HTTP ${res.status})` };
  } catch (err) {
    return { ok: true, key: "AVITO_CLIENT_SECRET", pass: false, message: `Не удалось обратиться к Авито: ${err instanceof Error ? err.message : "ошибка сети"}` };
  }
}

async function testMax(token: string): Promise<SecretTestDTO> {
  const apiBase = env("MAX_API_BASE") ?? "https://platform-api2.max.ru";
  try {
    const res = await fetchJson(`${apiBase}/me`, { headers: { Authorization: token } });
    if (res.ok) {
      const me = (res.body ?? {}) as { username?: string | null };
      const who = me.username ? ` (@${me.username})` : "";
      return { ok: true, key: "MAX_BOT_TOKEN", pass: true, message: `MAX-бот отвечает${who} — токен верный` };
    }
    return { ok: true, key: "MAX_BOT_TOKEN", pass: false, message: `MAX отклонил токен (HTTP ${res.status})` };
  } catch (err) {
    return { ok: true, key: "MAX_BOT_TOKEN", pass: false, message: `Не удалось обратиться к MAX: ${err instanceof Error ? err.message : "ошибка сети"}` };
  }
}

async function testOpenRouter(key: string): Promise<SecretTestDTO> {
  try {
    const res = await fetchJson("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      return { ok: true, key: "OPENROUTER_API_KEY", pass: true, message: "OpenRouter принял ключ — AI-подсказки работают" };
    }
    return { ok: true, key: "OPENROUTER_API_KEY", pass: false, message: `OpenRouter отклонил ключ (HTTP ${res.status})` };
  } catch (err) {
    return { ok: true, key: "OPENROUTER_API_KEY", pass: false, message: `Не удалось обратиться к OpenRouter: ${err instanceof Error ? err.message : "ошибка сети"}` };
  }
}

async function testTelegram(token: string): Promise<SecretTestDTO> {
  try {
    const res = await fetchJson(`https://api.telegram.org/bot${token}/getMe`, {});
    const body = res.body as { ok?: boolean; result?: { username?: string } } | null;
    if (res.ok && body?.ok) {
      const who = body.result?.username ? ` @${body.result.username}` : "";
      return { ok: true, key: "TELEGRAM_BOT_TOKEN", pass: true, message: `Telegram-бот отвечает${who} — токен верный` };
    }
    return { ok: true, key: "TELEGRAM_BOT_TOKEN", pass: false, message: "Telegram отклонил токен" };
  } catch (err) {
    return { ok: true, key: "TELEGRAM_BOT_TOKEN", pass: false, message: `Не удалось обратиться к Telegram: ${err instanceof Error ? err.message : "ошибка сети"}` };
  }
}

async function runTest(def: SecretDef, kind: SecretTest): Promise<SecretTestDTO> {
  if (kind === "avito") return testAvito();
  const values = await getSecretValues([def.key]);
  const value = values[def.key];
  if (!value) {
    return { ok: true, key: def.key, pass: false, message: "Сначала задайте значение — проверять нечего" };
  }
  switch (kind) {
    case "feeds":
      return testFeeds(value);
    case "max":
      return testMax(value);
    case "ai":
      return testOpenRouter(value);
    case "telegram":
      return testTelegram(value);
  }
}

/* ---------- Маршруты ---------- */

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  /* Список переменных: маски, источники, шифрование, история изменений. */
  app.get("/api/settings/secrets", async () => secretsStatus());

  /* Сохранить (value=null → убрать). env платформы → 400, без ключа → 503. */
  app.put("/api/settings/secrets", async (req) => {
    const input = parseOrThrow(secretSaveSchema, req.body ?? {});
    const item = await setSecret(input.key, input.value ?? null);
    return { ok: true as const, item };
  });

  /* «Проверить подключение» — реальный запрос к сервису. */
  app.post("/api/settings/secrets/:key/test", async (req) => {
    const params = req.params as { key?: string };
    const key = (params.key ?? "").trim();
    const def = SECRET_DEFS.find((d) => d.key === key);
    if (!def) {
      throw notFound(`Неизвестная переменная: ${key || "—"}`);
    }
    if (!def.test) {
      throw badRequest(`Для «${def.label}» нет проверки подключения`);
    }
    const dto = await runTest(def, def.test);
    if (!dto.ok) {
      throw new ApiError(502, "SECRET_TEST_FAILED", dto.message);
    }
    return dto;
  });
}
