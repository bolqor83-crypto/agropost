import { describe, expect, test } from "bun:test";
import {
  fallbackAdvice,
  fallbackListing,
  fallbackLogistics,
  fallbackPriceAnalysis,
  fallbackReply,
} from "../fallback.js";
import { seedPosition } from "./fixtures.js";

const pos1 = seedPosition("pos-1");
const pos3 = seedPosition("pos-3");

describe("fallback", () => {
  test("listing: шаблон без поставщика, с ценой и лимитом заголовка", () => {
    const data = fallbackListing(pos1, "avito");
    expect(data.title.length).toBeLessThanOrEqual(70);
    expect(data.body).toContain("212.75");
    expect(data.body).not.toContain("Агро-Юг");
    expect(data.body).not.toContain("Павловская");
    expect(data.tags.length).toBeGreaterThan(0);
    expect(data.charCount).toBe(data.body.length);
  });

  test("reply: не выдумывает и не называет поставщика", () => {
    const data = fallbackReply(pos1, "Сколько стоит и как доставляете?");
    expect(data.reply.length).toBeLessThanOrEqual(1000);
    expect(data.reply).toContain("212,75");
    expect(data.reply).not.toContain("Агро-Юг");
    expect(data.includes.length).toBeGreaterThan(0);
  });

  test("reply: неизвестный вопрос → нейтральный ответ", () => {
    const data = fallbackReply(pos3, "Какая кислотность?");
    expect(data.reply.length).toBeGreaterThan(20);
    expect(data.reply).not.toContain("кислотность");
    expect(data.reply).not.toContain("ОрехПром");
  });

  test("advice: не больше 3 действий и только внутренние ссылки", () => {
    const data = fallbackAdvice({
      activeLeads: [{ title: "Люцерна", channel: "AgroMarket", days: 2 }],
      recentListings: [],
      staleListings: [
        { title: "Эспарцет", channel: "Юг агро", daysAgo: 5 },
        { title: "Суданка", channel: "Дон", daysAgo: 7 },
      ],
      positionsInStock: [{ title: "Люцерна", volumeKg: 3000, salePrice: 212.75 }],
      cooledDownChannels: [{ name: "Юг агро", city: "Ростов-на-Дону", daysSince: 21 }],
    });
    expect(data.actions.length).toBeLessThanOrEqual(3);
    expect(data.actions.length).toBeGreaterThan(0);
    for (const action of data.actions) {
      expect(action.link.startsWith("/")).toBe(true);
    }
    expect(data.actions.some((a) => a.link === "/publish")).toBe(true);
  });

  test("price: ниже рынка, но не ниже закупа + наценка позиции (15%)", () => {
    const data = fallbackPriceAnalysis(pos1, {
      min: 220,
      max: 260,
      avg: 240,
      sources: ["AGROSERVER", "TELEGRAM"],
      samples: [{ price: 240, source: "AGROSERVER" }],
      count: 5,
    });
    expect(data.marketPosition).toBe("below");
    expect(data.ourPrice).toBe(212.75);
    expect(data.delta).toBe(-27.25);
    /* 185 × 1.15 = 212.75 → «ниже 213 не опускайтесь». */
    expect(data.recommendation).toContain("213");
    expect(data.recommendation).not.toMatch(/сниз.*2\d\d/i);
    expect(data.recommendation).toContain("наценка позиции");
  });

  test("price: нет рынка → честная рекомендация", () => {
    const data = fallbackPriceAnalysis(pos1, {
      min: null,
      max: null,
      avg: null,
      sources: [],
      samples: [],
      count: 0,
    });
    expect(data.marketPosition).toBe("at");
    expect(data.marketAvg).toBeNull();
    expect(data.delta).toBeNull();
    /* Нет рынка — честно: только закуп и наценка позиции, минимум 213. */
    expect(data.recommendation).toContain("213");
    expect(data.recommendation).toContain("наценк");
  });

  test("logistics: 2–4 варианта, отсортированы по цене", () => {
    const data = fallbackLogistics({
      shipment: {
        fromRegion: "Краснодарский край",
        fromCity: "Павловская",
        toRegion: "Ростовская область",
        toCity: "Ростов-на-Дону",
        weightKg: 3000,
        bagWeightKg: 25,
        bagsCount: 120,
        volumeM3: 5.2,
      },
      availableCarriers: [
        { name: "ПЭК", price: 12500, days: 3 },
        { name: "СДЭК", price: 11200, days: 5 },
        { name: "Деловые линии", price: 14900, days: 2 },
      ],
    });
    expect(data.options.length).toBe(3);
    expect(data.options[0].price).toBe(11200);
    expect(data.options[1].price).toBe(12500);
    expect(data.options[2].price).toBe(14900);
    expect(data.recommendation).toContain("СДЭК");
  });
});
