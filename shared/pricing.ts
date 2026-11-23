/**
 * Экономика позиции. Единый расчёт для сервера, веба и превью.
 *
 * МАРЖА = (цена продажи − цена поставщика) × кол-во − налог.
 * Доставку оплачивает покупатель — в маржу пользователя не входит.
 * Все цены — за килограмм; salePrice округляется до целого рубля.
 */

/** Цена продажи: закуп + наценка, округление до целого рубля. */
export function computeSalePrice(supplierPrice: number, markupPercent: number): number {
  return Math.round(supplierPrice * (1 + markupPercent / 100));
}

export interface MarginBreakdown {
  qtyKg: number;
  revenue: number;
  cost: number;
  gross: number;
  tax: number;
  net: number;
}

/** Маржа с объёма позиции (до и после налога). */
export function calcMargin(
  salePrice: number,
  supplierPrice: number,
  volumeKg: number,
  taxRate: number,
): MarginBreakdown {
  const revenue = salePrice * volumeKg;
  const cost = supplierPrice * volumeKg;
  const gross = revenue - cost;
  const tax = Math.round(revenue * taxRate);
  return { qtyKg: volumeKg, revenue, cost, gross, tax, net: gross - tax };
}
