/**
 * Шаблон УПД (УПД-001), упрощённая форма: счёт + передаточный акт.
 * Банковские реквизиты обязательны (как у счёта).
 */

import type { TDocumentDefinitions } from "pdfmake";
import type { DocumentData } from "../types.js";
import {
  baseDoc,
  buyerBlock,
  deliveryText,
  fmtDate,
  fmtRub,
  gap,
  goodsTable,
  para,
  sellerBlock,
  signatureRow,
  sub,
  taxLine,
  title,
} from "./common.js";

export function buildUpdDoc(data: DocumentData): TDocumentDefinitions {
  const content: unknown[] = [
    title(`УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ № ${data.number}`),
    para(`от ${fmtDate(data.generatedAt)}`, { margin: [0, 0, 0, 10] }),
    para("Статус: 1 — передача товара (услуг) (упрощённая форма).", {
      fontSize: 9,
      color: "#666666",
    }),

    ...sellerBlock(data.seller),
    ...buyerBlock(data),

    sub("Товар (работы, услуги)"),
    goodsTable(data, true),
    para(taxLine(data)),
    para(`Всего к оплате: ${fmtRub(data.totals.revenue)}`),

    sub("Доставка"),
    para(deliveryText(data)),

    gap(10),
    para(
      "Товар передан Покупателем принят в объёме, указанном выше. Претензии по количеству и качеству — в течение 3 календарных дней с момента приёмки.",
      { fontSize: 9 },
    ),
    signatureRow("Продавец", "Покупатель"),
    para(`Сделка № ${data.dealNumber} в АгроПост.`, {
      fontSize: 9,
      color: "#666666",
      margin: [0, 10, 0, 0],
    }),
  ];
  return baseDoc(content);
}
