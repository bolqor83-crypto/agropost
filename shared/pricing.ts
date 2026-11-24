import type { DealTaxMode, TaxMode } from "./types";

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

/* ---------- Этап 4: экономика сделки с налогом ---------- */

/** Ставка налога по режиму сделки: ИП 6% / самозанятый 4% / 6%. */
export const DEAL_TAX_RATE: Record<DealTaxMode, number> = {
  IP_6: 0.06,
  SELF_EMPLOYED_4: 0.04,
  SELF_EMPLOYED_6: 0.06,
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DealEconomics {
  volumeKg: number;
  salePrice: number;
  supplierPrice: number;
  /** Выручка = цена продажи × объём. */
  revenue: number;
  /** Закуп = цена поставщика × объём. */
  cost: number;
  /** Разница до налога. */
  gross: number;
  taxAmount: number;
  /** Доп. затраты на доставку до терминала (входят в себестоимость). */
  deliveryToTerminalCost: number;
  /** (продажа − закуп) × объём − налог − доставка до терминала.
   * Доставка покупателю не входит (платит он сам). */
  margin: number;
}

/**
 * Экономика сделки — единый расчёт для сервера, веба и превью.
 * taxAmount = выручка × ставка режима; margin = gross − taxAmount −
 * deliveryToTerminalCost (этап 5.1: доп. расходы на доставку до
 * терминала поставщика больше не завышают прибыль).
 */
export function computeDealEconomics(input: {
  salePrice: number;
  supplierPrice: number;
  volumeKg: number;
  taxMode: DealTaxMode;
  /** Доп. затраты на доставку до терминала ТК, ₽ (0 по умолчанию). */
  deliveryToTerminalCost?: number;
}): DealEconomics {
  const revenue = round2(input.salePrice * input.volumeKg);
  const cost = round2(input.supplierPrice * input.volumeKg);
  const gross = round2(revenue - cost);
  const taxAmount = round2(revenue * (DEAL_TAX_RATE[input.taxMode] ?? 0.06));
  const deliveryToTerminalCost = round2(input.deliveryToTerminalCost ?? 0);
  return {
    volumeKg: input.volumeKg,
    salePrice: input.salePrice,
    supplierPrice: input.supplierPrice,
    revenue,
    cost,
    gross,
    taxAmount,
    deliveryToTerminalCost,
    margin: round2(gross - taxAmount - deliveryToTerminalCost),
  };
}

/**
 * Режим сделки по умолчанию — из профиля (TaxMode + taxRate):
 * ИП → IP_6; самозанятый 4% → SELF_EMPLOYED_4; иначе SELF_EMPLOYED_6.
 */
export function deriveDealTaxMode(taxMode: TaxMode, taxRate: number): DealTaxMode {
  if (taxMode === "IP") return "IP_6";
  return taxRate <= 0.04 ? "SELF_EMPLOYED_4" : "SELF_EMPLOYED_6";
}

/** Обратное отображение: режим сделки → TaxMode + taxRate профиля.
 * ЭТАП 6: default вместо падения — при неожидаемом значении (кривые данные,
 * старый кеш) UI продолжает работать, показывая безопасный ИП 6%. */
export function dealTaxModeToProfile(
  mode: DealTaxMode,
): { taxMode: TaxMode; taxRate: number } {
  switch (mode) {
    case "IP_6":
      return { taxMode: "IP", taxRate: 0.06 };
    case "SELF_EMPLOYED_4":
      return { taxMode: "SELF_EMPLOYED", taxRate: 0.04 };
    case "SELF_EMPLOYED_6":
    default:
      return { taxMode: "SELF_EMPLOYED", taxRate: 0.06 };
  }
}
