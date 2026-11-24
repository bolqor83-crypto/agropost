/**
 * Тесты хендлеров Telegram (часть B ТЗ, этап 3.2):
 * покупатель → Lead + Message + уведомление; владелец → без лида;
 * reply-привязка к тому же лиду; дубликаты (ретраи webhook) пропускаются;
 * /start с deep link pos_{id}.
 */

import { describe, expect, test } from "bun:test";
import type { TelegramDeps, TgUpdate } from "../types.js";
import { handleTelegramUpdate } from "../update.js";
import { extractInterest } from "../interest.js";
import { buyerMessage, FakeApi, FakeNotifier, MemoryDb, testConfig } from "./fixtures.js";

function makeDeps(db: MemoryDb, api: FakeApi, overrides?: Partial<TelegramDeps>): TelegramDeps {
  const notify = new FakeNotifier();
  const deps: TelegramDeps = {
    cfg: testConfig(),
    api,
    db,
    notify,
    botInfo: async () => ({ id: 555000, username: "agropost_test_bot" }),
  };
  return { ...deps, ...overrides };
}

function update(msg: ReturnType<typeof buyerMessage>): TgUpdate {
  return { update_id: 1, message: msg };
}

describe("Входящее сообщение покупателя", () => {
  test("новый покупатель: создаётся Lead + Message, авто-ack, уведомление владельцу", async () => {
    const db = new MemoryDb();
    db.cultureNames = ["Пшеница", "Ячмень"];
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(update(buyerMessage({ fromId: 1001 })), deps);

    expect(db.leads.length).toBe(1);
    const lead = db.leads[0];
    expect(lead.source).toBe("TELEGRAM_BOT");
    expect(lead.externalId).toBe("1001");
    expect(lead.externalUsername).toBe("ivan_buyer");
    expect(lead.name).toBe("Иван");
    expect(lead.status).toBe("NEW");

    expect(db.messages.length).toBe(1);
    expect(db.messages[0].direction).toBe("INBOUND");
    expect(db.messages[0].telegramMessageId).toBe("10");
    expect(db.messages[0].text).toContain("пшеница");

    /* Культура из текста записана в interest (пшеница 3 класс). */
    expect(lead.interest).toBe("Пшеница 3 класс");

    /* Авто-ack первому контакту. */
    expect(api.sent.length).toBe(1);
    expect(api.sent[0].chatId).toBe("1001");
    expect(api.sent[0].text).toContain("Спасибо за сообщение");

    /* Уведомление владельцу. */
    const notify = deps.notify as unknown as FakeNotifier;
    expect(notify.pushes.length).toBe(1);
    expect(notify.pushes[0].leadId).toBe(lead.id);
    expect(notify.pushes[0].from).toBe("@ivan_buyer");
  });

  test("дубликат (ретраи webhook) пропускается: одна запись Message", async () => {
    const db = new MemoryDb();
    db.cultureNames = ["Пшеница"];
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    const msg = buyerMessage({ fromId: 1002, messageId: 77 });
    await handleTelegramUpdate(update(msg), deps);
    await handleTelegramUpdate(update(msg), deps);

    expect(db.leads.length).toBe(1);
    expect(db.messages.length).toBe(1);
  });

  test("сообщение от владельца: лид не создаётся, приходит подсказка про инбокс", async () => {
    const db = new MemoryDb();
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 7867317588, text: "статус" })),
      deps,
    );

    expect(db.leads.length).toBe(0);
    expect(api.sent.length).toBe(1);
    expect(api.sent[0].chatId).toBe(7867317588);
    expect(api.sent[0].text).toContain("инбоксе");
  });

  test("reply на наше сообщение привязывается к тому же лиду", async () => {
    const db = new MemoryDb();
    db.cultureNames = [];
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    /* Первое сообщение покупателя 2001. */
    await handleTelegramUpdate(update(buyerMessage({ fromId: 2001, messageId: 20 })), deps);

    /* Наш ответ (сохранён как OUTBOUND с telegramMessageId=21). */
    const lead = db.leads[0];
    await db.createMessage({
      leadId: lead.id,
      direction: "OUTBOUND",
      text: "Здравствуйте! Пшеница 3 класс — 15 ₽/кг.",
      telegramMessageId: "21",
    });

    /* Покупатель отвечает на 21 → тот же лид, а не новый. */
    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 2001, messageId: 22, replyTo: 21, text: "А доставка в Казань?" })),
      deps,
    );

    expect(db.leads.length).toBe(1);
    expect(db.messages.length).toBe(3);
    expect(db.messages[2].direction).toBe("INBOUND");
    expect(db.messages[2].text).toContain("Казань");
  });

  test("SPAM-лид не уведомляет владельца", async () => {
    const db = new MemoryDb({ leads: [{ externalId: "3001", status: "SPAM" }] });
    db.cultureNames = [];
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(update(buyerMessage({ fromId: 3001, messageId: 30 })), deps);

    const notify = deps.notify as unknown as FakeNotifier;
    expect(notify.pushes.length).toBe(0);
    /* Повторный контакт в SPAM не получает авто-ack. */
    expect(api.sent.length).toBe(0);
    /* Но сообщение сохраняется в переписку лида. */
    expect(db.messages.length).toBe(1);
  });

  test("группа: лид не создаётся", async () => {
    const db = new MemoryDb();
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 4001, chatType: "group" })),
      deps,
    );

    expect(db.leads.length).toBe(0);
    expect(db.messages.length).toBe(0);
  });
});

describe("/start", () => {
  test("deep link pos_{id}: лид привязывается к позиции, в ответе — цена", async () => {
    const db = new MemoryDb();
    db.positions.push({
      id: "pos-1",
      name: "Пшеница 3 класс",
      salePrice: 15.5,
      volumeKg: 120_000,
      status: "IN_STOCK",
    });
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 5001, text: "/start pos_pos-1", messageId: 1 })),
      deps,
    );

    expect(db.leads.length).toBe(1);
    expect(db.leads[0].positionId).toBe("pos-1");
    expect(api.sent.length).toBe(1);
    expect(api.sent[0].text).toContain("Пшеница 3 класс");
    expect(api.sent[0].text).toContain("15,5 ₽/кг");
    expect(api.sent[0].text).toContain("в наличии");
  });

  /* ---------- Этап 5.1: настоящая атрибуция lst_{listingId} ---------- */

  test("deep link lst_: касание записано, first/last touch заполнены, приветствие по позиции", async () => {
    const db = new MemoryDb();
    db.positions.push({
      id: "pos-1",
      name: "Люцерна Вега 87",
      salePrice: 212.75,
      volumeKg: 20_000,
      status: "IN_STOCK",
    });
    db.listingTouches.push({ listingId: "li-1", positionId: "pos-1", channelId: "ch-kuban" });
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 6001, text: "/start lst_li-1", messageId: 10 })),
      deps,
    );

    const lead = db.leads[0];
    expect(lead.positionId).toBe("pos-1");
    expect(lead.firstListingId).toBe("li-1");
    expect(lead.firstChannelId).toBe("ch-kuban");
    expect(lead.lastListingId).toBe("li-1");
    expect(lead.lastChannelId).toBe("ch-kuban");
    expect(db.touches.length).toBe(1);
    expect(db.touches[0]).toMatchObject({ leadId: lead.id, listingId: "li-1", channelId: "ch-kuban" });
    expect(api.sent[0].text).toContain("Люцерна Вега 87");
  });

  test("повторный lst_ из другого канала: first touch не меняется, last — обновляется, история растёт", async () => {
    const db = new MemoryDb();
    db.positions.push({
      id: "pos-1",
      name: "Люцерна Вега 87",
      salePrice: 212.75,
      volumeKg: 20_000,
      status: "IN_STOCK",
    });
    db.listingTouches.push(
      { listingId: "li-1", positionId: "pos-1", channelId: "ch-kuban" },
      { listingId: "li-2", positionId: "pos-1", channelId: "ch-don" },
    );
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    /* Одна и та же позиция опубликована в ДВУХ каналах. */
    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 6002, text: "/start lst_li-1", messageId: 11 })),
      deps,
    );
    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 6002, text: "/start lst_li-2", messageId: 12 })),
      deps,
    );

    expect(db.leads.length).toBe(1); /* один покупатель */
    const lead = db.leads[0];
    expect(lead.firstChannelId).toBe("ch-kuban"); /* первый источник неизменен */
    expect(lead.lastChannelId).toBe("ch-don"); /* последний источник обновлён */
    expect(db.touches.length).toBe(2); /* история касаний: оба объявления */
    /* Дедуп: повторное касание того же объявления не плодит записи. */
    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 6002, text: "/start lst_li-1", messageId: 13 })),
      deps,
    );
    expect(db.touches.length).toBe(2);
    expect(lead.lastChannelId).toBe("ch-kuban"); /* last touch вернулся к первому */
    expect(lead.firstChannelId).toBe("ch-kuban");
  });

  test("старая ссылка pos_: позиция подставляется, канал НЕ приписывается", async () => {
    const db = new MemoryDb();
    db.positions.push({
      id: "pos-1",
      name: "Пшеница 3 класс",
      salePrice: 15.5,
      volumeKg: 120_000,
      status: "IN_STOCK",
    });
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 6003, text: "/start pos_pos-1", messageId: 14 })),
      deps,
    );

    const lead = db.leads[0];
    expect(lead.positionId).toBe("pos-1");
    /* Источник неизвестен: позиция могла публиковаться в разных каналах. */
    expect(lead.firstChannelId).toBeNull();
    expect(lead.lastChannelId).toBeNull();
    expect(db.touches.length).toBe(0);
  });

  test("неизвестный lst_: приветствие без выдуманного источника", async () => {
    const db = new MemoryDb();
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 6004, text: "/start lst_li-unknown", messageId: 15 })),
      deps,
    );

    expect(db.leads.length).toBe(1);
    expect(db.leads[0].firstChannelId).toBeNull();
    expect(db.leads[0].lastChannelId).toBeNull();
    expect(db.touches.length).toBe(0);
    expect(api.sent[0].text).toContain("Здравствуйте!");
  });

  test("обычный /start: приветствие без позиции, лид создаётся", async () => {
    const db = new MemoryDb();
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 5002, text: "/start", messageId: 2 })),
      deps,
    );

    expect(db.leads.length).toBe(1);
    expect(db.leads[0].positionId).toBe(null);
    expect(api.sent[0].text).toContain("Здравствуйте!");
  });

  test("/start от владельца: статус, лид не создаётся", async () => {
    const db = new MemoryDb();
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 7867317588, text: "/start", messageId: 3 })),
      deps,
    );

    expect(db.leads.length).toBe(0);
    expect(api.sent[0].text).toContain("Бот АгроПоста работает");
  });

  test("прочая команда (/stop) — молча, без лида", async () => {
    const db = new MemoryDb();
    const api = new FakeApi();
    const deps = makeDeps(db, api);

    await handleTelegramUpdate(
      update(buyerMessage({ fromId: 5003, text: "/stop", messageId: 4 })),
      deps,
    );

    expect(db.leads.length).toBe(0);
    expect(api.sent.length).toBe(0);
  });
});

describe("Извлечение интереса", () => {
  test("культура + класс качества", () => {
    expect(extractInterest("Сколько стоит пшеница 3 класс?", ["Пшеница", "Ячмень"])).toBe(
      "Пшеница 3 класс",
    );
  });

  test("только культура", () => {
    expect(extractInterest("Нужен ячмень 200 тонн", ["Пшеница", "Ячмень"])).toBe("Ячмень");
  });

  test("ничего не найдено — null", () => {
    expect(extractInterest("Здравствуйте", ["Пшеница"])).toBe(null);
  });
});
