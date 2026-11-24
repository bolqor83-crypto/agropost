/**
 * ЭТАП 10 — тесты хендлеров апдейтов MAX (handlers.ts) на фейках:
 * входящее сообщение → Lead (source=MAX) → уведомление владельцу,
 * дедупликация по mid, авто-ack первого контакта, владелец, группы,
 * bot_started (приветствие), bot_added (запомнить chat_id + уведомить).
 */

import { describe, expect, test } from "bun:test";
import { handleMaxUpdate } from "../handlers.js";
import { FakeMaxApi, MemoryMaxDb, maxTestDeps } from "./fixtures.js";
import type { MaxUpdate } from "../types.js";

function messageUpdate(over: {
  text?: string | null;
  mid?: string;
  userId?: number;
  username?: string | null;
  chatType?: string;
  isBot?: boolean;
}): MaxUpdate {
  return {
    update_type: "message_created",
    message: {
      sender: {
        user_id: over.userId ?? 501,
        first_name: "Иван",
        username: over.username ?? null,
        is_bot: over.isBot ?? false,
      },
      recipient: { chat_id: over.userId ?? 501, chat_type: over.chatType ?? "dialog" },
      body: { mid: over.mid ?? "m1", text: over.text ?? "Здравствуйте! Люцерна, 2 класс — продаёте?" },
    },
  };
}

describe("MAX: входящее сообщение покупателя", () => {
  test("новое сообщение → лид MAX + Message + авто-ack + уведомление", async () => {
    const db = new MemoryMaxDb();
    const api = new FakeMaxApi();
    const deps = maxTestDeps(db, api);
    await handleMaxUpdate(messageUpdate({ mid: "m1", userId: 501, username: "buyer" }), deps);

    expect(db.leads).toHaveLength(1);
    expect(db.leads[0].source).toBe("MAX");
    expect(db.leads[0].externalId).toBe("501");
    expect(db.leads[0].externalUsername).toBe("buyer");
    /* Интерес подхватился из словаря культур. */
    expect(db.leads[0].interest).toBe("Люцерна 2 класс");
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0].direction).toBe("INBOUND");
    expect(db.messages[0].id).toBe("m:m1");

    /* Авто-ack покупателю (только первый контакт). */
    expect(api.calls.sent).toHaveLength(1);
    expect(api.calls.sent[0].userId).toBe(501);
    expect(api.calls.sent[0].text).toContain("Спасибо за сообщение");

    /* Уведомление владельцу — с маркером источника MAX. */
    expect(deps.notify.pushed).toHaveLength(1);
    expect(deps.notify.pushed[0].from).toContain("MAX");
  });

  test("дубль апдейта (тот же mid) — лид и сообщение не дублируются", async () => {
    const db = new MemoryMaxDb();
    const deps = maxTestDeps(db, new FakeMaxApi());
    const update = messageUpdate({ mid: "dup" });
    await handleMaxUpdate(update, deps);
    await handleMaxUpdate(update, deps);
    expect(db.leads).toHaveLength(1);
    expect(db.messages).toHaveLength(1);
    expect(api0(deps).calls.sent).toHaveLength(1);
  });

  test("сообщение от владельца — управления, лид не создаётся", async () => {
    const db = new MemoryMaxDb();
    const api = new FakeMaxApi();
    const deps = maxTestDeps(db, api, { ownerId: 900 });
    await handleMaxUpdate(messageUpdate({ mid: "own", userId: 900 }), deps);
    expect(db.leads).toHaveLength(0);
    expect(api.calls.sent[0].text).toContain("владелец бота");
  });

  test("групповой чат/канал — НЕ лид (чужие чаты не обрабатываем)", async () => {
    const db = new MemoryMaxDb();
    const api = new FakeMaxApi();
    const deps = maxTestDeps(db, api);
    await handleMaxUpdate(messageUpdate({ mid: "g1", chatType: "chat" }), deps);
    await handleMaxUpdate(messageUpdate({ mid: "g2", chatType: "channel" }), deps);
    expect(db.leads).toHaveLength(0);
    expect(api.calls.sent).toHaveLength(0);
  });

  test("сообщение от бота и пустой текст — игнор", async () => {
    const db = new MemoryMaxDb();
    const deps = maxTestDeps(db, new FakeMaxApi());
    await handleMaxUpdate(messageUpdate({ mid: "b1", isBot: true }), deps);
    await handleMaxUpdate(messageUpdate({ mid: "b2", text: "   " }), deps);
    expect(db.leads).toHaveLength(0);
  });

  test("существующий лид: имя @username обновляется, ack не повторяется", async () => {
    const db = new MemoryMaxDb({
      leads: [{ source: "MAX", externalId: "501", externalUsername: "old_name", status: "IN_PROGRESS" }],
    });
    const api = new FakeMaxApi();
    const deps = maxTestDeps(db, api);
    await handleMaxUpdate(messageUpdate({ mid: "n1", userId: 501, username: "new_name" }), deps);
    expect(db.leads).toHaveLength(1);
    expect(db.leads[0].externalUsername).toBe("new_name");
    expect(api.calls.sent).toHaveLength(0);
  });
});

describe("MAX: bot_started / bot_added", () => {
  test("bot_started — приветствие покупателю (аналог /start)", async () => {
    const db = new MemoryMaxDb();
    const api = new FakeMaxApi();
    const deps = maxTestDeps(db, api);
    await handleMaxUpdate({ update_type: "bot_started", bot_started: { user_id: 42 } }, deps);
    expect(api.calls.sent).toHaveLength(1);
    expect(api.calls.sent[0].userId).toBe(42);
    expect(api.calls.sent[0].text).toContain("семян");
  });

  test("bot_started владельца — без приветствия", async () => {
    const db = new MemoryMaxDb();
    const api = new FakeMaxApi();
    const deps = maxTestDeps(db, api, { ownerId: 42 });
    await handleMaxUpdate({ update_type: "bot_started", bot_started: { user_id: 42 } }, deps);
    expect(api.calls.sent).toHaveLength(0);
  });

  test("bot_added — chat_id запоминается, владелец уведомлён", async () => {
    const db = new MemoryMaxDb();
    const api = new FakeMaxApi();
    const deps = maxTestDeps(db, api);
    await handleMaxUpdate({ update_type: "bot_added", bot_added: { chat_id: 555 } }, deps);
    expect(db.discovered).toHaveLength(1);
    expect(db.discovered[0].chatId).toBe(555);
    expect(deps.notify.pushed[0].text).toContain("555");
  });
});

/* Доступ к api фейка из deps (typed). */
function api0(deps: ReturnType<typeof maxTestDeps>): FakeMaxApi {
  return deps.api as FakeMaxApi;
}
