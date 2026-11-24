/**
 * Шаблон «Счёт на оплату» (СЧ-001). Банковские реквизиты обязательны —
 * покупателю нужно куда платить. Предоплата 100%, отправка после оплаты.
 */

import type { TDocumentDefinitions } from "pdfmake";
import type { DocumentData } from "../types.js";
import {
  baseDoc,
  buyerBlock,
  fmtDate,
  fmtRub,
  gap,
  goodsTable,
  para,
  sellerBlock,
  sub,
  taxLine,
  title,
} from "./common.js";

export function buildInvoiceDoc(data: DocumentData): TDocumentDefinitions {
  const content: unknown[] = [
    title(`СЧЕТ НА ОПЛАТУ № ${data.number} от ${fmtDate(data.generatedAt)}`),
    ...sellerBlock(data.seller),
    ...buyerBlock(data),
    sub("Товар"),
    goodsTable(data, true),
    para(taxLine(data)),
    para(`Итого к оплате: ${fmtRub(data.totals.revenue)}`),
    gap(6),
    para("Условия: 100% предоплата. Отгрузка — после зачисления оплаты.", {
      fontSize: 9,
      color: "#666666",
    }),
    para(`Сделка № ${data.dealNumber} в АгроПост.`, { fontSize: 9, color: "#666666" }),
    gap(14),
    {
      columns: [
        { text: `Продавец: ______________________ / ${data.seller.name}` },
        { text: "М.П.", alignment: "right" },
      ],
    },
  ];
  return baseDoc(content);
}
