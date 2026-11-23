/**
 * Русские подписи для перечислений. Один источник и для веба, и для превью.
 */

import type {
  CultureType,
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
