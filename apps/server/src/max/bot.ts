/**
 * ЭТАП 10 — тонкий HTTP-клиент MAX Bot API (bot.ts по структуре ТЗ).
 *
 * Прямые вызовы fetch на https://platform-api2.max.ru (без SDK):
 * - GET  /me                              — информация о боте;
 * - GET  /updates?marker=&timeout=&limit= — Long Polling апдейтов;
 * - POST /messages?chat_id=|user_id=       — отправка сообщения;
 * - GET  /chats/{chatId}                   — информация о чате/канале;
 * - GET  /chats/{chatId}/bot-membership    — членство бота (is_admin).
 *
 * Авторизация: заголовок `Authorization: <access_token>` (query-параметр
 * платформа больше не принимает). fetch инъекцируется — тесты без сети.
 */

import { MaxApiError, type MaxApi, type MaxBotInfo, type MaxChat, type MaxMembership, type MaxMessage, type MaxSendResult, type MaxUpdate, type MaxUpdatesResponse } from "./types.js";

export interface MaxClientInput {
  token: string;
  apiBase: string;
  /** Подмена fetch для тестов. */
  fetchImpl?: typeof fetch;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let message = `MAX API: HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    message = parsed.message ?? parsed.error ?? message;
  } catch {
    if (text.trim().length > 0 && text.length < 300) message = text.trim();
  }
  return message;
}

/** Тело сообщения читаем из body/message — MAX шлёт оба варианта. */
export function messageText(message: MaxMessage): string | null {
  const text = message.body?.text ?? message.message?.text ?? null;
  return text && text.trim().length > 0 ? text.trim() : null;
}

/** mid сообщения (дедупликация и привязка ответа). */
export function messageMid(message: MaxMessage): string | null {
  return message.body?.mid ?? message.message?.mid ?? null;
}

export function createMaxClient(input: MaxClientInput): MaxApi {
  const doFetch = input.fetchImpl ?? fetch;
  const base = input.apiBase.replace(/\/+$/, "");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          /* Формат платформы: сам токен, без «Bearer». */
          Authorization: input.token,
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new MaxApiError(0, "MAX API недоступен: сеть");
    }
    if (!res.ok) {
      throw new MaxApiError(res.status, await readError(res));
    }
    return (await res.json().catch(() => ({}))) as T;
  }

  return {
    async getMe(): Promise<MaxBotInfo> {
      const body = await call<{ user_id?: number; first_name?: string; username?: string | null }>("/me");
      return {
        userId: body.user_id ?? 0,
        firstName: body.first_name ?? "MAX-бот",
        username: body.username ?? null,
      };
    },

    async getUpdates(marker, timeout = 30, limit = 100): Promise<MaxUpdatesResponse> {
      const params = new URLSearchParams();
      if (marker !== null && marker !== undefined) params.set("marker", String(marker));
      params.set("timeout", String(timeout));
      params.set("limit", String(limit));
      const body = await call<{ updates?: MaxUpdate[]; marker?: number | null }>(`/updates?${params.toString()}`);
      return { updates: body.updates ?? [], marker: body.marker ?? null };
    },

    async sendMessage(target, text, opts): Promise<MaxSendResult> {
      const params = new URLSearchParams();
      if (target.chatId !== undefined) params.set("chat_id", String(target.chatId));
      else if (target.userId !== undefined) params.set("user_id", String(target.userId));
      else throw new MaxApiError(0, "Не указан получатель сообщения MAX");
      const body = await call<{
        message?: { body?: { mid?: string }; stat?: { url?: string | null } };
      }>(`/messages?${params.toString()}`, {
        method: "POST",
        body: JSON.stringify({ text, format: opts?.format ?? "html" }),
      });
      return {
        mid: body.message?.body?.mid ?? null,
        url: body.message?.stat?.url ?? null,
      };
    },

    async getChat(chatId: number): Promise<MaxChat> {
      const body = await call<{ chat_id?: number; type?: string; title?: string | null }>(
        `/chats/${chatId}`,
      );
      return {
        chatId: body.chat_id ?? chatId,
        type: body.type ?? "chat",
        title: body.title ?? null,
      };
    },

    async getBotMembership(chatId: number): Promise<MaxMembership> {
      const body = await call<{ is_admin?: boolean; is_owner?: boolean }>(
        `/chats/${chatId}/bot-membership`,
      );
      return {
        isAdmin: body.is_admin === true || body.is_owner === true,
        isOwner: body.is_owner === true,
      };
    },
  };
}
