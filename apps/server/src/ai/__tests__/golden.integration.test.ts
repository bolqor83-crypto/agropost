import { afterAll, describe, expect, test } from "bun:test";
import golden from "../golden-set.json";
import {
  analyzePrice,
  generateAdvice,
  generateListing,
  generateReply,
  planLogistics,
} from "../service.js";
import { aiGateway } from "../gateway.js";
import { seedPosition } from "./fixtures.js";
import type { AiStatus } from "@shared/ai";

/**
 * Интеграционная регрессия: 15 golden-кейсов против реального GLM.
 * Запускается только при GLM_API_KEY. Проверяем свойства, не точный текст.
 * Стоимость считаем по GLM_PRICE_PER_1K_USD (если задан).
 */

type GoldenCase = {
  id: string;
  useCase: "listing" | "reply" | "advice" | "price_analysis" | "logistics";
  positionId?: string;
  input: Record<string, unknown>;
  expect: Record<string, unknown>;
};

const cases = golden.cases as GoldenCase[];
const apiKey = process.env.GLM_API_KEY?.trim();
let totalIn = 0;
let totalOut = 0;
let totalLatency = 0;
const statuses: Record<string, AiStatus> = {};

function assertRequiredForbidden(text: string, expectObj: Record<string, unknown>): void {
  const required = (expectObj["required"] as string[] | undefined) ?? [];
  const forbidden = (expectObj["forbidden"] as string[] | undefined) ?? [];
  for (const value of required) expect(text).toContain(value);
  const lower = text.toLowerCase();
  for (const value of forbidden) expect(lower).not.toContain(value.toLowerCase());
}

function assertLinkAllowed(link: string, expectObj: Record<string, unknown>): void {
  const allowed = (expectObj["linksAllowed"] as string[] | undefined) ?? [
    "/publish",
    "/positions",
    "/channels",
    "/deals",
    "/suppliers",
  ];
  expect(allowed.some((base) => link === base || link.startsWith(`${base}?`) || link.startsWith(`${base}/`))).toBe(true);
}

describe("golden set (реальный GLM)", () => {
  if (!apiKey) {
    test("пропущен: GLM_API_KEY не задан", () => {
      expect(true).toBe(true);
    });
    return;
  }

  for (const goldenCase of cases) {
    test(goldenCase.id, async () => {
      const position = goldenCase.positionId ? seedPosition(goldenCase.positionId) : undefined;
      const expectObj = goldenCase.expect;

      if (goldenCase.useCase === "listing") {
        const result = await generateListing(
          goldenCase.input as unknown as Parameters<typeof generateListing>[0],
          { gateway: aiGateway, position },
        );
        totalIn += result.meta.tokensIn ?? 0;
        totalOut += result.meta.tokensOut ?? 0;
        totalLatency += result.meta.latencyMs;
        statuses[goldenCase.id] = result.meta.status;

        expect(result.data.title.length).toBeLessThanOrEqual((expectObj["titleMaxLength"] as number) ?? 70);
        expect(result.data.body.length).toBeLessThanOrEqual((expectObj["maxLength"] as number) ?? 3000);
        expect(result.data.tags.length).toBeGreaterThanOrEqual(1);
        expect(result.data.tags.length).toBeLessThanOrEqual(10);
        assertRequiredForbidden(`${result.data.title}\n${result.data.body}\n${result.data.tags.join(" ")}`, expectObj);
        return;
      }

      if (goldenCase.useCase === "reply") {
        const result = await generateReply(goldenCase.input as unknown as Parameters<typeof generateReply>[0], {
          gateway: aiGateway,
          position,
        });
        totalIn += result.meta.tokensIn ?? 0;
        totalOut += result.meta.tokensOut ?? 0;
        totalLatency += result.meta.latencyMs;
        statuses[goldenCase.id] = result.meta.status;

        expect(result.data.reply.length).toBeLessThanOrEqual((expectObj["maxLength"] as number) ?? 1000);
        assertRequiredForbidden(result.data.reply, expectObj);
        return;
      }

      if (goldenCase.useCase === "advice") {
        const result = await generateAdvice(goldenCase.input as unknown as Parameters<typeof generateAdvice>[0], {
          gateway: aiGateway,
        });
        totalIn += result.meta.tokensIn ?? 0;
        totalOut += result.meta.tokensOut ?? 0;
        totalLatency += result.meta.latencyMs;
        statuses[goldenCase.id] = result.meta.status;

        expect(result.data.actions.length).toBeLessThanOrEqual((expectObj["actionsMax"] as number) ?? 3);
        for (const action of result.data.actions) {
          assertLinkAllowed(action.link, expectObj);
          expect(action.action.length).toBeGreaterThan(0);
          expect(action.reason.length).toBeGreaterThan(0);
        }
        const requiredLink = expectObj["requiredLink"] as string | undefined;
        if (requiredLink) {
          expect(result.data.actions.some((a) => a.link === requiredLink)).toBe(true);
        }
        return;
      }

      if (goldenCase.useCase === "price_analysis") {
        const result = await analyzePrice(
          goldenCase.input as unknown as Parameters<typeof analyzePrice>[0],
          { gateway: aiGateway, position },
        );
        totalIn += result.meta.tokensIn ?? 0;
        totalOut += result.meta.tokensOut ?? 0;
        totalLatency += result.meta.latencyMs;
        statuses[goldenCase.id] = result.meta.status;

        expect(result.data.marketPosition).toBe(expectObj["marketPosition"]);
        expect(result.data.ourPrice).toBeCloseTo(expectObj["ourPrice"] as number, 2);
        if (expectObj["marketAvg"] === null) {
          expect(result.data.marketAvg).toBeNull();
          expect(result.data.delta).toBeNull();
        } else {
          expect(result.data.marketAvg).toBeCloseTo(expectObj["marketAvg"] as number, 2);
          expect(result.data.delta).toBeCloseTo(expectObj["delta"] as number, 2);
        }
        if (expectObj["warningsNonEmpty"]) {
          expect(result.warnings.length).toBeGreaterThan(0);
        }
        return;
      }

      const result = await planLogistics(goldenCase.input as unknown as Parameters<typeof planLogistics>[0], {
        gateway: aiGateway,
      });
      totalIn += result.meta.tokensIn ?? 0;
      totalOut += result.meta.tokensOut ?? 0;
      totalLatency += result.meta.latencyMs;
      statuses[goldenCase.id] = result.meta.status;

      expect(result.data.options.length).toBe(expectObj["options"]);
      for (let i = 1; i < result.data.options.length; i += 1) {
        expect(result.data.options[i - 1].price).toBeLessThanOrEqual(result.data.options[i].price);
      }
      expect(result.data.recommendation.length).toBeGreaterThan(0);
    }, 90_000);
  }

  afterAll(() => {
    const pricePer1k = Number(process.env.GLM_PRICE_PER_1K_USD ?? 0);
    const tokens = totalIn + totalOut;
    const cost = pricePer1k > 0 ? (tokens / 1000) * pricePer1k : null;
    console.log("[golden] статусы:", statuses);
    console.log(
      `[golden] токены: in=${totalIn}, out=${totalOut}, всего=${tokens}; средняя задержка=${Math.round(
        totalLatency / cases.length,
      )} мс`,
    );
    console.log(
      `[golden] стоимость: ${cost === null ? "n/a (GLM_PRICE_PER_1K_USD не задан)" : `$${cost.toFixed(4)}`}`,
    );
  });
});
