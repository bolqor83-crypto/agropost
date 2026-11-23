/**
 * Общие типы АгроПост (этап 1): контракт API + домен.
 * Модуль чистый (без prisma/fastify/react) — его импортируют
 * apps/server (Fastify + Prisma), apps/web (Vite) и Next-превью.
 *
 * WHITE-LABEL: поля SupplierDTO никогда не попадают в тексты объявлений,
 * документы и ответы ИИ — только на внутренние экраны приложения.
 */

/* ---------- Перечисления (в Prisma — enum, здесь — union) ---------- */

export type SupplierLocation = "PAVLOVSKAYA" | "LENINGRADSKAYA" | "TIHORETSK" | "OTHER";
export type ShippingMode = "SELF_LOADS" | "FROM_WAREHOUSE" | "BOTH";
export type CultureType = "SEED" | "NUT";
export type PositionStatus = "IN_STOCK" | "ON_ORDER" | "OUT_OF_STOCK";
export type MediaType = "PHOTO" | "VIDEO";
export type TaxMode = "IP" | "SELF_EMPLOYED";

/* ---------- Гибкие атрибуты позиции (JSONB по шаблону культуры) ---------- */

export type AttributeType = "text" | "number" | "percent" | "year";
export type AttributeValue = string | number;

/** Поле схемы атрибутов шаблона культуры (хранится в attributesSchema). */
export interface AttributeField {
  key: string;
  label: string;
  type: AttributeType;
  unit?: string;
  required: boolean;
}

/** Плоский JSONB позиции: { germination: 92, sort: "Вега 87" }. */
export type AttributesMap = Record<string, AttributeValue>;

/* ---------- DTO (формат API) ---------- */

export interface SupplierDTO {
  id: string;
  name: string;
  phone: string;
  location: SupplierLocation;
  shippingMode: ShippingMode;
  notes: string | null;
  positionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CultureTemplateDTO {
  id: string;
  name: string;
  type: CultureType;
  attributesSchema: AttributeField[];
  positionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaDTO {
  id: string;
  positionId: string;
  type: MediaType;
  url: string;
  watermark: boolean;
  createdAt: string;
}

export interface CertificateDTO {
  id: string;
  positionId: string;
  name: string;
  fileUrl: string;
  issuedAt: string | null;
  createdAt: string;
}

export interface PositionDTO {
  id: string;
  supplierId: string;
  cultureId: string;
  attributes: AttributesMap;
  /** Остаток, кг. Обновляется вручную. */
  volumeKg: number;
  bagWeightKg: number;
  minLotKg: number;
  /** Цена поставщика, ₽/кг (в БД Decimal). */
  supplierPrice: number;
  markupPercent: number;
  /** Вычисляется: supplierPrice × (1 + markupPercent / 100). */
  salePrice: number;
  hasCertificate: boolean;
  status: PositionStatus;
  media: MediaDTO[];
  certificates: CertificateDTO[];
  /** Только внутренние экраны — в объявления не попадает. */
  supplier: SupplierDTO;
  culture: CultureTemplateDTO;
  createdAt: string;
  updatedAt: string;
}

export interface UserDTO {
  id: string;
  name: string;
  inn: string | null;
  taxMode: TaxMode;
  taxRate: number;
}

/* ---------- Тела запросов ---------- */

export interface SupplierInput {
  name: string;
  phone: string;
  location: SupplierLocation;
  shippingMode: ShippingMode;
  notes?: string;
}

export interface CultureInput {
  name: string;
  type: CultureType;
  attributesSchema: AttributeField[];
}

export interface PositionInput {
  supplierId: string;
  cultureId: string;
  attributes: AttributesMap;
  volumeKg: number;
  bagWeightKg: number;
  supplierPrice: number;
  markupPercent: number;
  minLotKg: number;
  hasCertificate?: boolean;
  status?: PositionStatus;
}

/** Ответ POST /api/positions/:id/media. */
export interface MediaUploadDTO {
  media: MediaDTO;
  /** Presigned PUT-ссылка в R2, живёт 15 минут. */
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
}
