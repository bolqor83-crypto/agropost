/**
 * ЭТАП 10 — тесты публикации в свой MAX-канал (publish.ts) на фейках:
 * привязка chat_id, проверка админа, анти-бан 24 ч, deep link, статус.
 */

import { describe, expect, test } from "bun:test";
import { publishListingViaMaxBot } from "../publish.js";
import { FakeMaxApi, MemoryMaxDb, maxTestDeps } from "./fixtures.js";

const CHANNEL = {
  id: "ch-max-rostov",
  name: "Барахолка Ростов (MAX)",
  url: "https://max.ru/channel_baraholka_rostov",
  accountId: null,
};

function setup(over: {
  binding?: number;
  memberships?: Record<number, { is_admin?: boolean; is_owner?: boolean }>;
  publishedRecently?: boolean;
} = {}) {
  const db = new MemoryMaxDb();
  db.channels.push(CHANNEL);
  db.seedListing({ id: "lst-1", channelId: CHANNEL.id, text: "Люцерна 1 класс\n1000 кг\n120 ₽/кг" });
  if (over.binding !== undefined) {
    db.bindings.push({ channelId: CHANNEL.id, chatId: over.binding });
  }
  if (over.publishedRecently) {
    db.seedListing({
      id: "lst-old",
      channelId: CHANNEL.id,
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
  }
  const api = new FakeMaxApi();
  api.memberships = over.memberships ?? {};
  const deps = maxTestDeps(db, api);
  return { db, api, deps };
}

describe("MAX: публикация в свой канал", () => {
  test("без привязки и без chat_id → 400 с подсказкой", async () => {
    const { deps } = setup();
    try {
      await publishListingViaMaxBot({ listingId: "lst-1" }, deps);
      throw new Error("должен был упасть");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
      expect((err as Error).message).toContain("chat_id");
    }
  });

  test("бот не админ → 403 BOT_NOT_ADMIN, публикация не ставится", async () => {
    const { db, deps } = setup({ binding: 100, memberships: { 100: { is_admin: false } } });
    try {
      await publishListingViaMaxBot({ listingId: "lst-1" }, deps);
      throw new Error("должен был упасть");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(403);
      expect((err as { code?: string }).code).toBe("BOT_NOT_ADMIN");
    }
    expect(db.listings.find((l) => l.id === "lst-1")?.status).toBe("DRAFT");
  });

  test("успех: HTML с жирной первой строкой, deep link бота, привязка сохранена", async () => {
    const { db, api, deps } = setup({ binding: 100 });
    const result = await publishListingViaMaxBot({ listingId: "lst-1" }, deps);

    expect(result.chatId).toBe(100);
    expect(api.calls.sent).toHaveLength(1);
    expect(api.calls.sent[0].chatId).toBe(100);
    const text = api.calls.sent[0].text;
    expect(text.startsWith("<b>Люцерна 1 класс</b>")).toBe(true);
    expect(text).toContain("https://max.ru/agropost_max_bot?start=lst_lst-1");

    const listing = db.listings.find((l) => l.id === "lst-1");
    expect(listing?.status).toBe("PUBLISHED");
    expect(db.bindings.find((b) => b.channelId === CHANNEL.id)?.chatId).toBe(100);
  });

  test("chat_id из запроса сохраняется, если привязки не было", async () => {
    const { db, deps } = setup();
    const result = await publishListingViaMaxBot({ listingId: "lst-1", chatId: 321 }, deps);
    expect(result.chatId).toBe(321);
    expect(db.bindings.find((b) => b.channelId === CHANNEL.id)?.chatId).toBe(321);
  });

  test("анти-бан: публикация за 24 ч → 409, с confirm — проходит", async () => {
    const { deps } = setup({ binding: 100, publishedRecently: true });
    try {
      await publishListingViaMaxBot({ listingId: "lst-1" }, deps);
      throw new Error("должен был упасть");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(409);
      expect((err as Error).message).toContain("24 часа");
    }
    const result = await publishListingViaMaxBot({ listingId: "lst-1", confirm: true }, deps);
    expect(result.chatId).toBe(100);
  });

  test("платформа недоступна при проверке прав → 403 MAX_CHAT_NOT_FOUND", async () => {
    const { deps } = setup({ binding: 100 });
    (deps.api as FakeMaxApi).failNext = "membership";
    try {
      await publishListingViaMaxBot({ listingId: "lst-1" }, deps);
      throw new Error("должен был упасть");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(403);
      expect((err as { code?: string }).code).toBe("MAX_CHAT_NOT_FOUND");
    }
  });
});
