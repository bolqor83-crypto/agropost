/**
 * Экономика сделки: маржа с налогом в трёх режимах (часть E ТЗ, этап 4).
 * МАРЖА = (продажа − закуп) × объём − налог; доставка не входит.
 */

import { describe, expect, test } from "bun:test";
import { computeDealEconomics, deriveDealTaxMode, dealTaxModeToProfile } from "@shared/pricing";

describe("computeDealEconomics", () => {
  const base = { salePrice: 100, supplierPrice: 80, volumeKg: 1000 };

  test("ИП 6%: налог 6000, маржа 14000", () => {
    const e = computeDealEconomics({ ...base, taxMode: "IP_6" });
    expect(e.revenue).toBe(100000);
    expect(e.cost).toBe(80000);
    expect(e.gross).toBe(20000);
    expect(e.taxAmount).toBe(6000);
    expect(e.margin).toBe(14000);
  });

  test("самозанятый 4%: налог 4000, маржа 16000", () => {
    const e = computeDealEconomics({ ...base, taxMode: "SELF_EMPLOYED_4" });
    expect(e.taxAmount).toBe(4000);
    expect(e.margin).toBe(16000);
  });

  test("самозанятый 6%: налог 6000, маржа 14000", () => {
    const e = computeDealEconomics({ ...base, taxMode: "SELF_EMPLOYED_6" });
    expect(e.taxAmount).toBe(6000);
    expect(e.margin).toBe(14000);
  });

  test("копейки округляются до 2 знаков", () => {
    const e = computeDealEconomics({ salePrice: 99.95, supplierPrice: 77.5, volumeKg: 333.3, taxMode: "IP_6" });
    expect(Number.isFinite(e.margin)).toBe(true);
    expect(Math.abs(e.margin - (99.95 * 333.3 - 77.5 * 333.3 - 99.95 * 333.3 * 0.06))).toBeLessThan(0.011);
  });

  test("отрицательная маржа при демпинге", () => {
    const e = computeDealEconomics({ salePrice: 70, supplierPrice: 80, volumeKg: 100, taxMode: "IP_6" });
    expect(e.margin).toBeLessThan(0);
  });
});

describe("deriveDealTaxMode", () => {
  test("ИП → IP_6", () => {
    expect(deriveDealTaxMode("IP", 0.06)).toBe("IP_6");
  });
  test("самозанятый 4% → SELF_EMPLOYED_4", () => {
    expect(deriveDealTaxMode("SELF_EMPLOYED", 0.04)).toBe("SELF_EMPLOYED_4");
  });
  test("самозанятый 6% и НПД 7% → SELF_EMPLOYED_6", () => {
    expect(deriveDealTaxMode("SELF_EMPLOYED", 0.06)).toBe("SELF_EMPLOYED_6");
    expect(deriveDealTaxMode("SELF_EMPLOYED", 0.07)).toBe("SELF_EMPLOYED_6");
  });
});

describe("dealTaxModeToProfile", () => {
  test("обратное отображение согласовано с deriveDealTaxMode", () => {
    for (const mode of ["IP_6", "SELF_EMPLOYED_4", "SELF_EMPLOYED_6"] as const) {
      const p = dealTaxModeToProfile(mode);
      expect(deriveDealTaxMode(p.taxMode, p.taxRate)).toBe(mode);
    }
  });
});
