/**
 * ЭТАП 9 — HTTP-клиент Авито API поверх OAuth2.
 *
 * Токен кэшируется в памяти до истечения (expires_in, стандартно 24 ч,
 * обновляем за минуту до конца). Эндпоинты Автозагрузки:
 * - POST /autoload/v1/upload {url} — «Загрузка файла по ссылке»: Авито
 *   сам забирает XML-фид по URL и синхронизирует объявления;
 * - POST /autoload/v2/validate — удалённая валидация XML (dry-run);
 *   эндпоинт опционален у площадки: 404/405 трактуем как «недоступен,
 *   достаточно локальной проверки»;
 * - GET  /autoload/v4/uploads/current — состояние текущей загрузки.
 *
 * fetch и время инъекцируются — тесты идут без сети.
 */

import {
  fetchAvitoToken,
  type FetchLike,
} from "./auth.js";
import { AvitoApiError, type AvitoTokenResponse, type AvitoUploadResult, type AvitoValidateResult } from "./types.js";
import type { AvitoRuntimeConfig } from "./config.js";

export interface AvitoClientInput {
  config: AvitoRuntimeConfig;
  fetchImpl?: FetchLike;
  /** Время для кэша токена (мс); тесты подменяют. */
  now?: () => number;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let message = `Авито API: HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as {
      message?: string;
      error?: { message?: string } | string;
    };
    const inner = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    message = parsed.message ?? inner ?? message;
  } catch {
    if (text.trim().length > 0 && text.length < 300) message = text.trim();
  }
  return message;
}

export function createAvitoClient(input: AvitoClientInput) {
  const doFetch = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  let tokenCache: { token: AvitoTokenResponse; at: number } | null = null;

  async function getToken(): Promise<string> {
    const fresh =
      tokenCache !== null && now() - tokenCache.at < (tokenCache.token.expires_in - 60) * 1000;
    if (tokenCache && fresh) return tokenCache.token.access_token;

    const { clientId, clientSecret, apiBase } = input.config;
    if (!clientId || !clientSecret) {
      throw new AvitoApiError(0, "Авито API не настроен: client_id/secret отсутствуют");
    }
    const token = await fetchAvitoToken({ clientId, clientSecret, apiBase }, doFetch);
    tokenCache = { token, at: now() };
    return token.access_token;
  }

  async function authorized(path: string, init?: RequestInit): Promise<Response> {
    const token = await getToken();
    return doFetch(`${input.config.apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  return {
    getToken,

    /** Dry-run: удалённая валидация XML Автозагрузки. */
    async validate(xml: string): Promise<AvitoValidateResult> {
      let res: Response;
      try {
        res = await authorized("/autoload/v2/validate", {
          method: "POST",
          body: JSON.stringify({ xml }),
        });
      } catch {
        return { remote: "unavailable", errors: [] };
      }
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        return { remote: "unavailable", errors: [] };
      }
      if (!res.ok) {
        return { remote: "failed", errors: [await readError(res)] };
      }
      const body = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        errors?: unknown;
        errorsList?: unknown;
      };
      const errors = Array.isArray(body.errors)
        ? body.errors.map((e) => String(e))
        : Array.isArray(body.errorsList)
          ? body.errorsList.map((e) => String(e))
          : [];
      return body.valid === false
        ? { remote: "failed", errors: errors.length > 0 ? errors : ["валидатор Авито вернул ошибки"] }
        : { remote: "passed", errors: [] };
    },

    /** Загрузка фида по ссылке: Авито забирает XML сам. */
    async upload(feedUrl: string): Promise<AvitoUploadResult> {
      let res: Response;
      try {
        res = await authorized("/autoload/v1/upload", {
          method: "POST",
          body: JSON.stringify({ url: feedUrl }),
        });
      } catch {
        throw new AvitoApiError(0, "Авито API недоступен: сеть");
      }
      if (!res.ok) {
        throw new AvitoApiError(res.status, await readError(res));
      }
      const body = (await res.json().catch(() => ({}))) as {
        id?: string | number;
        status?: string;
        state?: string;
      };
      const status = body.status ?? body.state ?? (body.id !== undefined ? String(body.id) : null);
      return { ok: true, status };
    },

    /** Текущая загрузка (статус обработки после upload). */
    async currentUpload(): Promise<string | null> {
      try {
        const res = await authorized("/autoload/v4/uploads/current", { method: "GET" });
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        return body?.status ?? null;
      } catch {
        return null;
      }
    },

    /* Тесты: сброс кэша токена. */
    resetToken(): void {
      tokenCache = null;
    },
  };
}

export type AvitoClient = ReturnType<typeof createAvitoClient>;
