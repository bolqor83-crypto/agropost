/**
 * Шаблон «Транспортная накладная» (ТН-001), упрощённая форма.
 * Грузоотправитель — продавец (пользователь), перевозчик — ТК из сделки.
 */

import type { TDocumentDefinitions } from "pdfmake";
import type { DocumentData } from "../types.js";
import {
  baseDoc,
  fmtDate,
  fmtNum,
  fmtRub,
  gap,
  para,
  sellerBlock,
  buyerBlock,
  signatureRow,
  sub,
  title,
} from "./common.js";

export function buildTransportDoc(data: DocumentData): TDocumentDefinitions {
  const d = data.delivery;
  const carrier = d?.carrierName ?? "не указан";
  const method =
    d?.method === "PICKUP"
      ? "самовывоз Покупателем"
      : d?.method === "FELLOW_TRAVELER"
        ? "попутный транспорт"
        : "транспортная компания";
  const route = d ? [d.fromCity, d.toCity].filter(Boolean).join(" — ") : "маршрут не указан";
  const bags = data.goods.bagWeightKg
    ? ` (${Math.ceil(data.goods.volumeKg / data.goods.bagWeightKg)} мешков по ${fmtNum(data.goods.bagWeightKg)} кг)`
    : "";

  const content: unknown[] = [
    title(`ТРАНСПОРТНАЯ НАКЛАДНАЯ (упрощённая) № ${data.number}`),
    para(`от ${fmtDate(data.generatedAt)}`, { margin: [0, 0, 0, 10] }),

    ...sellerBlock(data.seller),
    ...buyerBlock(data),

    sub("Перевозка"),
    para(`Способ перевозки: ${method}.`),
    para(`Перевозчик: ${carrier}.`),
    para(`Маршрут: ${route}.`),
    para(
      `Груз: ${data.goods.name}; количество ${fmtNum(data.goods.volumeKg)} кг${bags}.`,
    ),
    para(
      `Стоимость доставки: ${d && d.cost !== null ? fmtRub(d.cost) : "—"} (оплачивает Покупатель, в стоимость товара не входит).`,
    ),
    ...(d?.trackingNumber ? [para(`Трек-номер: ${d.trackingNumber}.`)] : []),

    gap(12),
    signatureRow("Грузоотправитель", "Перевозчик"),
    signatureRow("", "Грузополучатель"),
    para(`Сделка № ${data.dealNumber} в АгроПост.`, {
      fontSize: 9,
      color: "#666666",
      margin: [0, 10, 0, 0],
    }),
  ];
  return baseDoc(content);
}
