/**
 * ЭТАП 9 — фикстуры фидов: узкие строки позиций (без Prisma),
 * как их отдаёт loadRows в проде.
 */

import type { AttributeField } from "@shared/types";
import type { FeedPositionRow } from "../data.js";

const SEED_SCHEMA: AttributeField[] = [
  { key: "sort", label: "Сорт", type: "text", required: true },
  { key: "reproduction", label: "Репродукция", type: "text", required: true },
  { key: "germination", label: "Всхожесть", type: "percent", unit: "%", required: true },
  { key: "purity", label: "Чистота", type: "percent", unit: "%", required: true },
  { key: "year", label: "Год урожая", type: "year", required: true },
];

const NUT_SCHEMA: AttributeField[] = [
  { key: "sort", label: "Сорт", type: "text", required: true },
  { key: "caliber", label: "Калибр", type: "text", required: false },
  { key: "moisture", label: "Влажность", type: "percent", unit: "%", required: false },
  { key: "year", label: "Год урожая", type: "year", required: false },
];

/** Люцерна «Вега 87» РС1 — как в ТЗ этапа 9. */
export const ALFALFA_ROW: FeedPositionRow = {
  id: "pos-1",
  attributes: {
    sort: "Вега 87",
    reproduction: "РС1",
    germination: 92,
    purity: 98,
    year: 2026,
  },
  volumeKg: 5000,
  bagWeightKg: 25,
  minLotKg: 500,
  salePrice: 213,
  hasCertificate: true,
  supplier: { location: "PAVLOVSKAYA" },
  culture: { id: "cult-alfalfa", name: "Люцерна", type: "SEED", attributesSchema: SEED_SCHEMA },
  media: [
    { type: "PHOTO", url: "https://pub-fake.r2.dev/positions/pos-1/1-alfalfa.jpg" },
    { type: "PHOTO", url: "https://pub-fake.r2.dev/positions/pos-1/2-alfalfa.jpg" },
    { type: "PHOTO", url: "data:image/svg+xml;base64,PHN2Zy8+" }, /* data-URL — в фид не идёт */
    { type: "VIDEO", url: "https://pub-fake.r2.dev/positions/pos-1/video.mp4" },
  ],
};

/** Грецкий орех «Идеал», калибр 32+. */
export const WALNUT_ROW: FeedPositionRow = {
  id: "pos-2",
  attributes: { sort: "Идеал", caliber: "32+", moisture: 8, year: 2026 },
  volumeKg: 1200,
  bagWeightKg: 30,
  minLotKg: 100,
  salePrice: 450,
  hasCertificate: false,
  supplier: { location: "LENINGRADSKAYA" },
  culture: { id: "cult-walnut", name: "Грецкий орех", type: "NUT", attributesSchema: NUT_SCHEMA },
  media: [{ type: "PHOTO", url: "https://pub-fake.r2.dev/positions/pos-2/walnut.jpg" }],
};

export const OWNER = { name: "ИП Тестов Тест Тестович" };
export const SHOP_URL = "https://agropost-web.onrender.com";
export const FIXED_NOW = new Date("2026-11-25T12:00:00Z");
