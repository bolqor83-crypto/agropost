/**
 * Пять use cases AI-слоя. Каждый: собрать факты → промпт → gateway
 * (zod + white-label + retry) → честный fallback. Роуты только
 * валидируют вход и вызывают эти функции.
 */

import { MARKET_WINDOW_DAYS, marketQueriesFor } from "@shared/market";
import type {
  AiAdviceContext,
  AiAdviceData,
  AiListingData,
  AiListingInput,
  AiLogisticsData,
  AiLogisticsInput,
  AiPriceAnalysisData,
  AiPriceAnalysisInput,
  AiMarketSnapshot,
  AiReplyData,
  AiReplyInput,
  AiMeta,
} from "@shared/ai";
import type { PositionDTO } from "@shared/types";
import { prisma } from "../prisma.js";
import { includePosition, mapPosition } from "../mappers.js";
import {
  aiAdviceDataSchema,
  aiListingDataSchema,
  aiLogisticsDataSchema,
  aiPriceAnalysisDataSchema,
  aiReplyDataSchema,
} from "./schemas.js";
import { aiGateway, type AiGateway } from "./gateway.js";
import { loadPrompt, renderPrompt } from "./prompts/index.js";
import {
  adviceContextFromDb,
  adviceContextToPrompt,
  listingAllowedNumbers,
  positionFacts,
} from "./context.js";
import {
  fallbackAdvice,
  fallbackListing,
  fallbackLogistics,
  fallbackPriceAnalysis,
  fallbackReply,
} from "./fallback.js";
import type { ListingPlatform } from "@shared/listing-text";

export interface AiServiceDeps {
  /** Для тестов: подменить gateway, не трогая env. */
  gateway?: AiGateway;
  /** Для тестов: позиция без обращения к БД. */
  position?: PositionDTO;
}

/** Запрещённые в публичных текстах данные поставщика. */
function whiteLabelViolations(text: string, p: PositionDTO): string[] {
  const lower = text.toLowerCase();
  const banned = [
    p.supplier.name,
    p.supplier.phone,
    "Павловская",
    "Ленинградская",
    "Тихорецк",
    "склад",
  ];
  const found = banned
    .filter((value) => value && lower.includes(value.toLowerCase()))
    .map((value) => `упоминание «${value}»`);

  if (/(?:\+7|8)\s*\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/.test(text)) {
    found.push("телефон");
  }
  if (/https?:\/\//i.test(text)) {
    found.push("внешняя ссылка");
  }
  if (/\b(?:станица|ст\.)\s+[А-ЯЁ][а-яё]+/i.test(text)) {
    found.push("адрес");
  }
  return [...new Set(found)];
}

async function loadPosition(positionId: string): Promise<PositionDTO> {
  const row = await prisma.supplierPosition.findUnique({
    where: { id: positionId },
    include: includePosition,
  });
  if (!row) throw new Error("POSITION_NOT_FOUND");
  return mapPosition(row);
}

/* ---------- 1. Listing ---------- */

const PLATFORM_TONE: Record<ListingPlatform, string> = {
  avito: "сухо, фактурно, цифры, без эмодзи",
  telegram: "живо, коротко, 1–2 эмодзи, можно вопрос в конце",
  agroserver: "профессионально, полные характеристики",
};

export async function generateListing(
  input: AiListingInput,
  deps: AiServiceDeps = {},
): Promise<{ data: AiListingData; warnings: string[]; meta: AiMeta }> {
  const position = deps.position ?? (await loadPosition(input.positionId));
  const system = loadPrompt("system");
  const template = loadPrompt("listing");
  const user = renderPrompt(template, {
    platform: input.platform,
    facts: positionFacts(position),
    accent: input.accent ?? "price",
    platformTone: PLATFORM_TONE[input.platform],
  });

  const gateway = deps.gateway ?? aiGateway;
  const result = await gateway.run<Omit<AiListingData, "charCount">>({
    useCase: "listing",
    input: { positionId: input.positionId, platform: input.platform, accent: input.accent ?? null },
    schema: aiListingDataSchema,
    system,
    user,
    model: "flash",
    validate: (data) => {
      const all = `${data.title}\n${data.body}\n${data.tags.join(" ")}`;
      return whiteLabelViolations(all, position);
    },
    /* Патч 4.1: числа ответа — только из входных данных. */
    allowedNumbers: listingAllowedNumbers(position),
    fallback: () => fallbackListing(position, input.platform),
    positionIds: [position.id],
  });

  return {
    data: { ...result.data, charCount: result.data.body.length },
    warnings: result.warnings,
    meta: result.meta,
  };
}

/* ---------- 2. Reply ---------- */

export async function generateReply(
  input: AiReplyInput,
  deps: AiServiceDeps = {},
): Promise<{ data: AiReplyData; warnings: string[]; meta: AiMeta }> {
  const position = deps.position ?? (await loadPosition(input.positionId));
  const system = loadPrompt("system");
  const template = loadPrompt("reply");
  const history = (input.history ?? [])
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");
  const style = input.userStyle?.tone
    ? `${input.userStyle.tone}${input.userStyle.examples?.length ? `; примеры: ${input.userStyle.examples.join(" | ")}` : ""}`
    : "деловой, дружелюбный, короткий";

  const user = renderPrompt(template, {
    incoming: input.incomingMessage,
    history: history || "—",
    facts: positionFacts(position),
    style,
  });

  const gateway = deps.gateway ?? aiGateway;
  const result = await gateway.run<AiReplyData>({
    useCase: "reply",
    input: {
      positionId: input.positionId,
      incomingMessage: input.incomingMessage,
      history: input.history ?? [],
      userStyle: input.userStyle ?? null,
    },
    schema: aiReplyDataSchema,
    system,
    user,
    model: "flash",
    validate: (data) => whiteLabelViolations(data.reply, position),
    /* Патч 4.1: ответ покупателю тоже без выдуманных чисел. */
    allowedNumbers: listingAllowedNumbers(position),
    fallback: () => fallbackReply(position, input.incomingMessage),
    positionIds: [position.id],
  });

  return { data: result.data, warnings: result.warnings, meta: result.meta };
}

/* ---------- 3. Advice ---------- */

const ALLOWED_LINKS = new Set(["/publish", "/positions", "/channels", "/deals", "/suppliers"]);

function adviceLinkOk(link: string): boolean {
  if (ALLOWED_LINKS.has(link)) return true;
  return [...ALLOWED_LINKS].some((base) => link.startsWith(`${base}?`) || link.startsWith(`${base}/`));
}

export async function generateAdvice(
  input: { context?: AiAdviceContext } = {},
  deps: AiServiceDeps = {},
): Promise<{ data: AiAdviceData; warnings: string[]; meta: AiMeta }> {
  const context = input.context ?? (await adviceContextFromDb());
  const system = loadPrompt("system");
  const template = loadPrompt("advice");
  const user = renderPrompt(template, { context: adviceContextToPrompt(context) });

  const gateway = deps.gateway ?? aiGateway;
  const result = await gateway.run<AiAdviceData>({
    useCase: "advice",
    input: { context },
    schema: aiAdviceDataSchema,
    system,
    user,
    model: "pro",
    validate: (data) => {
      const bad = data.actions.filter((a) => !adviceLinkOk(a.link));
      return bad.length
        ? [`недопустимый link: ${bad.map((a) => a.link).join(", ")}`]
        : [];
    },
    fallback: () => fallbackAdvice(context),
  });

  return { data: result.data, warnings: result.warnings, meta: result.meta };
}

/* ---------- 4. Price analysis ---------- */

async function loadMarketSnapshot(position: PositionDTO): Promise<AiMarketSnapshot> {
  const queries = marketQueriesFor(position.culture.name);
  const since = new Date(Date.now() - MARKET_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.competitorPrice.findMany({
    where: {
      OR: queries.map((q) => ({ query: { equals: q, mode: "insensitive" as const } })),
      fetchedAt: { gte: since },
    },
    orderBy: { fetchedAt: "desc" },
  });
  const prices = rows.map((r) => Number(r.price));
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  return {
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
    avg: avg === null ? null : Math.round(avg * 100) / 100,
    sources: [...new Set(rows.map((r) => r.source))],
    samples: rows.slice(0, 5).map((r) => ({ price: Number(r.price), source: r.source })),
    count: rows.length,
  };
}

export async function analyzePrice(
  input: AiPriceAnalysisInput,
  deps: AiServiceDeps = {},
): Promise<{ data: AiPriceAnalysisData; warnings: string[]; meta: AiMeta }> {
  const position = deps.position ?? (await loadPosition(input.positionId));
  const market = input.market ?? (await loadMarketSnapshot(position));
  const floorPrice = Math.round(position.supplierPrice * 1.1 * 100) / 100;
  const system = loadPrompt("system");
  const template = loadPrompt("price_analysis");
  const user = renderPrompt(template, {
    ourPrice: position.salePrice,
    supplierPrice: position.supplierPrice,
    floorPrice,
    marketMin: market.min ?? "—",
    marketMax: market.max ?? "—",
    marketAvg: market.avg ?? "—",
    sourcesCount: market.sources.length,
    samplesCount: market.count ?? market.samples.length,
    sources: market.sources.length ? market.sources.join(", ") : "—",
  });

  const warnings: string[] = [];
  if (market.sources.length < 3) {
    warnings.push(
      `Выборка мала: ${market.sources.length} источник(а), ${market.count ?? market.samples.length} цен — рекомендация ориентировочная.`,
    );
  }
  if (market.avg === null) {
    warnings.push("Данных о рынке пока нет — рекомендация опирается только на закуп и наценку.");
  }

  const gateway = deps.gateway ?? aiGateway;
  const result = await gateway.run<AiPriceAnalysisData>({
    useCase: "price_analysis",
    input: { positionId: input.positionId, market },
    schema: aiPriceAnalysisDataSchema,
    system,
    user,
    model: "flash",
    validate: (data) => {
      const bad: string[] = [];
      if (data.marketAvg !== null && data.marketAvg < 0) bad.push("отрицательная средняя");
      if (data.recommendation.toLowerCase().includes("скидк")) bad.push("обещание скидки");
      return bad;
    },
    fallback: () => fallbackPriceAnalysis(position, market),
    positionIds: [position.id],
    warnings,
  });

  /* Пересчитываем математику на сервере: модель может ошибиться. */
  const ourPrice = position.salePrice;
  const marketAvg = market.avg;
  let marketPosition: AiPriceAnalysisData["marketPosition"] = "at";
  let delta: number | null = null;
  if (marketAvg !== null) {
    const tolerance = marketAvg * 0.03;
    marketPosition =
      ourPrice < marketAvg - tolerance ? "below" : ourPrice > marketAvg + tolerance ? "above" : "at";
    delta = Math.round((ourPrice - marketAvg) * 100) / 100;
  }

  let recommendation = result.data.recommendation;
  const mentionedPrices = [...recommendation.matchAll(/(\d+(?:[.,]\d+)?)\s*₽/g)].map((m) =>
    Number(m[1].replace(",", ".")),
  );
  const suggestsLowering = /(сниз|пониз|опуст|дешевле|уступ)/i.test(recommendation);
  if (suggestsLowering && mentionedPrices.some((value) => value < floorPrice - 0.01)) {
    recommendation = fallbackPriceAnalysis(position, market).recommendation;
  }
  if (floorPrice > (marketAvg ?? 0)) {
    recommendation += ` Ниже ${Math.ceil(floorPrice)} ₽/кг не опускайтесь — это закуп с наценкой 10%.`;
  }

  return {
    data: { ...result.data, ourPrice, marketAvg, delta, marketPosition, recommendation },
    warnings: result.warnings,
    meta: result.meta,
  };
}

/* ---------- 5. Logistics ---------- */

function normalizeLogistics(
  data: AiLogisticsData,
  input: AiLogisticsInput,
): AiLogisticsData | null {
  const byName = new Map(
    input.availableCarriers.map((c) => [c.name.trim().toLowerCase(), c] as const),
  );
  const options: AiLogisticsData["options"] = [];
  for (const option of data.options) {
    const original = byName.get(option.carrier.trim().toLowerCase());
    if (!original) continue;
    options.push({
      carrier: original.name,
      price: original.price,
      days: original.days,
      note: option.note,
    });
  }
  const unique = [...new Map(options.map((o) => [o.carrier, o] as const)).values()]
    .sort((a, b) => a.price - b.price || a.days - b.days)
    .slice(0, 4);
  if (unique.length < 2) return null;
  return { options: unique, recommendation: data.recommendation };
}

export async function planLogistics(
  input: AiLogisticsInput,
  deps: AiServiceDeps = {},
): Promise<{ data: AiLogisticsData; warnings: string[]; meta: AiMeta }> {
  const system = loadPrompt("system");
  const template = loadPrompt("logistics");
  const carriers = input.availableCarriers
    .map((c) => `- ${c.name}: ${c.price} ₽, ${c.days} дн.`)
    .join("\n");
  const user = renderPrompt(template, {
    fromRegion: input.shipment.fromRegion,
    fromCity: input.shipment.fromCity,
    toRegion: input.shipment.toRegion,
    toCity: input.shipment.toCity,
    weightKg: input.shipment.weightKg,
    bagsCount: input.shipment.bagsCount,
    bagWeightKg: input.shipment.bagWeightKg,
    volumeM3: input.shipment.volumeM3,
    carriers,
  });

  const gateway = deps.gateway ?? aiGateway;
  const result = await gateway.run<AiLogisticsData>({
    useCase: "logistics",
    input,
    schema: aiLogisticsDataSchema,
    system,
    user,
    model: "flash",
    validate: (data) => {
      const bad: string[] = [];
      if (data.options.length < 2 || data.options.length > 4) bad.push("options 2–4");
      for (let i = 1; i < data.options.length; i += 1) {
        if (data.options[i - 1].price > data.options[i].price) {
          bad.push("options не отсортированы по цене");
          break;
        }
      }
      return bad;
    },
    fallback: () => fallbackLogistics(input),
  });

  const normalized = normalizeLogistics(result.data, input);
  if (!normalized) {
    const fallback = fallbackLogistics(input);
    return {
      data: fallback,
      warnings: [
        ...result.warnings,
        "AI предложил варианты вне списка перевозчиков — использован шаблон.",
      ],
      meta: { ...result.meta, status: "fallback", provider: "fallback", model: "fallback" },
    };
  }

  return {
    data: normalized,
    warnings: result.warnings,
    meta: result.meta,
  };
}
