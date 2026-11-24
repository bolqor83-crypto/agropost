/**
 * Тесты публикации в свой канал через бота (часть D ТЗ, этап 3.2):
 * бот-админ → PUBLISHED + url + BotConfig; не админ → 403 BOT_NOT_ADMIN;
 * анти-бан 24 ч → 409 без confirm, с confirm — публикация.
 */

import { describe, expect, test } from "bun:test";
import { publishListingViaBot, channelUsernameFromUrl } from "../publish.js";
import { FakeApi, FakeNotifier, MemoryDb, testConfig } from "./fixtures.js";
import type { TelegramDeps } from "../types.js";

function seedChannel(db: MemoryDb): void {
  db.channels.push({
    id: "ch-1",
    name: "АгроПост — свой канал",
    url: "https://t.me/agropost_channel",
    accountId: "acc-1",
  });
  db.listings.push({
    id: "li-1",
    positionId: "pos-1",
    channelId: "ch-1",
    text: "Пшеница 3 класс, 120 т\nКраснодарский край, самовывоз или доставка.\nЦена: 15,5 ₽/кг.",
    status: "DRAFT",
    publishedAt: null,
    publishedCount: 0,
    url: null,
  });
}

function makeDeps(db: MemoryDb, api: FakeApi): { deps: TelegramDeps; notify: FakeNotifier } {
  const notify = new FakeNotifier();
  return {
    deps: {
      cfg: testConfig(),
      api,
      db,
      notify,
      botInfo: async () => ({ id: 555000, username: "agropost_test_bot" }),
    },
    notify,
  };
}

describe("channelUsernameFromUrl", () => {
  test("t.me/имя → @имя", () => {
    expect(channelUsernameFromUrl("https://t.me/agropost_channel")).toBe("@agropost_channel");
  });

  test("t.me/s/имя → @имя", () => {
    expect(channelUsernameFromUrl("https://t.me/s/agropost_channel")).toBe("@agropost_channel");
  });

  test("@имя → @имя", () => {
    expect(channelUsernameFromUrl("@agropost_channel")).toBe("@agropost_channel");
  });

  test("мусорная ссылка → null", () => {
    expect(channelUsernameFromUrl("https://vk.com/some")).toBe(null);
  });
});

describe("publishListingViaBot", () => {
  test("бот-админ: объявление публикуется, url сохраняется, BotConfig пишется", async () => {
    const db = new MemoryDb();
    seedChannel(db);
    const api = new FakeApi();
    api.addPublicChannel("agropost_channel", { memberStatus: "administrator", memberCount: 5000 });
    const { deps, notify } = makeDeps(db, api);

    const result = await publishListingViaBot({ listingId: "li-1" }, deps);

    expect(result.listingId).toBe("li-1");
    expect(result.url).toBe("https://t.me/agropost_channel/101");
    expect(result.warning).toBeUndefined();

    const listing = db.listings[0];
    expect(listing.status).toBe("PUBLISHED");
    expect(listing.url).toBe(result.url);
    expect(listing.publishedCount).toBe(1);
    expect(listing.publishedAt).not.toBeNull();

    expect(db.botConfigs.length).toBe(1);
    expect(db.botConfigs[0].channelId).toBe("ch-1");
    expect(db.bumpedAccounts).toEqual(["acc-1"]);

    /* Сообщение: HTML, первая строка жирная, в конце deep link вопроса. */
    const sent = api.sent.find((s) => typeof s.chatId === "number");
    expect(sent).toBeDefined();
    expect(sent?.opts?.parseMode).toBe("HTML");
    expect(sent?.text).toContain("<b>Пшеница 3 класс, 120 т</b>");
    expect(sent?.text).toContain("https://t.me/agropost_test_bot?start=lst_li-1");

    expect(notify.publishErrors.length).toBe(0);
  });

  test("не админ: 403 BOT_NOT_ADMIN + уведомление владельцу", async () => {
    const db = new MemoryDb();
    seedChannel(db);
    const api = new FakeApi();
    api.addPublicChannel("agropost_channel", { memberStatus: "member" });
    const { deps, notify } = makeDeps(db, api);

    let err: unknown = null;
    try {
      await publishListingViaBot({ listingId: "li-1" }, deps);
    } catch (e) {
      err = e;
    }

    expect(err).toBeDefined();
    const apiErr = err as { statusCode?: number; code?: string; message?: string };
    expect(apiErr.statusCode).toBe(403);
    expect(apiErr.code).toBe("BOT_NOT_ADMIN");

    expect(db.listings[0].status).toBe("DRAFT");
    expect(api.sent.length).toBe(0);
    expect(notify.publishErrors.length).toBe(1);
  });

  test("анти-бан: повтор в тот же канал за 24 ч без confirm → 409", async () => {
    const db = new MemoryDb();
    seedChannel(db);
    const api = new FakeApi();
    api.addPublicChannel("agropost_channel", { memberStatus: "administrator" });
    const { deps } = makeDeps(db, api);

    /* Первая публикация — ок. */
    await publishListingViaBot({ listingId: "li-1" }, deps);
    expect(db.listings[0].status).toBe("PUBLISHED");

    /* Вторая в тот же канал без confirm — 409. */
    db.listings.push({
      id: "li-2",
      positionId: "pos-2",
      channelId: "ch-1",
      text: "Ячмень 2 класс, 50 т\nЦена: 12 ₽/кг.",
      status: "DRAFT",
      publishedAt: null,
      publishedCount: 0,
      url: null,
    });

    let err: unknown = null;
    try {
      await publishListingViaBot({ listingId: "li-2" }, deps);
    } catch (e) {
      err = e;
    }
    expect((err as { statusCode?: number; code?: string }).statusCode).toBe(409);
    expect((err as { statusCode?: number; code?: string }).code).toBe("CONFLICT");
    expect(db.listings[1].status).toBe("DRAFT");
  });

  test("анти-бан с confirm: публикация проходит", async () => {
    const db = new MemoryDb();
    seedChannel(db);
    const api = new FakeApi();
    api.addPublicChannel("agropost_channel", { memberStatus: "creator" });
    const { deps } = makeDeps(db, api);

    /* Двойная публикация = 2 паузы 2.5 с — таймаут щедрый. */
    const publish = async () => {
      await publishListingViaBot({ listingId: "li-1" }, deps);
      expect(db.listings[0].status).toBe("PUBLISHED");

      /* Новый черновик в тот же канал — с подтверждением. */
      db.listings.push({
        id: "li-2",
        positionId: "pos-2",
        channelId: "ch-1",
        text: "Ячмень 2 класс, 50 т\nЦена: 12 ₽/кг.",
        status: "DRAFT",
        publishedAt: null,
        publishedCount: 0,
        url: null,
      });

      const result = await publishListingViaBot({ listingId: "li-2", confirm: true }, deps);
      expect(db.listings[1].status).toBe("PUBLISHED");
      expect(result.listingId).toBe("li-2");
    };
    await publish();
  }, 15000);

  test("малая аудитория: предупреждение, но публикация проходит", async () => {
    const db = new MemoryDb();
    seedChannel(db);
    const api = new FakeApi();
    api.addPublicChannel("agropost_channel", { memberStatus: "administrator", memberCount: 42 });
    const { deps } = makeDeps(db, api);

    const result = await publishListingViaBot({ listingId: "li-1" }, deps);

    expect(result.warning).toContain("42");
    expect(db.listings[0].status).toBe("PUBLISHED");
  });

  test("черновик не найден → 404", async () => {
    const db = new MemoryDb();
    const api = new FakeApi();
    const { deps } = makeDeps(db, api);

    let err: unknown = null;
    try {
      await publishListingViaBot({ listingId: "nope" }, deps);
    } catch (e) {
      err = e;
    }
    expect((err as { statusCode?: number }).statusCode).toBe(404);
  });

  test("ссылка канала без @username → 400 VALIDATION_ERROR", async () => {
    const db = new MemoryDb();
    db.channels.push({ id: "ch-2", name: "Канал без ссылки", url: "https://example.com", accountId: null });
    db.listings.push({
      id: "li-3",
      positionId: "pos-1",
      channelId: "ch-2",
      text: "Текст",
      status: "DRAFT",
      publishedAt: null,
      publishedCount: 0,
      url: null,
    });
    const api = new FakeApi();
    const { deps } = makeDeps(db, api);

    let err: unknown = null;
    try {
      await publishListingViaBot({ listingId: "li-3" }, deps);
    } catch (e) {
      err = e;
    }
    expect((err as { statusCode?: number; code?: string }).statusCode).toBe(400);
    expect((err as { statusCode?: number; code?: string }).code).toBe("VALIDATION_ERROR");
  });
});
