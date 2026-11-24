/**
 * Типы данных документов (этап 4). Документы white-label:
 * продавец — пользователь, поставщик НЕ упоминается.
 */

import type { DealTaxMode, DeliveryMethod, DocumentType } from "@shared/types";

/** Реквизиты продавца из профиля (User). */
export interface SellerRequisites {
  name: string;
  inn: string | null;
  ogrnip: string | null;
  address: string | null;
  bank: string | null;
  bik: string | null;
  account: string | null;
  taxMode: DealTaxMode;
}

export interface DocumentBuyer {
  name: string;
  phone: string;
  region: string;
  inn: string | null;
}

export interface DocumentGoods {
  /** Наименование: культура + сорт (positionName), без поставщика. */
  name: string;
  volumeKg: number;
  /** Вес мешка — для строки «N мешков», если известен. */
  bagWeightKg: number | null;
  salePrice: number;
  supplierPrice: number;
}

export interface DocumentDelivery {
  method: DeliveryMethod;
  carrierName: string | null;
  fromCity: string | null;
  toCity: string | null;
  cost: number | null;
  trackingNumber: string | null;
}

export interface DocumentData {
  type: DocumentType;
  /** «СЧ-001», «Д-001», «ТН-001», «УПД-001». */
  number: string;
  generatedAt: Date;
  /** Номер сделки «СД-0001» — для ссылок в договоре/УПД. */
  dealNumber: string;
  seller: SellerRequisites;
  buyer: DocumentBuyer;
  goods: DocumentGoods;
  /** Отгрузка — null, пока товар не отгружен. */
  delivery: DocumentDelivery | null;
  totals: {
    volumeKg: number;
    revenue: number;
    taxAmount: number;
    margin: number;
  };
}

/**
 * Проверка реквизитов продавца перед генерацией.
 * Для счёта и УПД нужны банковские реквизиты (куда платить),
 * для договора и ТН — только базовые поля.
 */
export function assertSellerRequisites(seller: SellerRequisites): void {
  const missing: string[] = [];
  if (!seller.name.trim()) missing.push("ФИО/название");
  if (!seller.inn?.trim()) missing.push("ИНН");
  if (!seller.address?.trim()) missing.push("адрес");
  if (seller.taxMode === "IP_6" && !seller.ogrnip?.trim()) {
    missing.push("ОГРНИП (для ИП)");
  }

  if (missing.length > 0) {
    throw new DocumentsError(
      "REQUISITES_MISSING",
      `Заполните реквизиты в профиле: ${missing.join(", ")}`,
    );
  }
}

/** Банковские реквизиты обязательны для счёта и УПД. */
export function assertBankRequisites(seller: SellerRequisites): void {
  assertSellerRequisites(seller);
  const missing: string[] = [];
  if (!seller.account?.trim()) missing.push("расчётный счёт");
  if (!seller.bank?.trim()) missing.push("банк");
  if (!seller.bik?.trim()) missing.push("БИК");
  if (missing.length > 0) {
    throw new DocumentsError(
      "REQUISITES_MISSING",
      `Заполните банковские реквизиты в профиле: ${missing.join(", ")}`,
    );
  }
}

/** Ошибка документа → роут переводит в 400 с кодом REQUISITES_MISSING. */
export class DocumentsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DocumentsError";
  }
}
