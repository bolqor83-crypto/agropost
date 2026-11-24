/**
 * Патч 4.1 — защита от AI-галлюцинаций чисел:
 * 1) extractNumbers/hallucinatedNumbers — извлечение чисел из текста;
 * 2) validateAttributes — контракт displayType (FIXED/RANGE/MIN/TEXT);
 * 3) пост-проверка gateway: число не из входа → retry → fallback;
 * 4) интеграция: объявление для ореха «выход ядра 45–50%» —
 *    «9%» в тексте невозможен, при галлюцинации работает fallback.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  validateAttributes,
  normalizeAttributes,
  attributeDisplayType,
} from "@shared/attributes";
import { SEED_CULTURES, SEED_POSITIONS } from "@shared/seed-data";
import { AiCache } from "../cache.js";
import { AiGateway, extractNumbers, hallucinatedNumbers } from "../gateway.js";
import { MemoryAiLogger } from "../logger.js";
import { generateListing } from "../service.js";
import type { AiCompletion, AiProvider } from "../providers/types.js";
import type { AiConfig } from "../config.js";
import { seedPosition } from "./fixtures.js";

const config: AiConfig = {
  provider: "glm",
  glmApiKey: "test-key",
  glmBaseUrl: "http://localhost:9999",
  glmModelFlash: "glm-test-flash",
  glmModelPro: "glm-test-pro",
  openrouterApiKey: null,
  openrouterModel: "test/openrouter",
  openrouterModels: [],
  timeoutMs: 1000,
};

class MockProvider implements AiProvider {
  readonly name = "mock" as const;
  calls = 0;
  constructor(private readonly responses: Array<string | Error>) {}

  async complete(): Promise<AiCompletion> {
    const response = this.responses[Math.min(this.calls, this.responses.length - 1)];
    this.calls += 1;
    if (response instanceof Error) throw response;
    return { content: response, tokensIn: 11, tokensOut: 7, latencyMs: 2 };
  }
}

const schema = z.object({ a: z.string() }).strict();
const fallback = () => ({ a: "fallback" });

describe("extractNumbers", () => {
  test("диапазоны, проценты, десятичные и пробельные тысячи", () => {
    expect(extractNumbers("выход ядра 45–50%")).toEqual([45, 50]);
    expect(extractNumbers("цена 212,75 ₽/кг")).toEqual([212.75]);
    expect(extractNumbers("в наличии 10 000 кг")).toEqual([10000]);
    expect(extractNumbers("мешки по 25 кг, партия от 500 кг")).toEqual([25, 500]);
    expect(extractNumbers("калибр 32+")).toEqual([32]);
    expect(extractNumbers("без чисел")).toEqual([]);
  });

  test("hallucinatedNumbers отсеивает своё, оставляет чужое", () => {
    const allowed = [45, 50, 8, 118, 10000];
    expect(hallucinatedNumbers("выход ядра 45–50%, влажность 8%", allowed)).toEqual([]);
    expect(hallucinatedNumbers("выход ядра 9%", allowed)).toEqual([9]);
    expect(hallucinatedNumbers("калибр 30+, цена 200 ₽/кг", allowed)).toEqual([30, 200]);
  });
});

describe("validateAttributes (displayType)", () => {
  const walnut = SEED_CULTURES.find((c) => c.name === "Грецкий орех")!;
  const fields = walnut.attributesSchema;

  test("FIXED: точное число в границах процента", () => {
    const issues = validateAttributes(fields, { moisture: 8 });
    expect(issues).toEqual([]);
    expect(validateAttributes(fields, { moisture: 120 })).toHaveLength(1);
  });

  test("RANGE: «45–50» и «32+» валидны, мусор — нет", () => {
    expect(validateAttributes(fields, { kernel: "45–50" })).toEqual([]);
    expect(validateAttributes(fields, { kernel: "48–50" })).toEqual([]);
    expect(validateAttributes(fields, { kernel: 52 })).toEqual([]); /* легаси-число */
    expect(validateAttributes(fields, { calibre: "32+" })).toEqual([]);
    expect(validateAttributes(fields, { calibre: "30+" })).toEqual([]);
    expect(validateAttributes(fields, { kernel: "высокий" })).toHaveLength(1);
    expect(validateAttributes(fields, { kernel: "50–45" })).toHaveLength(1); /* min > max */
  });

  test("MIN: число или «не менее N»", () => {
    const minFields = [{ key: "k", label: "Тест", type: "percent" as const, displayType: "MIN" as const, unit: "%", required: true }];
    expect(validateAttributes(minFields, { k: 45 })).toEqual([]);
    expect(validateAttributes(minFields, { k: "не менее 45" })).toEqual([]);
    expect(validateAttributes(minFields, { k: "45–50" })).toHaveLength(1);
  });

  test("TEXT: любая строка; displayType по умолчанию — FIXED для чисел", () => {
    expect(validateAttributes(fields, { shellThickness: "тонкая" })).toEqual([]);
    expect(attributeDisplayType({ key: "x", label: "X", type: "text", required: false })).toBe("TEXT");
    expect(attributeDisplayType({ key: "x", label: "X", type: "percent", required: false })).toBe("FIXED");
  });

  test("normalizeAttributes канонизирует диапазоны и сохраняет «32+»", () => {
    const out = normalizeAttributes(fields, {
      sort: "Идеал",
      calibre: "32 +",
      moisture: "8",
      kernel: "45 - 50",
      year: 2025,
    });
    expect(out.calibre).toBe("32+");
    expect(out.kernel).toBe("45–50");
    expect(out.moisture).toBe(8);
    expect(() =>
      normalizeAttributes(fields, { sort: "И", calibre: "толстый", moisture: 8, kernel: "9", year: 2025 }),
    ).toThrow(/Калибр/);
  });
});

describe("пост-проверка чисел в gateway", () => {
  function makeGateway(provider: AiProvider) {
    return new AiGateway({
      primary: provider,
      secondary: null,
      cache: new AiCache({ ttlMs: 60_000 }),
      logger: new MemoryAiLogger(),
      config,
    });
  }

  test("галлюцинация числа → retry, вторая попытка чистая → ok/retry", async () => {
    const provider = new MockProvider(['{"a":"выход ядра 9%"}', '{"a":"выход ядра 45–50%"}']);
    const gateway = makeGateway(provider);
    const result = await gateway.run({
      useCase: "listing",
      input: { x: 1 },
      schema,
      system: "sys",
      user: "user",
      allowedNumbers: [45, 50],
      fallback,
    });
    expect(result.data).toEqual({ a: "выход ядра 45–50%" });
    expect(result.meta.status).toBe("retry");
    expect(provider.calls).toBe(2);
  });

  test("галлюцинация дважды → fallback на шаблон", async () => {
    const provider = new MockProvider(['{"a":"выход ядра 9%"}', '{"a":"калибр 30+"}']);
    const gateway = makeGateway(provider);
    const result = await gateway.run({
      useCase: "listing",
      input: { x: 2 },
      schema,
      system: "sys",
      user: "user",
      allowedNumbers: [45, 50, 32],
      fallback,
    });
    expect(result.data).toEqual({ a: "fallback" });
    expect(result.meta.status).toBe("fallback");
    expect(result.warnings.some((w) => w.includes("AI недоступен"))).toBe(true);
  });

  test("allowedNumbers не задан — проверка не выполняется", async () => {
    const provider = new MockProvider(['{"a":"выход ядра 9%"}']);
    const gateway = makeGateway(provider);
    const result = await gateway.run({
      useCase: "listing",
      input: { x: 3 },
      schema,
      system: "sys",
      user: "user",
      fallback,
    });
    expect(result.meta.status).toBe("ok");
  });
});

describe("интеграция: объявление для ореха (выход ядра 45–50%)", () => {
  const walnutPosition = seedPosition("pos-3");

  function gatewayWith(responses: string[]): AiGateway {
    return new AiGateway({
      primary: new MockProvider(responses),
      secondary: null,
      cache: new AiCache({ ttlMs: 60_000 }),
      logger: new MemoryAiLogger(),
      config,
    });
  }

  test("позиция сида: kernel = 45–50, калибр = 32+", () => {
    expect(String(walnutPosition.attributes.kernel)).toBe("45–50");
    expect(String(walnutPosition.attributes.calibre)).toBe("32+");
  });

  test("AI дважды выдумал «9%» → fallback-текст без галлюцинации", async () => {
    const hallucinated = JSON.stringify({
      title: "Грецкий орех — выход ядра 9%",
      body: "Грецкий орех, выход ядра 9%, калибр 30+. Цена 118 ₽/кг.",
      tags: ["орех"],
    });
    const gateway = gatewayWith([hallucinated, hallucinated]);
    const result = await generateListing(
      { positionId: "pos-3", platform: "avito", accent: "quality" },
      { gateway, position: walnutPosition },
    );

    expect(result.meta.status).toBe("fallback");
    const all = `${result.data.title}\n${result.data.body}`;
    expect(all).not.toContain("9%");
    expect(all).toContain("45–50");
    expect(result.warnings.join(" ")).toContain("шаблон");
  });

  test("первая версия с «9%», вторая чистая → retry и чистый текст", async () => {
    const bad = JSON.stringify({
      title: "Орех",
      body: "Выход ядра 9%.",
      tags: ["орех"],
    });
    const good = JSON.stringify({
      title: "Грецкий орех «Идеал», калибр 32+",
      body: "Выход ядра 45–50%, влажность 8%. Цена 118 ₽/кг, мешки по 25 кг.",
      tags: ["орех", "Идеал"],
    });
    const gateway = gatewayWith([bad, good]);
    const result = await generateListing(
      { positionId: "pos-3", platform: "avito", accent: "quality" },
      { gateway, position: walnutPosition },
    );

    expect(result.meta.status).toBe("retry");
    expect(result.data.body).toContain("45–50");
    expect(result.data.body).not.toContain("9%");
  });

  test("seed-позиции соответствуют своим схемам (все displayType)", () => {
    for (const position of SEED_POSITIONS) {
      const culture = SEED_CULTURES.find((c) => c.id === position.cultureId)!;
      const issues = validateAttributes(
        culture.attributesSchema,
        position.attributes as Record<string, string | number>,
      );
      expect(issues).toEqual([]);
    }
  });
});
