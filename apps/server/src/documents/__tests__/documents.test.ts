/**
 * Golden set документов (часть F ТЗ, этап 4): счёт, договор, ТН, УПД —
 * реальный PDF через pdfmake + извлечение текста pdf-parse.
 * Проверяем ключевые поля: номер, дата, продавец, покупатель, сумма, НДС.
 */

import { describe, expect, test } from "bun:test";
import { PDFParse } from "pdf-parse";
import { computeDealEconomics } from "@shared/pricing";
import { assertBankRequisites, assertSellerRequisites, generateDocumentPdf, DocumentsError } from "../generator.js";
import type { DocumentData, SellerRequisites } from "../types.js";
import { sellerFixture } from "../../deals/__tests__/fixtures.js";

function sellerRequisites(): SellerRequisites {
  const s = sellerFixture();
  return {
    name: s.name,
    inn: s.inn,
    ogrnip: s.ogrnip,
    address: s.address,
    bank: s.bank,
    bik: s.bik,
    account: s.account,
    taxMode: "IP_6",
  };
}

function docData(type: DocumentData["type"], number: string): DocumentData {
  const econ = computeDealEconomics({ salePrice: 100, supplierPrice: 80, volumeKg: 5000, taxMode: "IP_6" });
  return {
    type,
    number,
    generatedAt: new Date("2026-11-24T12:00:00Z"),
    dealNumber: "СД-0001",
    seller: sellerRequisites(),
    buyer: {
      name: "ООО «Агро-Трейд»",
      phone: "+7 (918) 000-11-22",
      region: "Ростовская область",
      inn: "6152345678",
    },
    goods: {
      name: "Люцерна «Вега 87»",
      volumeKg: 5000,
      bagWeightKg: 25,
      salePrice: 100,
      supplierPrice: 80,
    },
    delivery: {
      method: "TK",
      carrierName: "ПЭК",
      fromCity: "Павловская",
      toCity: "Ростов-на-Дону",
      cost: 8000,
      trackingNumber: "PEK-123456",
    },
    totals: {
      volumeKg: 5000,
      revenue: econ.revenue,
      taxAmount: econ.taxAmount,
      margin: econ.margin,
    },
  };
}

async function pdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const res = await parser.getText();
    return res.text.replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

describe("golden set: PDF-документы", () => {
  test("счёт СЧ-001: номер, дата, продавец, покупатель, сумма, НДС", async () => {
    const buffer = await generateDocumentPdf(docData("INVOICE", "СЧ-001"));
    expect(buffer.length).toBeGreaterThan(3000);
    const text = await pdfText(buffer);

    expect(text).toContain("СЧЕТ НА ОПЛАТУ № СЧ-001");
    expect(text).toContain("24.11.2026");
    expect(text).toContain("Иванов Иван Иванович (ИП)");
    expect(text).toContain("ООО «Агро-Трейд»");
    expect(text).toContain("Люцерна «Вега 87»");
    expect(text).toContain("5 000");
    expect(text).toContain("500 000"); /* выручка 5000 кг × 100 ₽ */
    expect(text).toContain("НДС не облагается");
    expect(text).toContain("предоплата");
  });

  test("договор Д-001: стороны, предмет, сумма, доставка за счёт покупателя", async () => {
    const buffer = await generateDocumentPdf(docData("CONTRACT", "Д-001"));
    const text = await pdfText(buffer);

    expect(text).toContain("ДОГОВОР КУПЛИ-ПРОДАЖИ № Д-001");
    expect(text).toContain("Люцерна «Вега 87»");
    expect(text).toContain("5 000");
    expect(text).toContain("500 000");
    expect(text).toContain("предоплата");
    expect(text).toContain("Доставка");
    expect(text).toContain("оплачивает Покупатель");
    expect(text).toContain("Иванов Иван Иванович (ИП)");
  });

  test("ТН ТН-001: грузоотправитель, перевозчик, маршрут, трек", async () => {
    const buffer = await generateDocumentPdf(docData("TRANSPORT_NOTE", "ТН-001"));
    const text = await pdfText(buffer);

    expect(text).toContain("ТРАНСПОРТНАЯ НАКЛАДНАЯ");
    expect(text).toContain("ТН-001");
    expect(text).toContain("Иванов Иван Иванович (ИП)");
    expect(text).toContain("ПЭК");
    expect(text).toContain("Павловская — Ростов-на-Дону");
    expect(text).toContain("PEK-123456");
    expect(text).toContain("5 000");
    expect(text).toContain("оплачивает Покупатель");
  });

  test("УПД УПД-001: номер, стороны, итог, НДС", async () => {
    const buffer = await generateDocumentPdf(docData("UPD", "УПД-001"));
    const text = await pdfText(buffer);

    expect(text).toContain("УПД-001");
    expect(text).toContain("Иванов Иван Иванович (ИП)");
    expect(text).toContain("ООО «Агро-Трейд»");
    expect(text).toContain("500 000");
    expect(text).toContain("НДС не облагается");
  });

  test("белый лейбл: поставщик в документах не упоминается", async () => {
    const buffer = await generateDocumentPdf(docData("INVOICE", "СЧ-009"));
    const text = await pdfText(buffer);
    expect(text).not.toContain("Supplier");
    expect(text).not.toContain("поставщик");
  });

  /* Патч 4.1, часть A: регресс на кодировку и опечатки шаблона договора. */
  test("договор (самовывоз): «ПРОДАВЕЦ» без опечатки, кириллица без mojibake", async () => {
    const data = docData("CONTRACT", "Д-002");
    data.delivery = {
      method: "PICKUP",
      carrierName: null,
      fromCity: null,
      toCity: null,
      cost: null,
      trackingNumber: null,
    };
    const buffer = await generateDocumentPdf(data);
    const text = await pdfText(buffer);

    /* Заголовок раздела реквизитов и подписи — правильное слово. */
    expect(text).toContain("ПРОДАВЕЦ");
    expect(text).not.toContain("ПРОЛАВЕЦ");
    expect(text).toContain("Продавец: ____");

    /* Пункт 3 — доставка: живая кириллица, не CP1251→Latin-1 mojibake. */
    expect(text).toContain("Самовывоз со склада продавца");
    expect(text).toContain("Транспортные расходы несёт Покупатель");

    /* Признаки двойной кодировки: «Ñàìîâûâîç» и подобные. */
    expect(text).not.toMatch(/[À-Þßà-ÿ]{2,}/);
    expect(text).not.toContain("Ñ");
    expect(text).not.toContain("ì");
    expect(text).not.toContain("âû");
  });

  test("все 4 документа: нет mojibake-последовательностей в извлечённом тексте", async () => {
    const types: DocumentData["type"][] = ["INVOICE", "CONTRACT", "TRANSPORT_NOTE", "UPD"];
    for (const type of types) {
      const buffer = await generateDocumentPdf(docData(type, "X-001"));
      const text = await pdfText(buffer);
      expect(text).not.toMatch(/[À-Þßà-ÿ]{2,}/);
      /* Кириллица реально извлекается (шрифт Roboto встроен корректно). */
      expect(text).toContain("ПРОДАВЕЦ");
      expect(text).not.toContain("ПРОЛАВЕЦ");
    }
  });
});

describe("реквизиты продавца", () => {
  test("без ФИО/ИНН/адреса — DocumentsError REQUISITES_MISSING", () => {
    const bad: SellerRequisites = {
      ...sellerRequisites(),
      name: "",
      inn: null,
      address: null,
    };
    expect(() => assertSellerRequisites(bad)).toThrow(DocumentsError);
    try {
      assertSellerRequisites(bad);
    } catch (err) {
      expect((err as DocumentsError).code).toBe("REQUISITES_MISSING");
      expect((err as DocumentsError).message).toContain("Заполните реквизиты");
    }
  });

  test("счёт без банка/р/с — DocumentsError (банковские реквизиты)", () => {
    const noBank: SellerRequisites = { ...sellerRequisites(), account: null, bank: null, bik: null };
    expect(() => assertBankRequisites(noBank)).toThrow(DocumentsError);
    try {
      assertBankRequisites(noBank);
    } catch (err) {
      expect((err as DocumentsError).message).toContain("банковские реквизиты");
    }
  });

  test("полные реквизиты проходят проверку", () => {
    expect(() => assertSellerRequisites(sellerRequisites())).not.toThrow();
    expect(() => assertBankRequisites(sellerRequisites())).not.toThrow();
  });
});
