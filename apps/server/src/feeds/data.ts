/**
 * ЭТАП 9 — сборка FeedData из позиций (IN_STOCK) + профиля владельца.
 *
 * Чистая функция над «узкими» строками (без Prisma-типов): маршруты
 * передают выборку из БД, тесты — фикстуры. Ссылки, текст и атрибуты:
 * - описание — shared/listing-text.ts (white-label, шаблон «деловой»);
 * - атрибуты — из JSONB позиции по схеме шаблона культуры;
 * - фото — только абсолютные http(s)-URL (R2); data-URL-заглушки демо
 *   в фид не попадают — площадки их не принимают;
 * - цена — salePrice (уже с наценкой);
 * - ссылка оффера — {shopUrl}/positions/{id} (витрина приложения).
 */

import { buildListing } from "@shared/listing-text";
import { positionName } from "@shared/attributes";
import { SUPPLIER_LOCATION_REGION } from "@shared/labels";
import type { AttributeField, AttributesMap, CultureType } from "@shared/types";
import type { FeedData, FeedOffer, FeedShopInfo } from "./types.js";

/** Узкая строка позиции для фида (роуты/тесты её заполняют). */
export interface FeedPositionRow {
  id: string;
  attributes: AttributesMap;
  volumeKg: number;
  bagWeightKg: number;
  minLotKg: number;
  salePrice: number;
  hasCertificate: boolean;
  supplier: { location: keyof typeof SUPPLIER_LOCATION_REGION };
  culture: {
    id: string;
    name: string;
    type: CultureType;
    attributesSchema: AttributeField[];
  };
  media: { type: "PHOTO" | "VIDEO"; url: string }[];
}

/** Профиль владельца (User) — только поля, нужные шапке фида. */
export interface FeedOwnerRow {
  name: string;
}

/** Имя оффера: «Люцерна «Вега 87» РС1, всхожесть 92%». */
export function feedOfferName(cultureName: string, attrs: AttributesMap): string {
  const base = positionName(cultureName, attrs);
  const extras: string[] = [];
  const reproduction = attrs["reproduction"];
  if (typeof reproduction === "string" && reproduction.trim()) {
    extras.push(reproduction.trim());
  }
  const germination = attrs["germination"];
  if (typeof germination === "number") {
    extras.push(`всхожесть ${germination}%`);
  }
  return extras.length > 0 ? `${base} ${extras.join(", ")}` : base;
}

/** Параметры из JSONB по схеме шаблона культуры («Сорт» → «Вега 87»). */
export function feedParams(
  schema: AttributeField[],
  attrs: AttributesMap,
): { name: string; value: string }[] {
  const params: { name: string; value: string }[] = [];
  for (const field of schema) {
    const value = attrs[field.key];
    if (value === undefined || value === "" || value === null) continue;
    const text = field.type === "percent" ? `${value}%` : String(value);
    params.push({ name: field.label, value: text });
  }
  return params;
}

/** Абсолютные http(s)-URL фото (R2); data-URL и относительные отбрасываем. */
export function feedPictures(media: FeedPositionRow["media"]): string[] {
  return media
    .filter((m) => m.type === "PHOTO")
    .map((m) => m.url)
    .filter((url) => /^https?:\/\//i.test(url));
}

export function buildFeedData(
  rows: FeedPositionRow[],
  owner: FeedOwnerRow | null,
  shopUrl: string,
  generatedAt: string,
): FeedData {
  const shop: FeedShopInfo = {
    name: "АгроПост",
    company: owner?.name ?? "АгроПост",
    url: shopUrl,
    phone: null, /* телефон подставляет Авито-конфиг (ContactPhone) */
  };

  const offers: FeedOffer[] = rows.map((row) => {
    const region = SUPPLIER_LOCATION_REGION[row.supplier.location] ?? "Краснодарский край";
    /* Описание — shared/listing-text.ts (white-label, «деловой» шаблон). */
    const description = buildListing(
      {
        attributes: row.attributes,
        minLotKg: row.minLotKg,
        bagWeightKg: row.bagWeightKg,
        hasCertificate: row.hasCertificate,
      },
      {
        name: row.culture.name,
        attributesSchema: row.culture.attributesSchema,
      },
      region,
      row.salePrice,
      "agroserver",
    );

    return {
      id: row.id,
      name: feedOfferName(row.culture.name, row.attributes),
      price: row.salePrice,
      currency: "RUB" as const,
      categoryId: row.culture.id,
      category: row.culture.name,
      cultureType: row.culture.type === "NUT" ? ("NUT" as const) : ("SEED" as const),
      url: `${shopUrl}/positions/${row.id}`,
      description,
      pictures: feedPictures(row.media),
      params: feedParams(row.culture.attributesSchema, row.attributes),
      region,
    };
  });

  return { shop, offers, generatedAt };
}
