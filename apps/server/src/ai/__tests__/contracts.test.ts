import { describe, expect, test } from "bun:test";
import {
  aiAdviceDataSchema,
  aiListingDataSchema,
  aiLogisticsDataSchema,
  aiPriceAnalysisDataSchema,
  aiReplyDataSchema,
} from "../schemas.js";
import { loadPrompt } from "../prompts/index.js";

describe("AI-схемы", () => {
  test("listing: заголовок длиннее 70 символов не проходит", () => {
    const result = aiListingDataSchema.safeParse({
      title: "а".repeat(71),
      body: "Текст объявления",
      tags: ["люцерна"],
    });
    expect(result.success).toBe(false);
  });

  test("listing: 11 тегов не проходит", () => {
    const result = aiListingDataSchema.safeParse({
      title: "Люцерна",
      body: "Текст",
      tags: Array.from({ length: 11 }, (_, i) => `тег${i}`),
    });
    expect(result.success).toBe(false);
  });

  test("reply: пустой ответ не проходит", () => {
    expect(aiReplyDataSchema.safeParse({ reply: "", includes: [] }).success).toBe(false);
  });

  test("advice: 4 действия не проходят", () => {
    const result = aiAdviceDataSchema.safeParse({
      actions: Array.from({ length: 4 }, (_, i) => ({
        priority: "medium",
        action: `Действие ${i}`,
        reason: "Причина",
        link: "/publish",
      })),
    });
    expect(result.success).toBe(false);
  });

  test("advice: внешняя ссылка не проходит", () => {
    const result = aiAdviceDataSchema.safeParse({
      actions: [{ priority: "high", action: "Перейти", reason: "Нужно", link: "https://example.com" }],
    });
    expect(result.success).toBe(false);
  });

  test("price: marketPosition вне enum не проходит", () => {
    const result = aiPriceAnalysisDataSchema.safeParse({
      marketPosition: "cheap",
      ourPrice: 100,
      marketAvg: 100,
      delta: 0,
      recommendation: "Держите цену.",
    });
    expect(result.success).toBe(false);
  });

  test("logistics: один вариант не проходит", () => {
    const result = aiLogisticsDataSchema.safeParse({
      options: [{ carrier: "ПЭК", price: 1000, days: 2, note: "Дешево" }],
      recommendation: "ПЭК",
    });
    expect(result.success).toBe(false);
  });

  test("logistics: 2 варианта проходят", () => {
    const result = aiLogisticsDataSchema.safeParse({
      options: [
        { carrier: "ПЭК", price: 1000, days: 2, note: "Быстро" },
        { carrier: "СДЭК", price: 900, days: 4, note: "Дешево" },
      ],
      recommendation: "СДЭК",
    });
    expect(result.success).toBe(true);
  });
});

describe("Промпты", () => {
  test("все шесть .md читаются", () => {
    for (const name of ["system", "listing", "reply", "advice", "price_analysis", "logistics"] as const) {
      expect(loadPrompt(name).length).toBeGreaterThan(100);
    }
  });

  test("system содержит white-label запрет", () => {
    const system = loadPrompt("system");
    expect(system).toContain("НИКОГДА");
    expect(system).toContain("Краснодарский край");
  });

  test("listing содержит плейсхолдеры фактов и акцента", () => {
    const listing = loadPrompt("listing");
    expect(listing).toContain("{{facts}}");
    expect(listing).toContain("{{accent}}");
    expect(listing).toContain("{{platformTone}}");
  });
});
