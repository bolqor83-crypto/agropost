/**
 * Русские подписи для перечислений. Один источник и для веба, и для превью.
 */

import type {
  AccountPlatform,
  AccountStatus,
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
