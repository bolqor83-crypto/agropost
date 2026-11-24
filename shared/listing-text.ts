/**
 * Сборка черновика объявления из позиции (PositionDTO).
 * Используется и вебом (превью текста), и сервером (POST /api/listings).
 * Этап 3: /api/ai/listing (OpenRouter) с тем же контрактом.
 *
 * WHITE-LABEL: имя поставщика не упоминается никогда.
 * Упоминается только регион отгрузки — он нужен покупателю для логистики.
 */

import { positionName } from "./attributes";
import type { AttributeField, AttributesMap, ChannelType } from "./types";

export type ListingPlatform = "avito" | "telegram" | "agroserver";

/* ЭТАП 9: источнику текста достаточно этих полей — фид собирает описание
 * из узкой строки позиции без полного PositionDTO (структурная типизация:
 * PositionDTO ложится сюда без изменений). */
export interface ListingSource {
  attributes: AttributesMap;
  minLotKg: number;
  bagWeightKg: number;
  hasCertificate: boolean;
}

export interface ListingCultureSource {
  name: string;
  attributesSchema: AttributeField[];
}

export const LISTING_PLATFORMS: { id: ListingPlatform; label: string }[] = [
  { id: "avito", label: "Авито" },
  { id: "telegram", label: "Telegram" },
  { id: "agroserver", label: "Агросервер" },
];

/** Шаблон текста по типу канала: TG — живой, Авито — сухой, остальное — деловой. */
export function listingPlatformForChannel(type: ChannelType): ListingPlatform {
  if (type === "TELEGRAM_CHAT" || type === "TELEGRAM_CHANNEL") return "telegram";
  if (type === "AVITO") return "avito";
  return "agroserver";
}

function attrLines(p: ListingSource, culture: ListingCultureSource, skip: string[] = []): string[] {
  return culture.attributesSchema
    .filter((f) => !skip.includes(f.key))
    .map((f) => {
      const v = p.attributes[f.key];
      if (v === undefined || v === "") return null;
      if (f.type === "percent") return `${f.label} — ${v}%`;
      return `${f.label} — ${v}`;
    })
    .filter((x): x is string => x !== null);
}

export function buildListing(
  p: ListingSource,
  culture: ListingCultureSource,
  regionLabel: string,
  salePrice: number,
  platform: ListingPlatform,
): string {
  const name = positionName(culture.name, p.attributes);
  const year = String(p.attributes["year"] ?? "");
  /* Сорт и год уже в заголовке — из списка атрибутов убираем */
  const attrs = attrLines(p, culture, ["sort", "mix", "year"]);
  const lot = `от ${new Intl.NumberFormat("ru-RU").format(p.minLotKg)} кг`;
  const bag = p.bagWeightKg;

  if (platform === "avito") {
    // Сухо и фактурно, без эмодзи
    return [
      `${name}${year ? `, урожай ${year}` : ""}.`,
      "",
      attrs.join(". ") + ".",
      p.hasCertificate ? "Сертификат качества предоставлю по запросу." : "",
      "",
      `Фасовка: мешки ${bag} кг. Минимальная партия — ${lot}.`,
      `Цена: ${salePrice} ₽/кг.`,
      "",
      `Отгрузка: ${regionLabel}. Отправлю транспортной компанией (ПЭК, СДЭК) или попутчиком, возможен самовывоз. Доставка — за счёт покупателя, отправка после полной оплаты.`,
      "Для расчёта партии напишите сообщение.",
    ]
      .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
      .join("\n");
  }

  if (platform === "telegram") {
    // Живо, с эмодзи, но без перебора
    return [
      `🌾 ${name}${year ? ` — урожай ${year}` : ""}`,
      "",
      ...attrs.map((a) => `✅ ${a.replace(" — ", ": ")}`),
      "",
      `📦 Мешки ${bag} кг, партия ${lot}`,
      `💰 ${salePrice} ₽/кг`,
      "",
      `🚚 Отгрузка: ${regionLabel}. Отправлю любой ТК или попутчиком. Доставка за счёт покупателя, отправка после полной оплаты.`,
      "Для расчёта — пишите в личные сообщения 📩",
    ].join("\n");
  }

  // agroserver (и MAX/Юла/другие): профессионально
  return [
    `Реализуем: ${name}${year ? `, урожай ${year}` : ""}.`,
    attrs.map((a) => a.replace(" — ", ": ")).join(", ") + ".",
    `Фасовка ${bag} кг, минимальная партия ${lot}. Цена ${salePrice} руб/кг.`,
    `Условия: самовывоз (${regionLabel}) либо отправка транспортной компанией; стоимость доставки оплачивает покупатель. Отгрузка после полной оплаты.`,
    p.hasCertificate ? "Качество подтверждается сертификатом." : "",
    "Контакты — в профиле.",
  ]
    .filter(Boolean)
    .join("\n");
}
