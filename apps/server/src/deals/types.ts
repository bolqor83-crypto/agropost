/**
 * Контракты модуля сделок (этап 4): строки БД (плоские, Decimal→number),
 * узкий интерфейс DealsDb (подменяется в тестах как в telegram-модуле)
 * и зависимости сервиса.
 */

import type { AiLogisticsInput, AiLogisticsData, AiMeta } from "@shared/ai";
import type {
  ClaimStatus,
  DealStatus,
  DealTaxMode,
  DeliveryMethod,
  DocumentType,
} from "@shared/types";
import type { SupplierLocation } from "@shared/types";

/* ---------- Строки (плоские отображения Prisma) ---------- */

export interface SellerRow {
  id: string;
  name: string;
  inn: string | null;
  ogrnip: string | null;
  address: string | null;
  bank: string | null;
  bik: string | null;
  account: string | null;
  /** Режим профиля (IP / SELF_EMPLOYED) + его ставка. */
  taxMode: "IP" | "SELF_EMPLOYED";
  taxRate: number;
}

export interface PositionRow {
  id: string;
  cultureId: string;
  cultureName: string;
  cultureType: "SEED" | "NUT";
  attributes: Record<string, string | number>;
  volumeKg: number;
  bagWeightKg: number;
  supplierPrice: number;
  salePrice: number;
  supplierLocation: SupplierLocation;
  /* Этап 5.1: данные поставщика для снимка сделки. */
  supplierName: string;
  supplierShippingMode: "SELF_LOADS" | "FROM_WAREHOUSE" | "BOTH";
}

export interface LeadRow {
  id: string;
  source: string;
  externalId: string | null;
  externalUsername: string | null;
  name: string | null;
  phone: string | null;
  region: string | null;
  positionId: string | null;
}

export interface DealRow {
  id: string;
  number: string;
  leadId: string | null;
  positionId: string | null;
  /** Связанная позиция (для названия товара и документов). */
  position: PositionRow | null;
  buyerName: string;
  buyerPhone: string;
  buyerRegion: string;
  buyerInn: string | null;
  volumeKg: number;
  salePrice: number;
  supplierPrice: number;
  taxMode: DealTaxMode;
  taxAmount: number;
  margin: number;
  deliveryMethod: DeliveryMethod;
  deliveryCost: number | null;
  status: DealStatus;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  /* Этап 5.1: дата закрытия (аналитика выручки по периодам). */
  closedAt: Date | null;
  /* Этап 5.1: снимок условий на момент создания — история не теряется
     при изменении/удалении позиции. Поля поставщика — white-label:
     только внутри приложения, в документы покупателю не идут. */
  itemName: string | null;
  itemCulture: string | null;
  itemAttributes: Record<string, string | number> | null;
  supplierName: string | null;
  supplierLocation: string | null;
  shippingMode: string | null;
  /** Доп. затраты на доставку до терминала, ₽ (вычитаются из маржи). */
  deliveryToTerminalCost: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentRow {
  id: string;
  dealId: string;
  carrierId: string | null;
  method: DeliveryMethod;
  carrierName: string | null;
  fromCity: string;
  toCity: string;
  cost: number;
  days: number | null;
  trackingNumber: string | null;
  status: "PENDING" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED";
  createdAt: Date;
}

export interface DocumentRow {
  id: string;
  dealId: string;
  type: DocumentType;
  number: string;
  fileUrl: string;
  generatedAt: Date;
  createdAt: Date;
}

export interface ClaimRow {
  id: string;
  dealId: string;
  description: string;
  photos: string[];
  status: ClaimStatus;
  resolution: string | null;
  forwardedToSupplier: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CarrierRow {
  id: string;
  name: string;
  city: string;
  pickupAvailable: boolean;
  isLocal: boolean;
  notes: string | null;
  createdAt: Date;
}

/* ---------- Фильтры ---------- */

export type DealPeriod = "all" | "week" | "month";
/** Псевдо-группы для UI: ACTIVE (DRAFT..DELIVERED) и FINISHED (CLOSED). */
export type DealListStatus = DealStatus | "ACTIVE" | "FINISHED";

export interface ListDealsFilter {
  status?: DealListStatus;
  q?: string;
  period?: DealPeriod;
}

/* ---------- Узкий интерфейс БД ---------- */

export interface DealsDb {
  findUser(): Promise<SellerRow | null>;
  findPosition(id: string): Promise<PositionRow | null>;
  findLead(id: string): Promise<LeadRow | null>;

  listDeals(filter: ListDealsFilter): Promise<DealRow[]>;
  countDeals(): Promise<number>;
  findDeal(id: string): Promise<DealRow | null>;
  createDeal(data: Omit<DealRow, "id" | "createdAt" | "updatedAt">): Promise<DealRow>;
  updateDeal(id: string, data: Partial<DealRow>): Promise<DealRow | null>;
  deleteDeal(id: string): Promise<boolean>;

  createShipment(data: Omit<ShipmentRow, "id" | "createdAt">): Promise<ShipmentRow>;
  updateShipmentByDeal(dealId: string, data: Partial<ShipmentRow>): Promise<ShipmentRow | null>;
  findShipmentByDeal(dealId: string): Promise<ShipmentRow | null>;

  countDocuments(type: DocumentType): Promise<number>;
  createDocument(data: Omit<DocumentRow, "id" | "createdAt">): Promise<DocumentRow>;
  listDocuments(dealId: string): Promise<DocumentRow[]>;
  findDocument(id: string): Promise<DocumentRow | null>;

  listClaims(filter: { dealId?: string; status?: ClaimStatus }): Promise<ClaimRow[]>;
  findClaim(id: string): Promise<ClaimRow | null>;
  createClaim(data: Omit<ClaimRow, "id" | "createdAt" | "updatedAt" | "photos" | "status" | "forwardedToSupplier" | "resolution">): Promise<ClaimRow>;
  updateClaim(id: string, data: Partial<ClaimRow>): Promise<ClaimRow | null>;

  listCarriers(): Promise<CarrierRow[]>;
  countCarriers(): Promise<number>;
  createCarrier(data: Omit<CarrierRow, "id" | "createdAt">): Promise<CarrierRow>;
}

/* ---------- Зависимости сервиса ---------- */

export interface DealsDeps {
  db: DealsDb;
  /** AI-план логистики (слой 3.0); подменяется в тестах. */
  planLogistics?: (
    input: AiLogisticsInput,
  ) => Promise<{ data: AiLogisticsData; warnings: string[]; meta: AiMeta }>;
}
