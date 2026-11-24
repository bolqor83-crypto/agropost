/**
 * Интеграционный тест (этап 5, часть D): сделка, созданная сервисом
 * сделок, реально меняет аналитику. Используем настоящий createDeal
 * (экономика считается на сервере) и memory-БД обоих модулей.
 * Второй сценарий: лид без ответа → советник предлагает «Ответить».
 */

import { describe, expect, test } from "bun:test";
import type { AiAdviceContext } from "@shared/ai";
import { seededDb } from "../../deals/__tests__/fixtures.js";
import { createDeal, dealAction } from "../../deals/service.js";
import { buildSummary } from "../service.js";
import { adviceContextToPrompt } from "../../ai/context.js";
import { fallbackAdvice } from "../../ai/fallback.js";
import { MemoryAnalyticsDb, daysAgo, leadFact } from "./fixtures.js";
import type { DealFactRow } from "../types.js";

const T = Date.now();

/** DealRow → DealFactRow (плоское отображение, как в prismaAnalyticsDb). */
function toFact(row: Awaited<ReturnType<typeof createDeal>>): DealFactRow {
  return {
    id: row.id,
    number: row.number,
    leadId: row.leadId,
    positionId: row.positionId,
    cultureName: row.position?.cultureName ?? null,
    attributes: row.position?.attributes ?? null,
    volumeKg: row.volumeKg,
    salePrice: row.salePrice,
    margin: row.margin,
    status: row.status,
    createdAt: row.createdAt,
  };
}

describe("сделка → аналитика обновилась", () => {
  test("создали и закрыли сделку — выручка, маржа и топ-культура изменились", async () => {
    const dealsDb = seededDb();
    const analyticsDb = new MemoryAnalyticsDb();

    /* До сделки: аналитика пустая. */
    const before = await buildSummary("all", { db: analyticsDb }, T);
    expect(before.dealsTotal).toBe(0);
    expect(before.margin).toBe(0);
    expect(before.topCultures).toEqual([]);

    /* Реальное создание сделки из лида: экономика на сервере. */
    const deal = await createDeal(
      { leadId: "lead-1", volumeKg: 1000 },
      { db: dealsDb },
    );
    expect(deal.status).toBe("DRAFT");
    expect(deal.margin).toBe(14000); /* (100 − 80) × 1000 − 6000 */

    /* Статусный граф: DRAFT → PAID → SHIPPED → DELIVERED → CLOSED. */
    await dealAction(deal.id, "pay", { db: dealsDb });
    await dealAction(deal.id, "ship", { db: dealsDb }, { method: "PICKUP", fromCity: "ст. Павловская", toCity: "Краснодар", cost: 0 });
    await dealAction(deal.id, "deliver", { db: dealsDb });
    await dealAction(deal.id, "close", { db: dealsDb });

    /* Аналитика видит закрытую сделку (row из БД, не снимок DRAFT). */
    const closedRow = (await dealsDb.findDeal(deal.id))!;
    expect(closedRow.status).toBe("CLOSED");
    analyticsDb.deals.push(toFact(closedRow));
    const after = await buildSummary("all", { db: analyticsDb }, T);
    expect(after.dealsTotal).toBe(1);
    expect(after.dealsClosed).toBe(1);
    expect(after.revenue).toBe(100000); /* 100 ₽/кг × 1000 кг */
    expect(after.margin).toBe(14000);
    expect(after.topCultures[0].name).toBe("Люцерна");
    expect(after.topCultures[0].margin).toBe(14000);
    expect(after.averageCheck).toBe(100000);
    expect(after.lowData).toBe(true); /* 1 < 3 */
  });
});

describe("лид → советник предлагает ответить", () => {
  test("новый лид в контексте (без ответа, 4 дня) → действие «Ответить»", () => {
    const lead = leadFact({ id: "lead-9", createdAt: daysAgo(4, T) });
    const ctx: AiAdviceContext = {
      activeLeads: [],
      recentListings: [],
      staleListings: [],
      positionsInStock: [],
      cooledDownChannels: [],
      inboxLeads: [
        {
          id: lead.id,
          name: "Пётр",
          interest: "люцерна 2 класс",
          status: "NEW",
          days: 4,
          answered: false,
        },
      ],
      newLeadsToday: 1,
    };

    const prompt = adviceContextToPrompt(ctx);
    expect(prompt).toContain("Пётр");
    expect(prompt).toContain("без ответа");

    const data = fallbackAdvice(ctx);
    expect(data.actions.length).toBe(1);
    expect(data.actions[0].link).toBe("/inbox");
    expect(data.actions[0].action).toContain("Ответить");
  });
});
