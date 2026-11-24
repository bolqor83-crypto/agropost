/**
 * Нумерация документов и сделок (часть C ТЗ, этап 4).
 */

import { describe, expect, test } from "bun:test";
import { dealNumber, documentNumber } from "../numbering.js";

describe("documentNumber", () => {
  test("СЧ-001 → СЧ-002 (счёт)", () => {
    expect(documentNumber("INVOICE", 0)).toBe("СЧ-001");
    expect(documentNumber("INVOICE", 1)).toBe("СЧ-002");
    expect(documentNumber("INVOICE", 999)).toBe("СЧ-1000");
  });

  test("префиксы по типам: Д, ТН, УПД", () => {
    expect(documentNumber("CONTRACT", 0)).toBe("Д-001");
    expect(documentNumber("TRANSPORT_NOTE", 2)).toBe("ТН-003");
    expect(documentNumber("UPD", 0)).toBe("УПД-001");
  });
});

describe("dealNumber", () => {
  test("СД-0001 → СД-0002", () => {
    expect(dealNumber(0)).toBe("СД-0001");
    expect(dealNumber(1)).toBe("СД-0002");
    expect(dealNumber(9999)).toBe("СД-10000");
  });
});
