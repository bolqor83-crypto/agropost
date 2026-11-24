/**
 * Тесты уведомителя владельцу (часть F ТЗ): троттлинг 60 c,
 * склейка нескольких сообщений в один дайджест, кнопка «Открыть инбокс».
 */

import { describe, expect, test } from "bun:test";
import { OwnerNotifier } from "../notifier.js";
import { FakeApi } from "./fixtures.js";

function makeNotifier(api: FakeApi): OwnerNotifier {
  return new OwnerNotifier({
    api,
    ownerId: 7867317588,
    webUrl: "https://agropost-web.onrender.com",
  });
}

describe("OwnerNotifier", () => {
  test("первое сообщение уходит сразу, с кнопкой инбокса", async () => {
    const api = new FakeApi();
    const notifier = makeNotifier(api);

    notifier.pushNewMessage({ leadId: "l1", from: "@ivan", text: "Сколько стоит пшеница?" });
    await new Promise((r) => setTimeout(r, 10));

    expect(api.sent.length).toBe(1);
    expect(api.sent[0].chatId).toBe(7867317588);
    expect(api.sent[0].text).toContain("@ivan");
    expect(api.sent[0].text).toContain("Сколько стоит пшеница?");
    expect(JSON.stringify(api.sent[0].opts?.replyMarkup)).toContain("/inbox");
  });

  test("второе в ту же минуту склеивается в дайджест при flush", async () => {
    const api = new FakeApi();
    const notifier = makeNotifier(api);

    notifier.pushNewMessage({ leadId: "l1", from: "@ivan", text: "Вопрос 1" });
    await new Promise((r) => setTimeout(r, 10));
    expect(api.sent.length).toBe(1);

    notifier.pushNewMessage({ leadId: "l2", from: "@anna", text: "Вопрос 2" });
    notifier.pushNewMessage({ leadId: "l3", from: "@oleg", text: "Вопрос 3" });
    expect(api.sent.length).toBe(1); /* Пока в очереди, не отправлено */

    await notifier.flush();
    expect(api.sent.length).toBe(2);
    const digest = api.sent[1].text;
    expect(digest).toContain("2 новых сообщения");
    expect(digest).toContain("@anna");
    expect(digest).toContain("@oleg");
  });

  test("длинный текст обрезается", async () => {
    const api = new FakeApi();
    const notifier = makeNotifier(api);

    const long = "а".repeat(300);
    notifier.pushNewMessage({ leadId: "l1", from: "@ivan", text: long });
    await new Promise((r) => setTimeout(r, 10));

    expect(api.sent[0].text).toContain("…");
    expect(api.sent[0].text.length).toBeLessThan(200);
  });

  test("publishError уходит напрямую", async () => {
    const api = new FakeApi();
    const notifier = makeNotifier(api);

    notifier.publishError("Канал X", "бот не администратор");
    await new Promise((r) => setTimeout(r, 10));

    expect(api.sent.length).toBe(1);
    expect(api.sent[0].text).toContain("Не удалось опубликовать");
    expect(api.sent[0].text).toContain("Канал X");
  });

  test("api = null: не падает, ничего не отправляет", async () => {
    const notifier = new OwnerNotifier({
      api: null,
      ownerId: 7867317588,
      webUrl: "https://agropost-web.onrender.com",
    });
    notifier.pushNewMessage({ leadId: "l1", from: "@ivan", text: "Привет" });
    await notifier.flush();
    /* Просто не бросило — уже успех. */
  });
});
