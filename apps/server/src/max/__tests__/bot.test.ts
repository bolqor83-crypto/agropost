/**
 * ЭТАП 10 — тесты HTTP-клиента MAX Bot API (bot.ts) на фейке fetch:
 * авторизация заголовком (не query!), методы /me, /updates, /messages,
 * /chats/{id}/bot-membership, разбор ошибок платформы.
 */

import { describe, expect, test } from "bun:test";
import { createMaxClient, messageMid, messageText } from "../bot.js";
import { MaxApiError } from "../types.js";

interface Recorded {
  url: string;
  init: RequestInit;
  status: number;
  body: unknown;
}

/** Мок fetch: отвечает заготовленным телом и пишет вызовы. */
function mockFetch(responses: { match: RegExp; status?: number; body: unknown }[]) {
  const recorded: Recorded[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    recorded.push({ url, init: init ?? {}, status: 0, body: null });
    const hit = responses.find((r) => r.match.test(url));
    if (!hit) {
      return new Response(JSON.stringify({ message: "no route" }), { status: 404 });
    }
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, recorded };
}

describe("MAX-клиент: авторизация и методы", () => {
  test("Authorization — сам токен, без Bearer и без query-параметра", async () => {
    const { fetchImpl, recorded } = mockFetch([{ match: /\/me/, body: { user_id: 5, first_name: "Бот" } }]);
    const api = createMaxClient({ token: "tok-123", apiBase: "https://platform-api2.max.ru", fetchImpl });
    await api.getMe();
    expect(recorded[0].url).toBe("https://platform-api2.max.ru/me");
    const headers = recorded[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("tok-123");
    expect(recorded[0].url).not.toContain("access_token");
  });

  test("getUpdates: marker/timeout/limit в query, marker читается из ответа", async () => {
    const { fetchImpl, recorded } = mockFetch([
      { match: /\/updates\?/, body: { updates: [{ update_type: "message_created" }], marker: 42 } },
    ]);
    const api = createMaxClient({ token: "t", apiBase: "https://x.example", fetchImpl });
    const res = await api.getUpdates(null, 30, 50);
    expect(res.marker).toBe(42);
    expect(res.updates).toHaveLength(1);
    expect(recorded[0].url).toContain("timeout=30");
    expect(recorded[0].url).toContain("limit=50");
    expect(recorded[0].url).not.toContain("marker=");
  });

  test("sendMessage: chat_id/user_id в query, тело {text, format}, mid из body", async () => {
    const { fetchImpl, recorded } = mockFetch([
      {
        match: /\/messages\?chat_id=100/,
        body: { message: { body: { mid: "m-1" }, stat: { url: "https://max.ru/post/1" } } },
      },
    ]);
    const api = createMaxClient({ token: "t", apiBase: "https://x.example", fetchImpl });
    const sent = await api.sendMessage({ chatId: 100 }, "<b>Текст</b>", { format: "html" });
    expect(sent.mid).toBe("m-1");
    expect(sent.url).toBe("https://max.ru/post/1");
    expect(recorded[0].init.method).toBe("POST");
    expect(recorded[0].init.body).toBe(JSON.stringify({ text: "<b>Текст</b>", format: "html" }));
  });

  test("getBotMembership: is_admin/is_owner → isAdmin", async () => {
    const { fetchImpl } = mockFetch([
      { match: /bot-membership/, body: { is_admin: true, is_owner: false } },
    ]);
    const api = createMaxClient({ token: "t", apiBase: "https://x.example", fetchImpl });
    expect((await api.getBotMembership(7)).isAdmin).toBe(true);
  });

  test("ошибка платформы → MaxApiError с текстом из message", async () => {
    const { fetchImpl } = mockFetch([
      { match: /\/me/, status: 401, body: { message: "Unauthorized" } },
    ]);
    const api = createMaxClient({ token: "bad", apiBase: "https://x.example", fetchImpl });
    try {
      await api.getMe();
      throw new Error("должен был упасть");
    } catch (err) {
      expect(err).toBeInstanceOf(MaxApiError);
      expect((err as MaxApiError).status).toBe(401);
      expect((err as MaxApiError).message).toContain("Unauthorized");
    }
  });
});

describe("MAX-клиент: разбор сообщений", () => {
  test("текст читается из body и из message (MAX шлёт оба варианта)", () => {
    expect(messageText({ body: { mid: "1", text: "из body" } })).toBe("из body");
    expect(messageText({ message: { mid: "2", text: "из message" } })).toBe("из message");
    expect(messageText({ body: { text: "   " } })).toBe(null);
    expect(messageMid({ body: { mid: "a" }, message: { mid: "b" } })).toBe("a");
  });
});
