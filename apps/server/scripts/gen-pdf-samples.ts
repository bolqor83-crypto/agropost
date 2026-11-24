/**
 * Патч 4.1, часть A: регенерация 4 образцов PDF (счёт, договор, ТН, УПД)
 * + проверка извлечённого текста через pdf-parse:
 *   - «ПРОДАВЕЦ» есть, «ПРОЛАВЕЦ» нет;
 *   - кириллица без mojibake («Ñàìîâûâîç» и подобные отсутствуют).
 * Запуск: cd apps/server Запуск: cd apps/server && bun run <этот файл>Запуск: cd apps/server && bun run <этот файл> bun run scripts/gen-pdf-samples.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { computeDealEconomics } from "@shared/pricing";
import { generateDocumentPdf } from "../src/documents/generator.js";
import type { DocumentData, SellerRequisites } from "../src/documents/types.js";

const OUT_DIR = "/home/z/my-project/download/agropost-stage4-docs";

const seller: SellerRequisites = {
  name: "Владелец АгроПост",
  inn: "231234567890",
  ogrnip: "314231234500012",
  address: "Краснодарский край, ст. Павловская",
  bank: "АО «Тинькофф Банк»",
  bik: "046015208",
  account: "40802810123456789012",
  taxMode: "IP_6",
};

const econ = computeDealEconomics({
  salePrice: 213,
  supplierPrice: 185,
  volumeKg: 1000,
  taxMode: "IP_6",
});

function docData(type: DocumentData["type"], number: string): DocumentData {
  return {
    type,
    number,
    generatedAt: new Date(),
    dealNumber: "СД-0001",
    seller,
    buyer: {
      name: "Сергей Тарасов",
      phone: "+7 (928) 200-11-55",
      region: "Ставропольский край",
      inn: null,
    },
    goods: {
      name: "Люцерна «Вега 87»",
      volumeKg: 1000,
      bagWeightKg: 25,
      salePrice: 213,
      supplierPrice: 185,
    },
    delivery: {
      method: "TK",
      carrierName: "ПЭК",
      fromCity: "Павловская",
      toCity: "Ставрополь",
      cost: 7500,
      trackingNumber: "PEK-771023",
    },
    totals: {
      volumeKg: 1000,
      revenue: econ.revenue,
      taxAmount: econ.taxAmount,
      margin: econ.margin,
    },
  };
}

const FILES: { type: DocumentData["type"]; number: string; file: string }[] = [
  { type: "INVOICE", number: "СЧ-001", file: "АгроПост-СЧЕТ-образец.pdf" },
  { type: "CONTRACT", number: "Д-001", file: "АгроПост-ДОГОВОР-образец.pdf" },
  { type: "TRANSPORT_NOTE", number: "ТН-001", file: "АгроПост-ТН-образец.pdf" },
  { type: "UPD", number: "УПД-001", file: "АгроПост-УПД-образец.pdf" },
];

async function pdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const res = await parser.getText();
    return res.text;
  } finally {
    await parser.destroy();
  }
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  let failed = false;

  for (const { type, number, file } of FILES) {
    const buffer = await generateDocumentPdf(docData(type, number));
    await writeFile(path.join(OUT_DIR, file), buffer);

    const text = await pdfText(buffer).catch(() => null);
    if (text === null) {
      console.error(`✗ ${file}: pdf-parse не смог извлечь текст`);
      failed = true;
      continue;
    }
    const problems: string[] = [];
    if (!text.includes("ПРОДАВЕЦ")) problems.push("нет «ПРОДАВЕЦ»");
    if (text.includes("ПРОЛАВЕЦ")) problems.push("опечатка «ПРОЛАВЕЦ»");
    if (/[À-Þßà-ÿ]{2,}/.test(text)) problems.push("mojibake (CP1251→Latin-1)");
    for (const bad of ["Ñàìîâûâîç", "Ñ", "à", "ì", "âû"]) {
      if (text.includes(bad)) problems.push(`символ «${bad}»`);
    }
    if (type === "CONTRACT" && !text.includes("Самовывоз")) {
      /* самовывоз есть только в варианте PICKUP; в образце доставка ТК — ок */
    }
    if (problems.length > 0) {
      console.error(`✗ ${file}: ${problems.join("; ")}`);
      failed = true;
    } else {
      const size = (buffer.length / 1024).toFixed(1);
      console.log(`✓ ${file} — ${size} КБ, кириллица чистая, «ПРОДАВЕЦ» без опечатки`);
    }
  }

  if (failed) {
    console.error("ПРОВЕРКА ПРОВАЛЕНА");
    process.exitCode = 1;
    return;
  }
  console.log("ПРОВЕРКА ПРОЙДЕНА: опечатки и mojibake в образцах PDF отсутствуют.");
}

void main();
