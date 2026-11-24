/**
 * Юнит-тесты сервиса аналитики (этап 5, часть D):
 * сводка по периодам, каналы с сортировкой и аттрибуцией лидов,
 * позиции с сортировкой, чек-лист readiness — всё на памяти.
 */

import { describe, expect, test } from "bun:test";
import { buildChannels, buildPositions, buildReadiness, buildSummary } from "../service.js";
import {
  channelFact,
  dealFact,
  daysAgo,
  leadFact,
  MemoryAnalyticsDb,
  positionFact,
} from "./fixtures.js";

/* Время фиксировано: «сегодня» = T. Все даты — от T. */
const T = Date.UTC(2026, 10, 24, 12, 0, 0);

function seededDb(): MemoryAnalyticsDb {
  const db = new MemoryAnalyticsDb();

  /* Позиции: люцерна (старая, много маржи) и орех (свежий). */
  db.positions.push(
    positionFact({
      id: "pos-1",
      cultureName: "Люцерна",
      attributes: { sort: "Вега 87" },
      volumeKg: 20000,
      salePrice: 100,
      createdAt: daysAgo(30, T),
    }),
    positionFact({
      id: "pos-2",
      cultureId: "culture-2",
      cultureName: "Грецкий орех",
      cultureType: "NUT",
      attributes: { sort: "Идеал" },
      volumeKg: 4000,
      salePrice: 250,
      createdAt: daysAgo(3, T),
    }),
  );

  /* Сделки: закрытые (старая вне недели и недавние), активная. */
  db.deals.push(
    /* Старая закрытая — вне недели, внутри месяца. */
    dealFact({
      id: "deal-1",
      number: "СД-0001",
      positionId: "pos-1",
      cultureName: "Люцерна",
      attributes: { sort: "Вега 87" },
      volumeKg: 1000,
      salePrice: 100,
      margin: 14000,
      createdAt: daysAgo(10, T),
    }),
    /* Свежая закрытая люцерна (из лида lead-1). */
    dealFact({
      id: "deal-2",
      number: "СД-0002",
      leadId: "lead-1",
      positionId: "pos-1",
      cultureName: "Люцерна",
      attributes: { sort: "Вега 87" },
      volumeKg: 500,
      salePrice: 100,
      margin: 7000,
      createdAt: daysAgo(2, T),
    }),
    /* Свежая закрытая ореховая (без лида). */
    dealFact({
      id: "deal-3",
      number: "СД-0003",
      positionId: "pos-2",
      cultureName: "Грецкий орех",
      attributes: { sort: "Идеал" },
      volumeKg: 200,
      salePrice: 250,
      margin: 5000,
      createdAt: daysAgo(1, T),
    }),
    /* Активная сделка — в счётчики, не в выручку. */
    dealFact({
      id: "deal-4",
      number: "СД-0004",
      positionId: "pos-1",
      cultureName: "Люцерна",
      attributes: { sort: "Вега 87" },
      volumeKg: 300,
      salePrice: 100,
      margin: 4200,
      status: "AWAITING_PAYMENT",
      createdAt: daysAgo(0, T),
    }),
  );

  /* Каналы: A (публикация pos-1 вчера → cooldown), B (давно), C (никогда). */
  db.channels.push(
    channelFact({
      id: "ch-a",
      name: "AgroMarket",
      lastPublishedAt: daysAgo(1, T),
    }),
    channelFact({
      id: "ch-b",
      name: "Юг агро",
      subscribersCount: 8000,
      averageReach: 3000,
      listingsCount: 5,
      publications: 9,
      lastPublishedAt: daysAgo(20, T),
    }),
    channelFact({
      id: "ch-c",
      name: "Дон барахолка",
      listingsCount: 0,
      publications: 0,
      lastPublishedAt: null,
    }),
  );

  /* Лиды: lead-1 по pos-1 (публиковалась в ch-b последней), lead-2 без позиции. */
  db.leads.push(
    leadFact({ id: "lead-1", positionId: "pos-1", createdAt: daysAgo(3, T) }),
    leadFact({ id: "lead-2", createdAt: daysAgo(0, T) }),
  );

  /* Листинги: pos-1 публиковалась в ch-a давно и в ch-b позднее. */
  db.listings.push(
    {
      id: "lst-1",
      channelId: "ch-a",
      positionId: "pos-1",
      status: "PUBLISHED",
      publishedAt: daysAgo(9, T),
    },
    {
      id: "lst-2",
      channelId: "ch-b",
      positionId: "pos-1",
      status: "PUBLISHED",
      publishedAt: daysAgo(2, T),
    },
    {
      id: "lst-3",
      channelId: "ch-c",
      positionId: "pos-2",
      status: "DRAFT",
      publishedAt: null,
    },
  );

  return db;
}

describe("сводка (summary)", () => {
  test("неделя: свежие закрытые сделки, конверсия, аттрибуция лидов", async () => {
    const db = seededDb();
    const s = await buildSummary("week", { db }, T);

    /* Вне недели: deal-1 (10 дней). Внутри: deal-2, deal-3, deal-4. */
    expect(s.dealsTotal).toBe(3);
    expect(s.dealsClosed).toBe(2);
    expect(s.dealsActive).toBe(1);
    /* Выручка = 500×100 + 200×250 = 100 000. */
    expect(s.revenue).toBe(100000);
    /* Маржа = 7000 + 5000. */
    expect(s.margin).toBe(12000);
    expect(s.averageCheck).toBe(50000);
    expect(s.lowData).toBe(true); /* закрытых < 3 */

    /* Лиды за неделю: оба (lead-1 3 дня назад, lead-2 сегодня). */
    expect(s.leadsTotal).toBe(2);
    /* Стала сделкой: lead-1 (deal-2.leadId). */
    expect(s.leadsConverted).toBe(1);
    expect(s.conversion).toBe(50);

    /* Топ-каналы: pos-1 последний раз публиковалась в ch-b → лид lead-1 там. */
    expect(s.topChannels.length).toBe(1);
    expect(s.topChannels[0].name).toBe("Юг агро");
    expect(s.topChannels[0].leads).toBe(1);
    expect(s.topChannels[0].deals).toBe(1);

    expect(s.newLeadsToday).toBe(1);
    expect(s.period).toBe("week");
  });

  test("месяц: включает сделку 10-дневной давности", async () => {
    const db = seededDb();
    const s = await buildSummary("month", { db }, T);
    expect(s.dealsTotal).toBe(4);
    expect(s.dealsClosed).toBe(3);
    expect(s.revenue).toBe(200000); /* + deal-1: 1000×100 */
    expect(s.margin).toBe(26000);
    expect(s.lowData).toBe(false);
    /* Топ-культура по марже: Люцерна 21000 против Ореха 5000. */
    expect(s.topCultures[0].name).toBe("Люцерна");
    expect(s.topCultures[0].margin).toBe(21000);
    expect(s.topCultures[0].dealsCount).toBe(2);
  });

  test("всё время: все сделки и лиды", async () => {
    const db = seededDb();
    const s = await buildSummary("all", { db }, T);
    expect(s.dealsTotal).toBe(4);
    expect(s.leadsTotal).toBe(2);
    expect(s.conversion).toBe(50);
  });

  test("пустая база: нули, конверсия и средний чек — null", async () => {
    const db = new MemoryAnalyticsDb();
    const s = await buildSummary("week", { db }, T);
    expect(s.revenue).toBe(0);
    expect(s.margin).toBe(0);
    expect(s.dealsTotal).toBe(0);
    expect(s.averageCheck).toBeNull();
    expect(s.conversion).toBeNull();
    expect(s.topCultures).toEqual([]);
    expect(s.topChannels).toEqual([]);
    expect(s.lowData).toBe(true);
  });
});

describe("каналы (channels)", () => {
  test("сортировка по марже и по лидам; аттрибуция и конверсия", async () => {
    const db = seededDb();

    /* Добавим ch-a лиду: публикуем pos-2 в ch-a вчера — тогда у ch-a тоже лид. */
    db.listings.push({
      id: "lst-4",
      channelId: "ch-a",
      positionId: "pos-2",
      status: "PUBLISHED",
      publishedAt: daysAgo(1, T),
    });
    db.leads.push(leadFact({ id: "lead-3", positionId: "pos-2", createdAt: daysAgo(1, T) }));
    /* Сделка из lead-3 закрытая с маржой — у ch-a будет avgMargin. */
    db.deals.push(
      dealFact({
        id: "deal-5",
        number: "СД-0005",
        leadId: "lead-3",
        positionId: "pos-2",
        cultureName: "Грецкий орех",
        attributes: { sort: "Идеал" },
        volumeKg: 100,
        salePrice: 250,
        margin: 3000,
        createdAt: daysAgo(1, T),
      }),
    );

    const byMargin = await buildChannels("margin", { db }, T);
    /* ch-a: лид lead-3 → закрытая сделка (avgMargin 3000), у ch-b avgMargin 7000. */
    const a = byMargin.find((c) => c.id === "ch-a");
    const b = byMargin.find((c) => c.id === "ch-b");
    const c = byMargin.find((c) => c.id === "ch-c");
    expect(a && b).toBeTruthy();
    if (!a || !b || !c) throw new Error("нет каналов");

    expect(a.leads).toBe(1);
    expect(a.deals).toBe(1);
    expect(a.conversion).toBe(100);
    expect(a.avgMargin).toBe(3000);
    expect(a.listings).toBe(2);
    expect(a.publications).toBe(3);
    expect(a.daysSincePublication).toBe(1);

    /* ch-b: лид lead-1 (последняя публикация pos-1 — в ch-b) и сделка deal-2. */
    expect(b.leads).toBe(1);
    expect(b.avgMargin).toBe(7000);

    /* ch-c: ничего. */
    expect(c.leads).toBe(0);
    expect(c.conversion).toBeNull();
    expect(c.avgMargin).toBeNull();
    expect(c.lastPublishedAt).toBeNull();

    /* По марже: b (7000) → a (3000) → c (null → -1). */
    expect(byMargin.map((c) => c.id)).toEqual(["ch-b", "ch-a", "ch-c"]);

    const byLeads = await buildChannels("leads", { db }, T);
    /* 1 лид у обоих — вторичный ключ маржа. */
    expect(byLeads[0].id).toBe("ch-b");
  });
});

describe("позиции (positions)", () => {
  test("метрики, дни в наличии, сортировка по марже и остатку", async () => {
    const db = seededDb();
    const byMargin = await buildPositions("margin", { db }, T);

    expect(byMargin.length).toBe(2);
    /* Люцерна: закрытые deal-1, deal-2 (100 000 + 50 000) — выручка и маржа. */
    const luc = byMargin.find((p) => p.id === "pos-1");
    const nut = byMargin.find((p) => p.id === "pos-2");
    expect(luc && nut).toBeTruthy();
    if (!luc || !nut) throw new Error("нет позиций");

    expect(luc.title).toContain("Люцерна");
    expect(luc.title).toContain("Вега 87");
    expect(luc.dealsCount).toBe(3); /* deal-1, deal-2, deal-4 */
    expect(luc.revenue).toBe(150000);
    expect(luc.margin).toBe(21000);
    expect(luc.daysInStock).toBe(30);
    /* Последняя публикация pos-1 — ch-b 2 дня назад. */
    expect(luc.lastPublishedAt).toBe(daysAgo(2, T).toISOString());

    expect(nut.dealsCount).toBe(1);
    expect(nut.margin).toBe(5000);
    expect(nut.lastPublishedAt).toBeNull();

    /* Сортировка по марже: люцерна (21 000) сверху. */
    expect(byMargin[0].id).toBe("pos-1");

    const byStock = await buildPositions("stock", { db }, T);
    expect(byStock[0].id).toBe("pos-1"); /* 20 000 кг > 4 000 кг */
  });
});

describe("чек-лист «Перед запуском» (readiness)", () => {
  test("считает готовые пункты и разметку опций", () => {
    const r = buildReadiness({
      sellerComplete: true,
      suppliersCount: 2,
      positionsCount: 3,
      channelsCount: 1,
      botInChannel: false,
      aiConfigured: false,
      r2Configured: false,
    });
    expect(r.total).toBe(7);
    expect(r.ready).toBe(4);
    const ids = r.items.map((i) => i.id);
    expect(ids).toContain("requisites");
    expect(r.items.find((i) => i.id === "bot")?.done).toBe(false);
    expect(r.items.find((i) => i.id === "ai")?.optional).toBe(true);
    expect(r.items.find((i) => i.id === "r2")?.optional).toBe(true);
  });

  test("всё готово: 7 из 7", () => {
    const r = buildReadiness({
      sellerComplete: true,
      suppliersCount: 1,
      positionsCount: 1,
      channelsCount: 1,
      botInChannel: true,
      aiConfigured: true,
      r2Configured: true,
    });
    expect(r.ready).toBe(7);
    expect(r.items.every((i) => i.done)).toBe(true);
  });
});
