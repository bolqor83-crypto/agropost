/**
 * Общие блоки PDF-шаблонов: форматирование чисел/дат, реквизиты сторон,
 * таблица товаров, подписи. Кириллица — Roboto (pdfmake, из пакета).
 */

import { DEAL_TAX_MODE_SHORT, DELIVERY_METHOD_LABEL } from "@shared/labels";
import type { TDocumentDefinitions } from "pdfmake";
import type { DocumentData, SellerRequisites } from "../types.js";

const rubFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function fmtRub(n: number): string {
  return `${rubFmt.format(n)} руб.`;
}

export function fmtNum(n: number): string {
  return rubFmt.format(n);
}

export function fmtDate(d: Date): string {
  return dateFmt.format(d);
}

/** Базовая дефиниция: A4, Roboto, поля 40 мм, компактный интерлиньяж. */
export function baseDoc(content: unknown[]): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [40, 44, 40, 40],
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.15 },
    content,
  };
}

/** Заголовок документа: «СЧЕТ НА ОПЛАТУ № СЧ-001 от 24.11.2026». */
export function title(text: string): unknown {
  return { text, fontSize: 15, bold: true, margin: [0, 0, 0, 10] };
}

export function sub(text: string): unknown {
  return { text, fontSize: 11, bold: true, margin: [0, 8, 0, 4] };
}

export function para(text: string, opts: Record<string, unknown> = {}): unknown {
  return { text, margin: [0, 0, 0, 6], ...opts };
}

export function gap(size = 8): unknown {
  return { text: "", margin: [0, 0, 0, size] };
}

/** Реквизиты продавца (пользователь — white-label, без поставщика). */
export function sellerBlock(seller: SellerRequisites): unknown[] {
  const lines = [
    seller.name,
    `ИНН: ${seller.inn ?? "—"}`,
    seller.ogrnip ? `ОГРНИП: ${seller.ogrnip}` : null,
    `Адрес: ${seller.address ?? "—"}`,
    seller.account ? `р/с: ${seller.account}` : null,
    seller.bank ? `Банк: ${seller.bank}` : null,
    seller.bik ? `БИК: ${seller.bik}` : null,
  ].filter(Boolean) as string[];
  return [
    { text: "ПРОДАВЕЦ", bold: true, margin: [0, 8, 0, 2] },
    ...lines.map((l) => ({ text: l, margin: [8, 0, 0, 0] })),
  ];
}

/** Реквизиты покупателя из сделки. */
export function buyerBlock(data: DocumentData): unknown[] {
  const lines = [
    data.buyer.name,
    data.buyer.inn ? `ИНН: ${data.buyer.inn}` : null,
    `Телефон: ${data.buyer.phone}`,
    `Регион: ${data.buyer.region}`,
  ].filter(Boolean) as string[];
  return [
    { text: "ПОКУПАТЕЛЬ", bold: true, margin: [0, 8, 0, 2] },
    ...lines.map((l) => ({ text: l, margin: [8, 0, 0, 0] })),
  ];
}

/** Таблица товара: №, наименование, кол-во (кг), цена, сумма. */
export function goodsTable(data: DocumentData, withTotal: boolean): unknown {
  const body: unknown[][] = [
    [
      { text: "№", bold: true, fillColor: "#EFEDEA", alignment: "center" },
      { text: "Наименование", bold: true, fillColor: "#EFEDEA" },
      { text: "Кол-во, кг", bold: true, fillColor: "#EFEDEA", alignment: "right" },
      { text: "Цена, руб./кг", bold: true, fillColor: "#EFEDEA", alignment: "right" },
      { text: "Сумма, руб.", bold: true, fillColor: "#EFEDEA", alignment: "right" },
    ],
    [
      { text: "1", alignment: "center" },
      data.goods.name,
      { text: fmtNum(data.goods.volumeKg), alignment: "right" },
      { text: fmtNum(data.goods.salePrice), alignment: "right" },
      { text: fmtNum(data.totals.revenue), alignment: "right" },
    ],
  ];
  if (withTotal) {
    body.push([
      { text: "" },
      { text: "", alignment: "right" },
      { text: "", alignment: "right" },
      { text: "Итого:", bold: true, alignment: "right" },
      { text: fmtNum(data.totals.revenue), bold: true, alignment: "right" },
    ]);
  }
  return {
    table: {
      widths: [22, "*", 66, 82, 92],
      body,
    },
    margin: [0, 8, 0, 8],
  };
}

/** Строка «НДС не облагается» с указанием режима продавца. */
export function taxLine(data: DocumentData): string {
  return `НДС не облагается (${DEAL_TAX_MODE_SHORT[data.seller.taxMode]}).`;
}

/** Описание доставки для договора/ТН/УПД. */
export function deliveryText(data: DocumentData): string {
  const d = data.delivery;
  if (!d || d.method === "PICKUP") {
    return "Самовывоз со склада продавца. Транспортные расходы несёт Покупатель.";
  }
  const how =
    d.method === "TK"
      ? `транспортной компанией${d.carrierName ? ` (${d.carrierName})` : ""}`
      : "попутным транспортом по договорённости";
  const route = [d.fromCity, d.toCity].filter(Boolean).join(" — ");
  const cost = d.cost !== null ? ` Стоимость доставки ${fmtRub(d.cost)} (оплачивает Покупатель, в стоимость товара не входит).` : "";
  const track = d.trackingNumber ? ` Трек-номер: ${d.trackingNumber}.` : "";
  return `Доставка ${how}${route ? `, маршрут: ${route}` : ""}.${cost}${track}`;
}

export function signatureRow(left: string, right: string): unknown {
  return {
    columns: [
      { text: left ? `${left}: ______________________` : "______________________", margin: [0, 18, 0, 0] },
      { text: `${right}: ______________________`, alignment: "right", margin: [0, 18, 0, 0] },
    ],
  };
}

export { DELIVERY_METHOD_LABEL };
