/**
 * Русские подписи для перечислений. Один источник и для веба, и для превью.
 */

import type {
  AccountPlatform,
  AccountStatus,
  AutomationLevel,
  ChannelType,
  CultureType,
  ListingStatus,
  MediaType,
  PositionStatus,
  ShippingMode,
  SupplierLocation,
  TaxMode,
} from "./types";

export const SUPPLIER_LOCATION_LABEL: Record<SupplierLocation, string> = {
  PAVLOVSKAYA: "Павловская",
  LENINGRADSKAYA: "ст. Ленинградская",
  TIHORETSK: "Тихорецк",
  OTHER: "другая локация",
};

/** Регион для текста объявления (white-label: только гео, без имени). */
export const SUPPLIER_LOCATION_REGION: Record<SupplierLocation, string> = {
  PAVLOVSKAYA: "Краснодарский край",
  LENINGRADSKAYA: "Краснодарский край",
  TIHORETSK: "Краснодарский край",
  OTHER: "регион уточняйте",
};

export const SHIPPING_MODE_LABEL: Record<ShippingMode, string> = {
  SELF_LOADS: "сам грузит в ТК",
  FROM_WAREHOUSE: "со склада",
  BOTH: "сам грузит и со склада",
};

export const CULTURE_TYPE_LABEL: Record<CultureType, string> = {
  SEED: "семена",
  NUT: "орех",
};

export const POSITION_STATUS_LABEL: Record<PositionStatus, string> = {
  IN_STOCK: "в наличии",
  ON_ORDER: "под заказ",
  OUT_OF_STOCK: "нет в наличии",
};

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  PHOTO: "фото",
  VIDEO: "видео",
};

export const TAX_MODE_LABEL: Record<TaxMode, string> = {
  IP: "ИП",
  SELF_EMPLOYED: "самозанятый",
};

/* ---------- Этап 2 ---------- */

export const CHANNEL_TYPE_LABEL: Record<ChannelType, string> = {
  TELEGRAM_CHAT: "TG-чат",
  TELEGRAM_CHANNEL: "TG-канал",
  AVITO: "Авито",
  AGROSERVER: "Агросервер",
  MAX: "MAX",
  YOULA: "Юла",
  OTHER: "другая площадка",
};

export const ACCOUNT_PLATFORM_LABEL: Record<AccountPlatform, string> = {
  TELEGRAM: "Telegram",
  AVITO: "Авито",
  MAX: "MAX",
  YOULA: "Юла",
  OTHER: "другая площадка",
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  ACTIVE: "активен",
  LIMITED: "ограничен",
  PAUSED: "на паузе",
  BLOCKED: "заблокирован",
};

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: "черновик",
  COPIED: "скопирован",
  PUBLISHED: "размещён",
};

/* ---------- Этап 2.5: способы подачи и профиль канала ---------- */

import type {
  AudienceType,
  ConfirmationStatus,
  SubmissionMethod,
} from "./types";

export const SUBMISSION_METHOD_LABEL: Record<SubmissionMethod, string> = {
  BOT: "бот-приёмщик",
  ADMIN_CONTACT: "админ-контакт",
  SITE_FORM: "форма сайта",
  CABINET: "личный кабинет",
  NONE: "не указан",
};

/* ЭТАП 9: уровень автоматизации канала (бейджи в мастере «Разместить»). */
export const AUTOMATION_LEVEL_LABEL: Record<AutomationLevel, string> = {
  AUTO: "Авто",
  SEMI: "Полуавто",
  MANUAL: "Ручной",
};

export const CONFIRMATION_STATUS_LABEL: Record<ConfirmationStatus, string> = {
  CONFIRMED: "проверен",
  REQUIRES_CHECK: "требует проверки",
};

export const AUDIENCE_TYPE_LABEL: Record<AudienceType, string> = {
  B2B: "агро / опт (B2B)",
  B2C: "частные покупатели (B2C)",
  REGIONAL: "локальная барахолка",
  GENERAL: "общая аудитория",
};

/* ---------- Этап 4: сделки, доставка, документы, рекламации ---------- */

import type {
  ClaimStatus,
  DealStatus,
  DealTaxMode,
  DeliveryMethod,
  DocumentType,
  ShipmentStatus,
} from "./types";

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  DRAFT: "черновик",
  AWAITING_PAYMENT: "ожидает оплаты",
  PAID: "оплачено",
  SHIPPED: "отгружено",
  DELIVERED: "доставлено",
  CLOSED: "закрыта",
  CANCELLED: "отменена",
};

export const DEAL_TAX_MODE_LABEL: Record<DealTaxMode, string> = {
  IP_6: "ИП, УСН 6% с доходов",
  SELF_EMPLOYED_4: "самозанятый, НПД 4%",
  SELF_EMPLOYED_6: "самозанятый, НПД 6%",
};

/** Короткая ставка для документов: «УСН 6%», «НПД 4%». */
export const DEAL_TAX_MODE_SHORT: Record<DealTaxMode, string> = {
  IP_6: "УСН 6%",
  SELF_EMPLOYED_4: "НПД 4%",
  SELF_EMPLOYED_6: "НПД 6%",
};

export const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = {
  PICKUP: "самовывоз",
  TK: "транспортная компания",
  FELLOW_TRAVELER: "попутный транспорт",
};

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: "ожидает забора",
  PICKED_UP: "забрано у поставщика",
  IN_TRANSIT: "в пути",
  DELIVERED: "доставлено покупателю",
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  INVOICE: "Счёт на оплату",
  CONTRACT: "Договор купли-продажи",
  TRANSPORT_NOTE: "Транспортная накладная",
  UPD: "УПД",
};

/** Префикс номера документа: СЧ-001, Д-001, ТН-001, УПД-001. */
export const DOCUMENT_TYPE_PREFIX: Record<DocumentType, string> = {
  INVOICE: "СЧ",
  CONTRACT: "Д",
  TRANSPORT_NOTE: "ТН",
  UPD: "УПД",
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  NEW: "новая",
  IN_REVIEW: "на рассмотрении",
  RESOLVED: "решена",
  REJECTED: "отклонена",
  FORWARDED_TO_SUPPLIER: "переадресована поставщику",
};
