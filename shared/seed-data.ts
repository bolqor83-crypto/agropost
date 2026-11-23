/**
 * Демо-данные этапа 1 (из брифа). Чистый модуль без prisma-импортов:
 * - apps/server/prisma/seed.ts раскладывает их в базу;
 * - Next-превью поднимает из них мок-API (те же данные, что и в проде).
 *
 * ТЕЛЕФОНЫ — заглушки +7 900 000-00-0X: замените на реальные в интерфейсе.
 * Демо-фото — встроенные SVG-заглушки (data-URL), работают без R2.
 */

import type {
  AttributeField,
  CultureType,
  PositionStatus,
  ShippingMode,
  SupplierLocation,
  TaxMode,
  AttributesMap,
} from "./types";

/* ---------- Пользователь (один, без ролей) ---------- */

export const SEED_USER: {
  name: string;
  inn: string | null;
  taxMode: TaxMode;
  taxRate: number;
} = {
  name: "Владелец АгроПост",
  inn: null,
  taxMode: "IP",
  taxRate: 0.06,
};

/* ---------- Поставщики ---------- */

export interface SeedSupplier {
  id: string;
  name: string;
  phone: string;
  location: SupplierLocation;
  shippingMode: ShippingMode;
  notes?: string;
}

export const SEED_SUPPLIERS: SeedSupplier[] = [
  {
    id: "sup-agroyug",
    name: "Агро-Юг",
    phone: "+7 900 000-00-01",
    location: "PAVLOVSKAYA",
    shippingMode: "SELF_LOADS",
    notes:
      "Основной поставщик. Сам грузит в ТК; при выезде за пределы Павловской — " +
      "небольшая доплата за дорогу.",
  },
  {
    id: "sup-semstart",
    name: "СемСтарт",
    phone: "+7 900 000-00-02",
    location: "LENINGRADSKAYA",
    shippingMode: "FROM_WAREHOUSE",
    notes: "Продаёт со склада, погрузка за счёт поставщика.",
  },
  {
    id: "sup-orehprom",
    name: "ОрехПром",
    phone: "+7 900 000-00-03",
    location: "TIHORETSK",
    shippingMode: "BOTH",
    notes: "Склад в Тихорецке; по договорённости может сам привезти в ТК.",
  },
];

/* ---------- Шаблоны культур ---------- */

export interface SeedCulture {
  id: string;
  name: string;
  type: CultureType;
  attributesSchema: AttributeField[];
}

export const SEED_CULTURES: SeedCulture[] = [
  {
    id: "cult-alfalfa",
    name: "Люцерна",
    type: "SEED",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", required: true },
      { key: "grade", label: "Класс", type: "text", required: false },
      { key: "reproduction", label: "Репродукция", type: "text", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", required: true },
      { key: "weed", label: "Засорённость", type: "percent", unit: "%", required: false },
      { key: "year", label: "Год урожая", type: "year", required: true },
    ],
  },
  {
    id: "cult-sainfoin",
    name: "Эспарцет",
    type: "SEED",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", required: true },
      { key: "reproduction", label: "Репродукция", type: "text", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", required: true },
    ],
  },
  {
    id: "cult-sudan",
    name: "Суданская трава",
    type: "SEED",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", required: true },
      { key: "reproduction", label: "Репродукция", type: "text", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", required: true },
    ],
  },
  {
    id: "cult-meadow",
    name: "Разнотравье",
    type: "SEED",
    attributesSchema: [
      { key: "mix", label: "Состав", type: "text", required: true },
      { key: "germination", label: "Всхожесть", type: "percent", unit: "%", required: true },
      { key: "year", label: "Год урожая", type: "year", required: false },
    ],
  },
  {
    id: "cult-walnut",
    name: "Грецкий орех",
    type: "NUT",
    attributesSchema: [
      { key: "sort", label: "Сорт", type: "text", required: false },
      { key: "calibre", label: "Калибр", type: "text", required: true },
      { key: "moisture", label: "Влажность", type: "percent", unit: "%", required: true },
      { key: "kernel", label: "Выход ядра", type: "percent", unit: "%", required: true },
      { key: "year", label: "Год урожая", type: "year", required: true },
    ],
  },
];

/* ---------- Позиции ---------- */

export interface SeedCertificate {
  name: string;
  /** ISO-дата выдачи. */
  issuedAt: string;
}

export interface SeedPosition {
  id: string;
  supplierId: string;
  cultureId: string;
  attributes: AttributesMap;
  /** Остаток, кг. */
  volumeKg: number;
  bagWeightKg: number;
  minLotKg: number;
  /** Закуп поставщика, ₽/кг. */
  supplierPrice: number;
  markupPercent: number;
  hasCertificate: boolean;
  status: PositionStatus;
  /** Сколько демо-фото создать. */
  photoCount: number;
  certificates: SeedCertificate[];
  /** Для «Обновлено N дн. назад» в демо. */
  updatedDaysAgo: number;
}

export const SEED_POSITIONS: SeedPosition[] = [
  {
    id: "pos-1",
    supplierId: "sup-agroyug",
    cultureId: "cult-alfalfa",
    attributes: {
      sort: "Вега 87",
      grade: "1 класс",
      reproduction: "РС-1",
      germination: 92,
      weed: 2,
      year: 2025,
    },
    volumeKg: 3000,
    bagWeightKg: 25,
    minLotKg: 1500,
    supplierPrice: 185,
    markupPercent: 15,
    hasCertificate: true,
    status: "IN_STOCK",
    photoCount: 6,
    certificates: [
      { name: "Сертификат соответствия — Вега 87 (РС-1)", issuedAt: "2025-08-15" },
    ],
    updatedDaysAgo: 0,
  },
  {
    id: "pos-2",
    supplierId: "sup-agroyug",
    cultureId: "cult-alfalfa",
    attributes: {
      sort: "Славянская",
      grade: "2 класс",
      reproduction: "РС-2",
      germination: 82,
      weed: 3,
      year: 2025,
    },
    volumeKg: 4000,
    bagWeightKg: 50,
    minLotKg: 2000,
    supplierPrice: 165,
    markupPercent: 18,
    hasCertificate: false,
    status: "OUT_OF_STOCK",
    photoCount: 3,
    certificates: [],
    updatedDaysAgo: 1,
  },
  {
    id: "pos-3",
    supplierId: "sup-agroyug",
    cultureId: "cult-walnut",
    attributes: { sort: "Идеал", calibre: "32+", moisture: 8, kernel: 52, year: 2025 },
    volumeKg: 10000,
    bagWeightKg: 25,
    minLotKg: 500,
    supplierPrice: 100,
    markupPercent: 18,
    hasCertificate: true,
    status: "IN_STOCK",
    photoCount: 8,
    certificates: [{ name: "Протокол испытаний — орех Идеал 32+", issuedAt: "2025-10-02" }],
    updatedDaysAgo: 0,
  },
  {
    id: "pos-4",
    supplierId: "sup-semstart",
    cultureId: "cult-sainfoin",
    attributes: { sort: "Песчаный 1251", reproduction: "РС-1", germination: 90 },
    volumeKg: 5000,
    bagWeightKg: 25,
    minLotKg: 1000,
    supplierPrice: 145,
    markupPercent: 15,
    hasCertificate: true,
    status: "IN_STOCK",
    photoCount: 4,
    certificates: [{ name: "Сертификат соответствия — Песчаный 1251", issuedAt: "2025-07-21" }],
    updatedDaysAgo: 2,
  },
  {
    id: "pos-5",
    supplierId: "sup-semstart",
    cultureId: "cult-sudan",
    attributes: { sort: "Донская 5", reproduction: "РС-2", germination: 85 },
    volumeKg: 3750,
    bagWeightKg: 25,
    minLotKg: 1000,
    supplierPrice: 120,
    markupPercent: 15,
    hasCertificate: false,
    status: "ON_ORDER",
    photoCount: 2,
    certificates: [],
    updatedDaysAgo: 3,
  },
  {
    id: "pos-6",
    supplierId: "sup-semstart",
    cultureId: "cult-alfalfa",
    attributes: { sort: "Находка", reproduction: "РС-1", germination: 86, weed: 2, year: 2025 },
    volumeKg: 2250,
    bagWeightKg: 25,
    minLotKg: 1000,
    supplierPrice: 175,
    markupPercent: 16,
    hasCertificate: false,
    status: "IN_STOCK",
    photoCount: 2,
    certificates: [],
    updatedDaysAgo: 5,
  },
  {
    id: "pos-7",
    supplierId: "sup-orehprom",
    cultureId: "cult-walnut",
    attributes: { sort: "Садовый", calibre: "30+", moisture: 9, kernel: 49, year: 2024 },
    volumeKg: 6500,
    bagWeightKg: 25,
    minLotKg: 500,
    supplierPrice: 100,
    markupPercent: 15,
    hasCertificate: false,
    status: "IN_STOCK",
    photoCount: 5,
    certificates: [],
    updatedDaysAgo: 4,
  },
];

/* ---------- Демо-фото (SVG data-URL, без внешних сервисов) ---------- */

/** Тёплая заглушка вместо фото поставщика: работает и без R2. */
export function demoPhoto(label: string, index: number): string {
  const text = `${label} · ${index}`.replace(/[<>&"]/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
    `<rect width="240" height="240" rx="28" fill="#F2EFE9"/>` +
    `<circle cx="120" cy="92" r="30" fill="#E6F0EA"/>` +
    `<path d="M120 122 v36 M120 126 c-12-16-30-20-42-12 7 14 25 19 42 12 Z ` +
    `M120 126 c12-16 30-20 42-12 -7 14 -25 19 -42 12 Z" ` +
    `stroke="#3E7C5A" stroke-width="6" fill="none" stroke-linecap="round"/>` +
    `<text x="120" y="204" font-family="system-ui, sans-serif" font-size="20" ` +
    `font-weight="600" fill="#7A756D" text-anchor="middle">${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
