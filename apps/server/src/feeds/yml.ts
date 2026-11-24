/**
 * ЭТАП 9 — генератор YML по стандарту Яндекс.Маркета.
 *
 * Формат: yml_catalog → shop → currencies/categories/offers → offer.
 * Площадки (Зерно Он-Лайн, Своё Фермерство) читают XML по ссылке и
 * обновляют объявления сами — по offer.id (id позиции) обновление, не дубль.
 *
 * Чистая функция: any → string, без IO. Golden set — в __tests__/yml.test.ts.
 */

import type { FeedData, FeedOffer } from "./types.js";

/** Экранирование XML-текста (& < > " '). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Дата фида: «2026-11-25T12:00:00» (минуты достаточны стандарту YML). */
function feedDate(generatedAt: string): string {
  return generatedAt.slice(0, 16);
}

/** Уникальные категории по (id, name) — порядок первого вхождения. */
export function feedCategories(offers: FeedOffer[]): { id: string; name: string }[] {
  const seen = new Set<string>();
  const result: { id: string; name: string }[] = [];
  for (const offer of offers) {
    if (seen.has(offer.categoryId)) continue;
    seen.add(offer.categoryId);
    result.push({ id: offer.categoryId, name: offer.category });
  }
  return result;
}

function offerXml(offer: FeedOffer): string {
  const lines: string[] = [];
  lines.push(`    <offer id="${escapeXml(offer.id)}" available="true">`);
  lines.push(`      <url>${escapeXml(offer.url)}</url>`);
  lines.push(`      <price>${offer.price}</price>`);
  lines.push(`      <currencyId>${offer.currency}</currencyId>`);
  lines.push(`      <categoryId>${escapeXml(offer.categoryId)}</categoryId>`);
  lines.push(`      <name>${escapeXml(offer.name)}</name>`);
  lines.push(`      <description>${escapeXml(offer.description)}</description>`);
  for (const picture of offer.pictures) {
    lines.push(`      <picture>${escapeXml(picture)}</picture>`);
  }
  for (const param of offer.params) {
    lines.push(
      `      <param name="${escapeXml(param.name)}">${escapeXml(param.value)}</param>`,
    );
  }
  lines.push("    </offer>");
  return lines.join("\n");
}

/**
 * YML-каталог из собранного фида. Пустой фид (0 offers) — валидный
 * каталог с пустым <offers/> (площадка снимет объявления с витрины).
 */
export function buildYmlCatalog(data: FeedData): string {
  const categories = feedCategories(data.offers);
  const categoryLines = categories
    .map((c) => `      <category id="${escapeXml(c.id)}">${escapeXml(c.name)}</category>`)
    .join("\n");

  const offerLines = data.offers.map(offerXml).join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<yml_catalog date="${feedDate(data.generatedAt)}">`,
    `  <shop>`,
    `    <name>${escapeXml(data.shop.name)}</name>`,
    `    <company>${escapeXml(data.shop.company)}</company>`,
    `    <url>${escapeXml(data.shop.url)}</url>`,
    `    <currencies>`,
    `      <currency id="RUB" rate="1"/>`,
    `    </currencies>`,
    `    <categories>`,
    categoryLines || `      <!-- нет позиций в наличии -->`,
    `    </categories>`,
    `    <offers>`,
    offerLines || `      <!-- нет позиций в наличии -->`,
    `    </offers>`,
    `  </shop>`,
    `</yml_catalog>`,
    ``,
  ].join("\n");
}
