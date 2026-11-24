/**
 * ЭТАП 9 — XML Автозагрузки Авито (Ads formatVersion="3") + локальный валидатор.
 *
 * Спецификация Авито Autoload (autoload.avito.ru/format, валидатор
 * /format/xmlcheck): корень Ads → Ad с Id / Address / Category /
 * ContactPhone / Title / Description (CDATA) / Price / Condition / Images.
 * Лимиты Авито: Title ≤ 50 символов, Description ≤ 7500, Address ≤ 256,
 * картинок ≤ 40. Id — наш id позиции: Авито обновляет объявление, не дубль.
 *
 * Чистые функции — golden set в __tests__/avito-xml.test.ts.
 */

import type { FeedData, FeedOffer } from "./types.js";
import { escapeXml } from "./yml.js";

/** Категории Авито по типу культуры — подгоняются env AVITO_CATEGORY_*. */
export interface AvitoCategoryMap {
  seed: string;
  nut: string;
}

export const AVITO_CATEGORY_DEFAULT: AvitoCategoryMap = {
  seed: "Товары для дома и дачи",
  nut: "Продукты питания",
};

export const AVITO_LIMITS = {
  title: 50,
  description: 7500,
  address: 256,
  images: 40,
} as const;

/** Адрес объявления: «Россия, {регион}». Регион неизвестен — «Россия». */
export function avitoAddress(region: string): string {
  const clean = region.trim();
  if (!clean || clean.toLowerCase() === "регион уточняйте") return "Россия";
  return `Россия, ${clean}`;
}

/** Заголовок по лимиту Авито (≤50) — обрезаем по слову. */
export function avitoTitle(name: string, limit = AVITO_LIMITS.title): string {
  if (name.length <= limit) return name;
  const cut = name.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Категория Авито для оффера — по типу культуры позиции. */
export function avitoCategoryFor(offer: FeedOffer, map: AvitoCategoryMap): string {
  return offer.cultureType === "NUT" ? map.nut : map.seed;
}

interface BuildOptions {
  /** Телефон продавца (ContactPhone) — нет тега, если не задан. */
  contactPhone: string | null;
  /** Маппинг категорий Авито по типу культуры. */
  categories?: AvitoCategoryMap;
}

function adXml(offer: FeedOffer, opts: BuildOptions): string {
  const map = opts.categories ?? AVITO_CATEGORY_DEFAULT;
  const images = offer.pictures.slice(0, AVITO_LIMITS.images);
  const lines: string[] = [];
  lines.push(`  <Ad>`);
  lines.push(`    <Id>${escapeXml(offer.id)}</Id>`);
  lines.push(`    <Address>${escapeXml(avitoAddress(offer.region))}</Address>`);
  lines.push(`    <Category>${escapeXml(avitoCategoryFor(offer, map))}</Category>`);
  if (opts.contactPhone) {
    lines.push(`    <ContactPhone>${escapeXml(opts.contactPhone)}</ContactPhone>`);
  }
  lines.push(`    <Title>${escapeXml(avitoTitle(offer.name))}</Title>`);
  lines.push(`    <Description><![CDATA[${offer.description}]]></Description>`);
  lines.push(`    <Price>${offer.price}</Price>`);
  lines.push(`    <Condition>Новое</Condition>`);
  if (images.length > 0) {
    lines.push(`    <Images>`);
    for (const url of images) {
      lines.push(`      <Image url="${escapeXml(url)}" />`);
    }
    lines.push(`    </Images>`);
  }
  lines.push(`  </Ad>`);
  return lines.join("\n");
}

/**
 * Полный Ads-файл Автозагрузки. Пустой фид — валидный файл без Ad:
 * Авито снимет с публикации объявления, отсутствующие в фиде.
 */
export function buildAvitoAds(data: FeedData, opts: BuildOptions): string {
  const ads = data.offers.map((offer) => adXml(offer, opts)).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Ads formatVersion="3" target="Avito.ru">`,
    ads || `  <!-- нет позиций в наличии -->`,
    `</Ads>`,
    ``,
  ].join("\n");
}

/* ---------- Локальный валидатор (dry-run без площадки) ---------- */

export interface AvitoValidation {
  valid: boolean;
  /** Ошибки формата (блокируют отправку). */
  errors: string[];
  /** Замечания (не блокируют): телефон, категория, картинки. */
  warnings: string[];
}

export interface AvitoValidationOptions {
  /** Ожидаемое число объявлений (число офферов снапшота). */
  expectedOffers: number;
  /** Телефон продавца — предупреждение, если не задан. */
  contactPhone: string | null;
}

/** Содержимое CDATA (описание) из блока Ad. */
function cdataContent(ad: string): string {
  const match = ad.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return match ? match[1] : (ad.match(/<Description>([^<]*)<\/Description>/)?.[1] ?? "");
}

/**
 * Структурная проверка XML до отправки: корень Ads v3, обязательные
 * элементы Ad, лимиты Авито (Title/Description/Address/фото),
 * уникальность Id. Используется dry-run'ом до запроса к площадке.
 */
export function validateAvitoAds(xml: string, opts: AvitoValidationOptions): AvitoValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)) {
    errors.push("нет XML-декларации");
  }
  if (!xml.includes(`<Ads formatVersion="3" target="Avito.ru">`)) {
    errors.push('корень должен быть <Ads formatVersion="3" target="Avito.ru">');
  }

  const ads = [...xml.matchAll(/<Ad>[\s\S]*?<\/Ad>/g)].map((m) => m[0]);
  if (ads.length !== opts.expectedOffers) {
    errors.push(`Ad-элементов ${ads.length}, ожидалось ${opts.expectedOffers}`);
  }

  const seenIds = new Set<string>();
  ads.forEach((ad, i) => {
    for (const tag of ["<Id>", "<Address>", "<Category>", "<Title>", "<Description>", "<Price>"]) {
      if (!ad.includes(tag)) {
        errors.push(`Ad #${i + 1}: нет тега ${tag.replace(/[<>]/g, "")}`);
      }
    }
    const idMatch = ad.match(/<Id>([^<]*)<\/Id>/);
    if (idMatch) {
      if (!idMatch[1].trim()) errors.push(`Ad #${i + 1}: пустой Id`);
      if (seenIds.has(idMatch[1])) errors.push(`Ad #${i + 1}: дублирующийся Id ${idMatch[1]}`);
      seenIds.add(idMatch[1]);
    }
    const title = ad.match(/<Title>([^<]*)<\/Title>/)?.[1] ?? "";
    if (title.length > AVITO_LIMITS.title) {
      errors.push(`Ad #${i + 1}: Title длиннее ${AVITO_LIMITS.title} символов`);
    }
    if (title.trim().length === 0) errors.push(`Ad #${i + 1}: пустой Title`);
    const address = ad.match(/<Address>([^<]*)<\/Address>/)?.[1] ?? "";
    if (address.length > AVITO_LIMITS.address) {
      errors.push(`Ad #${i + 1}: Address длиннее ${AVITO_LIMITS.address} символов`);
    }
    const price = ad.match(/<Price>([^<]*)<\/Price>/)?.[1] ?? "";
    if (!/^\d+(\.\d{1,2})?$/.test(price.trim())) {
      errors.push(`Ad #${i + 1}: Price не число («${price}»)`);
    }
    if (cdataContent(ad).length > AVITO_LIMITS.description) {
      errors.push(`Ad #${i + 1}: Description длиннее ${AVITO_LIMITS.description} символов`);
    }
    if (cdataContent(ad).trim().length === 0) errors.push(`Ad #${i + 1}: пустой Description`);
    if (!ad.includes("<ContactPhone>")) {
      warnings.push(
        "не задан телефон (ContactPhone) — Авито покажет телефон профиля; " +
          "задайте AVITO_CONTACT_PHONE или укажите в Настройках → Авито API",
      );
    }
    const images = [...ad.matchAll(/<Image url="[^"]*" \/>/g)].length;
    if (images === 0) warnings.push(`Ad #${i + 1}: нет фото — объявление без картинки`);
    if (images > AVITO_LIMITS.images) {
      errors.push(`Ad #${i + 1}: больше ${AVITO_LIMITS.images} картинок`);
    }
  });

  if (!opts.contactPhone) warnings.push("телефон продавца не задан (ContactPhone)");
  if (opts.expectedOffers === 0) warnings.push("в фиде нет позиций в наличии");

  /* Каждая проверка вносит предупреждение раз — независимо от числа Ad. */
  const unique = [...new Set(warnings)];
  return { valid: errors.length === 0, errors, warnings: unique };
}
