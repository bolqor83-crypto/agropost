/**
 * Юнит-тесты сервиса аналитики (этап 5.1):
 * - сводка: выручка по closedAt (сделка создана в прошлом периоде,
 *   закрыта сегодня — попадает в сегодняшний период);
 * - конверсия по УНИКАЛЬНЫМ лидам (один лид с 2 сделками = 1, ≤ 100%);
 * - каналы: last-touch атрибуция, подписчики ≠ охват;
 * - позиции: daysInStock от stockSince (null = неизвестно),
 *   средневзвешенная цена продажи;
 * - >500 лидов / >1000 объявлений — тихих лимитов нет;
 * - московский «сегодня» для newLeadsToday.
 */

import { describe, expect, test } from "bun:test";
import { buildChannels, buildPositions, buildReadiness, buildSummary } from "../service.js";
import { channelFact, dealFact, daysAgo, leadFact, MemoryAnalyticsDb, positionFact } from "./fixtures.js";
import { dayStartMoscow } from "@shared/time";

/* Время фиксировано: «сегодня» = T (12:00 UTC = 15:00 Москвы). */
const T = Date.UTC(2026, 10, 24, 12, 0, 0);

function seededDb(): MemoryAnalyticsDb {
  const db = new MemoryAnalyticsDb();

  db.positions.push(
    positionFact({
      id: "pos-1",
      cultureName: "Люцерна",
      attributes: { sort: "Вега 87" },
      volumeKg: 20000,
      salePrice: 100,
      createdAt: daysAgo(30, T),
      stockSince: daysAgo(30, T),
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
      stockSince: daysAgo(3, T),
    }),
    /* Старая позиция: stockSince неизвестен (до этапа 5.1). */
    positionFact({
      id: "pos-old",
      cultureId: "culture-3",
      cultureName: "Эспарцет",
      volumeKg: 500,
      salePrice: 90,
      createdAt: daysAgo(90, T),
      stockSince: null,
    }),
  );

  db.channels.push(
    channelFact({ id: "ch-a", name: "AgroMarket", lastPublishedAt: daysAgo(1, T) }),
    channelFact({
      id: "ch-b",
      name: "Юг агро",
      subscribersCount: 8000,
      averageReach: 3000,
      listingsCount: 5,
      publications: 9,
      lastPublishedAt: daysAgo(20, T),
    }),
    /* Охват неизвестен: только подписчики. */
    channelFact({ id: "ch-c", name: "Дон барахолка", subscribersCount: 800, averageReach: null }),
  );

  return db;
}

describe("сводка (этап 5.1)", () => {
  test("выручка по closedAt: сделка создана 10 дней назад, закрыта вчера — в выручке недели", async () => {
    const db = seededDb();
    db.deals.push(
      dealFact({
        id: "deal-1",
        number: "СД-0001",
        positionId: "pos-1",
        cultureName: "Люцерна",
        volumeKg: 1000,
        salePrice: 100,
        margin: 14000,
        createdAt: daysAgo(10, T), /* создана 10 дней назад — вне недели */
        closedAt: daysAgo(1, T), /* закрыта вчера — ВНУТРИ недели */
      }),
    );

    const summary = await buildSummary("week", { db }, T);
    expect(summary.dealsTotal).toBe(0); /* созданных за неделю нет */
    expect(summary.dealsClosed).toBe(1); /* а закрытых — есть */
    expect(summary.revenue).toBe(100000); /* 100 ₽/кг × 1000 кг */
    expect(summary.margin).toBe(14000);
    expect(summary.averageCheck).toBe(100000);
  });

  test("закрытая в прошлом месяце сделка не попадает в выручку текущей недели", async () => {
    const db = seededDb();
    db.deals.push(
      dealFact({
        id: "deal-2",
        volumeKg: 500,
        salePrice: 100,
        margin: 7000,
        createdAt: daysAgo(20, T),
        closedAt: daysAgo(20, T),
      }),
    );
    const summary = await buildSummary("week", { db }, T);
    expect(summary.revenue).toBe(0);
    expect(summary.dealsClosed).toBe(0);
    /* А за «всё время» — учтена. */
    const all = await buildSummary("all", { db }, T);
    expect(all.revenue).toBe(50000);
    expect(all.dealsClosed).toBe(1);
  });

  test("legacy-закрытая сделка без closedAt: только в «всё время»", async () => {
    const db = seededDb();
    db.deals.push(
      dealFact({
        id: "deal-legacy",
        volumeKg: 200,
        salePrice: 50,
        margin: 1000,
        createdAt: daysAgo(15, T),
        closedAt: null, /* дата закрытия неизвестна — не выдумываем */
      }),
    );
    const week = await buildSummary("week", { db }, T);
    expect(week.dealsClosed).toBe(0);
    const all = await buildSummary("all", { db }, T);
    expect(all.dealsClosed).toBe(1);
    expect(all.revenue).toBe(10000);
  });

  test("конверсия по уникальным лидам: 1 лид с 2 сделками = 1 сконвертированный, не 200%", async () => {
    const db = seededDb();
    db.leads.push(
      leadFact({ id: "lead-1", createdAt: daysAgo(2, T), lastChannelId: "ch-a" }),
      leadFact({ id: "lead-2", createdAt: daysAgo(2, T), lastChannelId: "ch-b" }),
    );
    /* У lead-1 ДВЕ сделки, у lead-2 ни одной. */
    db.deals.push(
      dealFact({
        id: "deal-1",
        leadId: "lead-1",
        volumeKg: 100,
        salePrice: 100,
        margin: 2000,
        createdAt: daysAgo(1, T),
        closedAt: daysAgo(1, T),
      }),
      dealFact({
        id: "deal-2",
        leadId: "lead-1",
        volumeKg: 100,
        salePrice: 100,
        margin: 2000,
        createdAt: daysAgo(1, T),
        closedAt: daysAgo(1, T),
      }),
    );

    const summary = await buildSummary("week", { db }, T);
    expect(summary.leadsTotal).toBe(2);
    expect(summary.leadsConverted).toBe(1); /* УНИКАЛЬНЫЙ лид */
    expect(summary.conversion).toBe(50); /* 1/2, не 100% */
  });

  test("конверсия не превышает 100% при множестве сделок одного лида", async () => {
    const db = seededDb();
    db.leads.push(leadFact({ id: "lead-1", createdAt: daysAgo(1, T) }));
    db.deals.push(
      dealFact({ id: "d1", leadId: "lead-1", createdAt: daysAgo(1, T), closedAt: daysAgo(1, T) }),
      dealFact({ id: "d2", leadId: "lead-1", createdAt: daysAgo(1, T), closedAt: daysAgo(1, T) }),
      dealFact({ id: "d3", leadId: "lead-1", createdAt: daysAgo(1, T), closedAt: daysAgo(1, T) }),
      dealFact({ id: "d4", leadId: "lead-1", createdAt: daysAgo(1, T), closedAt: daysAgo(1, T) }),
    );
    const summary = await buildSummary("all", { db }, T);
    expect(summary.conversion).toBe(100);
  });

  test("newLeadsToday — по московскому дню", async () => {
    const db = seededDb();
    /* Вчерашний лид по UTC ещё «вчерашний» и по Москве. */
    db.leads.push(
      leadFact({ id: "l-1", createdAt: new Date(T - 26 * 3600_000) }),
      leadFact({ id: "l-2", createdAt: new Date(T - 2 * 3600_000) }),
    );
    const summary = await buildSummary("week", { db }, T);
    expect(summary.newLeadsToday).toBe(1);
    expect(summary.leadsTotal).toBe(2);
  });

  test("топ-культуры: маржа по закрытым за период", async () => {
    const db = seededDb();
    db.deals.push(
      dealFact({
        id: "d1",
        positionId: "pos-1",
        cultureName: "Люцерна",
        volumeKg: 1000,
        margin: 14000,
        createdAt: daysAgo(2, T),
        closedAt: daysAgo(2, T),
      }),
      dealFact({
        id: "d2",
        positionId: "pos-2",
        cultureName: "Грецкий орех",
        volumeKg: 100,
        margin: 5000,
        createdAt: daysAgo(2, T),
        closedAt: daysAgo(2, T),
      }),
    );
    const summary = await buildSummary("week", { db }, T);
    expect(summary.topCultures[0]).toEqual({ name: "Люцерна", margin: 14000, dealsCount: 1 });
    expect(summary.topCultures[1]?.name).toBe("Грецкий орех");
  });

  test(">500 лидов и >1000 сделок: тихих лимитов нет — итоги полные", async () => {
    const db = new MemoryAnalyticsDb();
    for (let i = 0; i < 600; i += 1) {
      db.leads.push(leadFact({ id: `lead-${i}`, createdAt: daysAgo(1, T) }));
    }
    for (let i = 0; i < 600; i += 1) {
      db.deals.push(
        dealFact({
          id: `deal-${i}`,
          leadId: `lead-${i}`,
          volumeKg: 10,
          salePrice: 100,
          margin: 300,
          createdAt: daysAgo(1, T),
          closedAt: daysAgo(1, T),
        }),
      );
    }
    const summary = await buildSummary("all", { db }, T);
    expect(summary.leadsTotal).toBe(600); /* раньше обрезалось на 500 */
    expect(summary.leadsConverted).toBe(600);
    expect(summary.dealsTotal).toBe(600);
    expect(summary.revenue).toBe(600 * 1000); /* 100 ₽/кг × 10 кг × 600 */
  });
});

describe("каналы (этап 5.1)", () => {
  test("аттрибуция last-touch по lastChannelId; одна позиция в двух каналах", async () => {
    const db = seededDb();
    /* Покупатель перешёл по объявлению из ch-a, потом из ch-b. */
    db.leads.push(
      leadFact({
        id: "lead-1",
        createdAt: daysAgo(2, T),
        firstChannelId: "ch-a",
        lastChannelId: "ch-b",
      }),
    );
    db.deals.push(
      dealFact({
        id: "d-1",
        leadId: "lead-1",
        createdAt: daysAgo(1, T),
        closedAt: daysAgo(1, T),
        margin: 5000,
      }),
    );

    const rows = await buildChannels("leads", { db }, T);
    const chA = rows.find((r) => r.id === "ch-a")!;
    const chB = rows.find((r) => r.id === "ch-b")!;
    /* Last touch = ch-b: лид и сделка на нём. */
    expect(chB.leads).toBe(1);
    expect(chB.deals).toBe(1);
    expect(chB.conversion).toBe(100);
    expect(chA.leads).toBe(0); /* last-touch — не first-touch */
  });

  test("подписчики и охват — отдельные поля, без подмены", async () => {
    const db = seededDb();
    const rows = await buildChannels("margin", { db }, T);
    const chB = rows.find((r) => r.id === "ch-b")!;
    expect(chB.subscribersCount).toBe(8000);
    expect(chB.averageReach).toBe(3000);
    const chC = rows.find((r) => r.id === "ch-c")!;
    expect(chC.subscribersCount).toBe(800);
    expect(chC.averageReach).toBeNull(); /* охват неизвестен — null, не 800 */
  });

  test("конверсия канала по уникальным лидам", async () => {
    const db = seededDb();
    db.leads.push(
      leadFact({ id: "l1", createdAt: daysAgo(3, T), lastChannelId: "ch-a" }),
      leadFact({ id: "l2", createdAt: daysAgo(3, T), lastChannelId: "ch-a" }),
    );
    /* У обоих по сделке, у l1 — две: конверсия 2/2 = 100%, не 150%. */
    db.deals.push(
      dealFact({ id: "d1", leadId: "l1", createdAt: daysAgo(2, T), closedAt: daysAgo(2, T), margin: 1000 }),
      dealFact({ id: "d2", leadId: "l1", createdAt: daysAgo(2, T), closedAt: daysAgo(2, T), margin: 1000 }),
      dealFact({ id: "d3", leadId: "l2", createdAt: daysAgo(2, T), closedAt: daysAgo(2, T), margin: 1000 }),
    );
    const rows = await buildChannels("leads", { db }, T);
    const chA = rows.find((r) => r.id === "ch-a")!;
    expect(chA.leads).toBe(2);
    expect(chA.deals).toBe(3);
    expect(chA.conversion).toBe(100); /* 2 уникальных из 2 */
    expect(chA.avgMargin).toBe(1000); /* средняя маржа закрытых */
  });

  test("лиды без достоверного источника не приписываются каналу", async () => {
    const db = seededDb();
    db.leads.push(leadFact({ id: "l1", createdAt: daysAgo(1, T) })); /* без lastChannelId */
    const rows = await buildChannels("leads", { db }, T);
    expect(rows.every((r) => r.leads === 0)).toBe(true);
  });
});

describe("позиции (этап 5.1)", () => {
  test("daysInStock от stockSince; null для старых позиций", async () => {
    const db = seededDb();
    db.lastPublished = [["pos-1", daysAgo(2, T)]];
    const rows = await buildPositions("margin", { db }, T);
    const pos1 = rows.find((r) => r.id === "pos-1")!;
    expect(pos1.daysInStock).toBe(30);
    const posOld = rows.find((r) => r.id === "pos-old")!;
    expect(posOld.daysInStock).toBeNull(); /* «неизвестно», не выдуманная дата */
  });

  test("средневзвешенная цена: выручка / объём, не среднее цен", async () => {
    const db = seededDb();
    /* 2 сделки pos-1: 100 ₽/кг × 900 кг и 50 ₽/кг × 100 кг.
       Средневзвешенная = (90000 + 5000) / 1000 = 95.
       Простое среднее цен дало бы 75 — НЕ используем. */
    db.deals.push(
      dealFact({ id: "d1", positionId: "pos-1", volumeKg: 900, salePrice: 100, margin: 9000, createdAt: daysAgo(5, T), closedAt: daysAgo(5, T) }),
      dealFact({ id: "d2", positionId: "pos-1", volumeKg: 100, salePrice: 50, margin: 0, createdAt: daysAgo(5, T), closedAt: daysAgo(5, T) }),
    );
    const rows = await buildPositions("margin", { db }, T);
    const pos1 = rows.find((r) => r.id === "pos-1")!;
    expect(pos1.avgSalePrice).toBe(95);
    expect(pos1.revenue).toBe(95000);
    expect(pos1.volumeKg).toBe(20000); /* остаток позиции */
  });

  test("без закрытых сделок avgSalePrice = null, revenue = 0", async () => {
    const db = seededDb();
    const rows = await buildPositions("margin", { db }, T);
    const pos1 = rows.find((r) => r.id === "pos-1")!;
    expect(pos1.avgSalePrice).toBeNull();
    expect(pos1.revenue).toBe(0);
    expect(pos1.dealsCount).toBe(0);
  });
});

describe("readiness (этап 6 — 7 пунктов запуска)", () => {
  test("7 пунктов, прогресс считается, парсер больше не в списке", () => {
    const dto = buildReadiness({
      sellerComplete: true,
      suppliersCount: 1,
      positionsCount: 1,
      channelsCount: 1,
      botInChannel: true,
      aiConfigured: false,
      r2Configured: false,
    });
    expect(dto.items.length).toBe(7);
    expect(dto.total).toBe(7);
    expect(dto.items.find((i) => i.id === "parser")).toBeUndefined();
    expect(dto.items.find((i) => i.id === "ai")?.done).toBe(false);
    expect(dto.ready).toBe(5);
  });

  test("полный чек-лист — 7 из 7", () => {
    const dto = buildReadiness({
      sellerComplete: true,
      suppliersCount: 2,
      positionsCount: 3,
      channelsCount: 1,
      botInChannel: true,
      aiConfigured: true,
      r2Configured: true,
    });
    expect(dto.ready).toBe(7);
  });
});

describe("московские границы (shared/time)", () => {
  test("dayStartMoscow: полночь Москвы = 21:00 предыдущего UTC-дня", () => {
    /* 24.11.2026 12:00 UTC → московская полночь = 23.11 21:00 UTC. */
    const start = dayStartMoscow(T);
    expect(start).toBe(Date.UTC(2026, 10, 23, 21, 0, 0));
  });
});
