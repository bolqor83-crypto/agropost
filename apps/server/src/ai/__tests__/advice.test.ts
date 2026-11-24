/**
 * Этап 5, часть B: расширенный советник — fallback-правила
 * на новом контексте (лиды, сделки, позиции, каналы) и рендер
 * расширенного промпта. Golden-кейсы (3 сценария) — здесь же
 * без AI: правила должны отрабатывать одинаково всегда.
 */

import { describe, expect, test } from "bun:test";
import type { AiAdviceContext } from "@shared/ai";
import { adviceContextToPrompt } from "../context.js";
import { fallbackAdvice } from "../fallback.js";

function baseContext(over: Partial<AiAdviceContext> = {}): AiAdviceContext {
  return {
    activeLeads: [],
    recentListings: [],
    staleListings: [],
    positionsInStock: [],
    cooledDownChannels: [],
    ...over,
  };
}

const STALE_LEAD = {
  id: "lead-1",
  name: "Пётр Смирнов",
  interest: "люцерна 2 класс",
  status: "NEW" as const,
  days: 4,
  answered: false,
};

const FRESH_LEAD = {
  id: "lead-2",
  name: "Ольга",
  interest: "суданка",
  status: "NEW" as const,
  days: 0,
  answered: false,
};

const STALE_DEAL = {
  id: "deal-1",
  number: "СД-0007",
  buyerName: "Пётр Смирнов",
  status: "AWAITING_PAYMENT",
  amount: 100000,
  days: 3,
};

describe("советник этапа 5: зависшие лиды", () => {
  test("зависший лид → «Ответить», ссылка /inbox, приоритет high", () => {
    const data = fallbackAdvice(baseContext({ inboxLeads: [STALE_LEAD] }));
    expect(data.actions.length).toBe(1);
    const action = data.actions[0];
    expect(action.link).toBe("/inbox");
    expect(action.priority).toBe("high");
    expect(action.action).toContain("Ответить");
    expect(action.reason).toContain("3 дн");
  });

  test("сегодняшний лид без ответа → тоже «Ответить», но мягче", () => {
    const data = fallbackAdvice(baseContext({ inboxLeads: [FRESH_LEAD] }));
    expect(data.actions.length).toBe(1);
    expect(data.actions[0].link).toBe("/inbox");
    expect(data.actions[0].action).toContain("Ответить");
  });

  test("отвеченный лид не генерирует действие", () => {
    const data = fallbackAdvice(
      baseContext({
        positionsInStock: [{ title: "Люцерна", volumeKg: 3000, salePrice: 212.75 }],
        recentListings: [{ title: "Люцерна", channel: "AgroMarket", daysAgo: 1 }],
        inboxLeads: [{ ...STALE_LEAD, days: 1, answered: true }],
      }),
    );
    expect(data.actions.length).toBe(0);
  });
});

describe("советник этапа 5: зависшие сделки", () => {
  test("AWAITING_PAYMENT > 2 дней → «Напомнить об оплате»", () => {
    const data = fallbackAdvice(baseContext({ staleDeals: [STALE_DEAL] }));
    expect(data.actions.length).toBe(1);
    const action = data.actions[0];
    expect(action.link).toBe("/deals");
    expect(action.priority).toBe("high");
    expect(action.action).toContain("Напомнить");
    expect(action.reason).toContain("100000");
  });

  test("свежая сделка в PAID не генерирует напоминание", () => {
    const data = fallbackAdvice(
      baseContext({
        positionsInStock: [{ title: "Люцерна", volumeKg: 3000, salePrice: 212.75 }],
        recentListings: [{ title: "Люцерна", channel: "AgroMarket", daysAgo: 1 }],
        activeDeals: [{ ...STALE_DEAL, status: "PAID", days: 1 }],
      }),
    );
    expect(data.actions.length).toBe(0);
  });
});

describe("советник этапа 5: позиции и каналы", () => {
  test("позиция без публикаций > 14 дней → «Опубликовать позиции»", () => {
    const data = fallbackAdvice(
      baseContext({ unpublishedPositions: [{ id: "pos-1", title: "Суданка" }] }),
    );
    expect(data.actions.length).toBe(1);
    expect(data.actions[0].link).toBe("/publish");
    expect(data.actions[0].action).toContain("Опубликовать");
  });

  test("канал после cooldown → «Освежить каналы»", () => {
    const data = fallbackAdvice(baseContext({ channelsInCooldown: [{ name: "Дон агро", city: "Ростов-на-Дону", daysSince: 6 }] }));
    expect(data.actions.length).toBe(1);
    expect(data.actions[0].link).toBe("/channels");
    expect(data.actions[0].action).toContain("Освежить");
  });

  test("канал без публикаций > 14 дней → приоритет перед просто доступным", () => {
    const data = fallbackAdvice(
      baseContext({ staleChannels: [{ name: "Кубань барахолка", city: "Краснодар", daysSince: 20 }] }),
    );
    expect(data.actions.length).toBe(1);
    expect(data.actions[0].action).toContain("каналах");
  });
});

describe("golden-кейсы советника (fallback, без AI)", () => {
  /* Кейс 1: есть зависшие — лид и сделка. */
  test("кейс «есть зависшие»: 2 действия, лиды первыми", () => {
    const data = fallbackAdvice(
      baseContext({
        inboxLeads: [STALE_LEAD, FRESH_LEAD],
        staleDeals: [STALE_DEAL],
      }),
    );
    expect(data.actions.length).toBe(2);
    expect(data.actions[0].link).toBe("/inbox");
    expect(data.actions[1].link).toBe("/deals");
  });

  /* Кейс 2: всё под контролем. */
  test("кейс «всё ок»: ноль действий", () => {
    const data = fallbackAdvice(
      baseContext({
        recentListings: [{ title: "Люцерна «Вега 87»", channel: "AgroMarket", daysAgo: 1 }],
        positionsInStock: [{ title: "Люцерна «Вега 87»", volumeKg: 3000, salePrice: 212.75 }],
        inboxLeads: [{ ...STALE_LEAD, days: 2, answered: true }],
      }),
    );
    expect(data.actions.length).toBe(0);
  });

  /* Кейс 3: много сигналов — не больше 3. */
  test("кейс «много действий»: ровно 3, деньги первыми", () => {
    const data = fallbackAdvice(
      baseContext({
        activeLeads: [{ title: "Люцерна «Вега 87»", channel: "AgroMarket", days: 2 }],
        staleListings: [{ title: "Эспарцет «Песчаный 1251»", channel: "Юг агро", daysAgo: 5 }],
        positionsInStock: [{ title: "Люцерна «Вега 87»", volumeKg: 3000, salePrice: 212.75 }],
        cooledDownChannels: [{ name: "Юг агро", city: "Ростов-на-Дону", daysSince: 21 }],
        inboxLeads: [STALE_LEAD],
        staleDeals: [STALE_DEAL],
        unpublishedPositions: [{ id: "pos-9", title: "Суданка" }],
        channelsInCooldown: [{ name: "Дон агро", city: "Ростов-на-Дону", daysSince: 6 }],
        staleChannels: [{ name: "Кубань барахолка", city: "Краснодар", daysSince: 20 }],
        newLeadsToday: 2,
      }),
    );
    expect(data.actions.length).toBe(3);
    expect(data.actions[0].link).toBe("/inbox");
    expect(data.actions[1].link).toBe("/deals");
    expect(data.actions.every((a) => a.link.startsWith("/"))).toBe(true);
  });
});

describe("расширенный промпт советника", () => {
  test("новые секции контекста попадают в промпт", () => {
    const prompt = adviceContextToPrompt(
      baseContext({
        inboxLeads: [STALE_LEAD, { ...FRESH_LEAD, answered: true }],
        activeDeals: [{ ...STALE_DEAL, status: "PAID", days: 1 }],
        staleDeals: [STALE_DEAL],
        unpublishedPositions: [{ id: "pos-9", title: "Суданка" }],
        channelsInCooldown: [{ name: "Дон агро", daysSince: 6 }],
        staleChannels: [{ name: "Кубань барахолка", daysSince: 20 }],
        newLeadsToday: 1,
      }),
    );
    expect(prompt).toContain("Лиды инбокса");
    expect(prompt).toContain("без ответа");
    expect(prompt).toContain("СД-0007");
    expect(prompt).toContain("Суданка");
    expect(prompt).toContain("Новых лидов сегодня: 1");
    expect(prompt).toContain("ожидании оплаты");
  });
});
