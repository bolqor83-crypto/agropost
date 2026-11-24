/**
 * Шаблонный fallback: приложение НИКОГДА не падает из-за AI.
 * Каждый use case умеет собрать честный ответ без модели —
 * из тех же данных позиции/рынка/перевозчиков.
 */

import { positionName } from "@shared/attributes";
import { buildListing, type ListingPlatform } from "@shared/listing-text";
import type {
  AiAdviceContext,
  AiAdviceData,
  AiListingData,
  AiLogisticsData,
  AiLogisticsInput,
  AiPriceAnalysisData,
  AiReplyData,
  AiMarketSnapshot,
} from "@shared/ai";
import type { PositionDTO } from "@shared/types";
import { fallbackTags, PUBLIC_REGION } from "./context.js";

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/* ---------- 1. Listing ---------- */

export function fallbackListing(p: PositionDTO, platform: ListingPlatform): AiListingData {
  const year = p.attributes["year"];
  const volume = new Intl.NumberFormat("ru-RU").format(p.volumeKg);
  const base = `${positionName(p.culture.name, p.attributes)}${year ? `, урожай ${year}` : ""}, ${volume} кг`;
  const title = truncate(base, 70);
  const body = buildListing(p, p.culture, PUBLIC_REGION, p.salePrice, platform);
  return { title, body, tags: fallbackTags(p), charCount: body.length };
}

/* ---------- 2. Reply ---------- */

const REPLY_KEYWORDS: Record<string, RegExp> = {
  delivery: /достав|отгруз|тк|сдэк|пэк|самовывоз|перевоз/i,
  payment: /оплат|предоплата|сч[её]т|перечисл/i,
  price: /цен[аы]|сколько|стоимост|руб/i,
  quality: /всхож|класс|сорт|сертификат|качество|засор/i,
  volume: /объ[её]м|парти|остаток|сколько есть|тонн|кг/i,
  packaging: /мешок|мешк|фасовк|упаков/i,
};

export function fallbackReply(p: PositionDTO, incoming: string): AiReplyData {
  const text = incoming.toLowerCase();
  const includes: string[] = [];
  const parts: string[] = [];

  if (REPLY_KEYWORDS.price.test(text)) {
    parts.push(
      `Цена — ${new Intl.NumberFormat("ru-RU").format(p.salePrice)} ₽/кг при минимальной партии от ${new Intl.NumberFormat("ru-RU").format(p.minLotKg)} кг.`,
    );
    includes.push("цена", "минимальная партия");
  }
  if (REPLY_KEYWORDS.quality.test(text)) {
    const attrs = p.culture.attributesSchema
      .filter((f) => p.attributes[f.key] !== undefined && p.attributes[f.key] !== "")
      .map((f) => `${f.label}: ${p.attributes[f.key]}${f.type === "percent" ? "%" : ""}`)
      .slice(0, 4)
      .join(", ");
    if (attrs) {
      parts.push(`По качеству: ${attrs}.`);
      includes.push("характеристики");
    }
    if (p.hasCertificate) {
      parts.push("Сертификат качества предоставлю по запросу.");
      includes.push("сертификат");
    }
  }
  if (REPLY_KEYWORDS.volume.test(text)) {
    parts.push(
      `В наличии ${new Intl.NumberFormat("ru-RU").format(p.volumeKg)} кг, фасовка — мешки ${p.bagWeightKg} кг.`,
    );
    includes.push("остаток", "фасовка");
  }
  if (REPLY_KEYWORDS.delivery.test(text)) {
    parts.push(
      "Отгрузка из Краснодарского края. Доставку оплачивает покупатель, отправка после полной оплаты — ТК (ПЭК, СДЭК) или самовывоз.",
    );
    includes.push("доставка", "оплата");
  }
  if (REPLY_KEYWORDS.payment.test(text) && !REPLY_KEYWORDS.delivery.test(text)) {
    parts.push("Работаем без предоплаты: отправка после полной оплаты.");
    includes.push("оплата");
  }

  if (parts.length === 0) {
    parts.push(
      "Спасибо за вопрос. Уточню детали по позиции и вернусь с ответом. Если удобно, задайте его в сообщении — отвечу по фактам: цена, качество, объём, доставка.",
    );
    includes.push("уточнение");
  }

  const reply = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 1000);
  return { reply, includes: [...new Set(includes)] };
}

/* ---------- 3. Advice ---------- */

export function fallbackAdvice(ctx: AiAdviceContext): AiAdviceData {
  const actions: AiAdviceData["actions"] = [];

  if (ctx.staleListings.length > 0) {
    const n = ctx.staleListings.length;
    actions.push({
      priority: "high",
      action: `Завершить черновики (${n}) и разместить`,
      reason: `В приложении ${n} ${n === 1 ? "черновик лежит" : "черновика лежат"} без публикации больше 3 дней.`,
      link: "/publish",
    });
  }

  if (ctx.activeLeads.length > 0) {
    const n = ctx.activeLeads.length;
    actions.push({
      priority: "high",
      action: `Проверить активные размещения (${n})`,
      reason: "Есть размещения в статусе «скопировано» — возможно, текст уже опубликован, но отметка не стоит.",
      link: "/publish",
    });
  }

  if (ctx.positionsInStock.length > 0 && ctx.recentListings.length === 0) {
    const p = ctx.positionsInStock[0];
    actions.push({
      priority: "medium",
      action: `Разместить: ${p.title}`,
      reason: `${p.title} в наличии${p.volumeKg !== undefined ? ` (${p.volumeKg} кг)` : ""}, но за последнюю неделю публикаций не было.`,
      link: "/publish",
    });
  }

  if (actions.length < 3 && ctx.cooledDownChannels.length > 0) {
    actions.push({
      priority: "medium",
      action: `Освежить каналы без публикаций (${ctx.cooledDownChannels.length})`,
      reason: "Каналы давно не получали объявления — это снижает охват и шансы на заявку.",
      link: "/channels",
    });
  }

  if (actions.length === 0 && ctx.positionsInStock.length === 0) {
    actions.push({
      priority: "medium",
      action: "Пополнить остатки",
      reason: "В наличии нет ни одной позиции — размещать нечего.",
      link: "/positions",
    });
  }

  return { actions: actions.slice(0, 3) };
}

/* ---------- 4. Price analysis ---------- */

export function fallbackPriceAnalysis(
  p: PositionDTO,
  market: AiMarketSnapshot,
): AiPriceAnalysisData {
  const ourPrice = p.salePrice;
  const marketAvg = market.avg;
  const floor = p.supplierPrice * 1.1;

  if (marketAvg === null) {
    return {
      marketPosition: "at",
      ourPrice,
      marketAvg: null,
      delta: null,
      recommendation: `Данных о рынке пока мало. Держите цену ${ourPrice} ₽/кг — ниже ${Math.ceil(floor)} ₽/кг опускаться не стоит (закуп + 10%).`,
    };
  }

  const tolerance = marketAvg * 0.03;
  const marketPosition: AiPriceAnalysisData["marketPosition"] =
    ourPrice < marketAvg - tolerance ? "below" : ourPrice > marketAvg + tolerance ? "above" : "at";
  const delta = Math.round((ourPrice - marketAvg) * 100) / 100;

  let recommendation: string;
  if (marketPosition === "below") {
    recommendation = `Цена ниже рынка в среднем на ${Math.abs(delta).toLocaleString("ru-RU")} ₽/кг. Можно поднять до ${Math.ceil(marketAvg)} ₽/кг, но ниже ${Math.ceil(floor)} ₽/кг не опускайтесь.`;
  } else if (marketPosition === "above") {
    recommendation = `Цена выше рынка в среднем на ${delta.toLocaleString("ru-RU")} ₽/кг. Проверьте, чем обоснована разница: качество, сертификат, объём или срочность.`;
  } else {
    recommendation = `Цена в рынке: разница со средней ${delta === 0 ? "минимальна" : `${Math.abs(delta).toLocaleString("ru-RU")} ₽/кг`}. Менять цену не нужно, следите за остатком.`;
  }

  if (floor > marketAvg) {
    recommendation += ` Внимание: рынок ниже закупа с наценкой 10% (${Math.ceil(floor)} ₽/кг) — снижать цену не рекомендуется.`;
  }

  return { marketPosition, ourPrice, marketAvg, delta, recommendation };
}

/* ---------- 5. Logistics ---------- */

export function fallbackLogistics(input: AiLogisticsInput): AiLogisticsData {
  const options = [...input.availableCarriers]
    .sort((a, b) => a.price - b.price || a.days - b.days)
    .slice(0, 4)
    .map((c) => ({
      carrier: c.name,
      price: c.price,
      days: c.days,
      note: `${new Intl.NumberFormat("ru-RU").format(c.price)} ₽, срок ${c.days} дн.`,
    }));

  const best = options[0];
  const recommendation = best
    ? `Оптимально: ${best.carrier} — ${new Intl.NumberFormat("ru-RU").format(best.price)} ₽, ${best.days} дн. Доставку оплачивает покупатель.`
    : "Подходящих перевозчиков не найдено.";

  return { options, recommendation };
}
