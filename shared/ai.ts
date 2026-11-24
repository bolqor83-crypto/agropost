/**
 * AI-слой АгроПост (этап 3.0): контракты пяти use cases.
 * Модуль чистый — его импортируют сервер (Fastify), веб (Vite)
 * и Next-превью. Все ответы — строгий JSON, валидируется zod на сервере.
 *
 * WHITE-LABEL: в текстах никогда нет имени поставщика, его локации,
 * телефона и склада. Только «Краснодарский край» как регион отгрузки.
 */

import type { ListingPlatform } from "./listing-text";
import type { PriceSource } from "./types";

export type AiUseCase =
  | "listing"
  | "reply"
  | "advice"
  | "price_analysis"
  | "logistics";

/** Итог вызова: ok / retry (после повтора) / fallback (шаблон) / error. */
export type AiStatus = "ok" | "retry" | "fallback" | "error";

export type AiProviderName = "glm" | "openrouter" | "mock" | "fallback" | "cache";

export interface AiMeta {
  model: string;
  provider: AiProviderName;
  latencyMs: number;
  status: AiStatus;
  cached?: boolean;
  tokensIn?: number;
  tokensOut?: number;
}

/** Единая обёртка ответа /api/ai/*. */
export interface AiResponse<T> {
  ok: true;
  data: T;
  warnings: string[];
  meta: AiMeta;
}

/* ---------- 1. Listing ---------- */

export type ListingAccent = "price" | "quality" | "volume";

export interface AiListingInput {
  positionId: string;
  platform: ListingPlatform;
  accent?: ListingAccent;
}

export interface AiListingData {
  /** 1–70 символов (лимит Авито). */
  title: string;
  /** 1–3000 символов. */
  body: string;
  /** 1–10 строк. */
  tags: string[];
  charCount: number;
}

/* ---------- 2. Reply ---------- */

export interface AiReplyMessage {
  role: "user" | "assistant" | "buyer" | "seller";
  text: string;
}

export interface AiUserStyle {
  tone?: string;
  examples?: string[];
}

export interface AiReplyInput {
  incomingMessage: string;
  positionId: string;
  history?: AiReplyMessage[];
  userStyle?: AiUserStyle;
}

export interface AiReplyData {
  /** 1–1000 символов. */
  reply: string;
  /** Какие факты из позиции вошли в ответ («цена», «всхожесть»…). */
  includes: string[];
}

/* ---------- 3. Advice ---------- */

export interface AiAdviceLead {
  id?: string;
  title: string;
  channel?: string;
  days?: number;
}

export interface AiAdviceListing {
  id?: string;
  title: string;
  channel?: string;
  daysAgo?: number;
}

export interface AiAdvicePosition {
  id?: string;
  title: string;
  volumeKg?: number;
  salePrice?: number;
}

export interface AiAdviceChannel {
  id?: string;
  name: string;
  city?: string | null;
  daysSince?: number | null;
}

/* Этап 5: лиды инбокса для контекста «Совет». */
export interface AiAdviceInboxLead {
  id?: string;
  name?: string | null;
  /** Интерес из сообщения («люцерна 2 класс») или позиция. */
  interest?: string | null;
  status: "NEW" | "IN_PROGRESS" | "ANSWERED" | "CLOSED" | "SPAM";
  /** Дней с создания. */
  days: number;
  /** Был ли хотя бы один исходящий ответ. */
  answered: boolean;
}

/* Этап 5: сделки для контекста «Совет». */
export interface AiAdviceDeal {
  id?: string;
  number: string;
  buyerName: string;
  status: "AWAITING_PAYMENT" | "PAID" | "SHIPPED" | string;
  /** Сумма к оплате, ₽. */
  amount: number;
  /** Дней в текущем статусе (по createdAt сделки). */
  days: number;
}

export interface AiAdviceContext {
  activeLeads: AiAdviceLead[];
  recentListings: AiAdviceListing[];
  staleListings: AiAdviceListing[];
  positionsInStock: AiAdvicePosition[];
  cooledDownChannels: AiAdviceChannel[];
  /* ---------- Этап 5: расширенный контент ---------- */
  /** Лиды инбокса: активные и зависшие (NEW/IN_PROGRESS, старше 3 дней без ответа). */
  inboxLeads?: AiAdviceInboxLead[];
  /** Активные сделки (AWAITING_PAYMENT, PAID, SHIPPED). */
  activeDeals?: AiAdviceDeal[];
  /** Сделки, зависшие в AWAITING_PAYMENT дольше 2 дней. */
  staleDeals?: AiAdviceDeal[];
  /** Позиции в наличии, по которым нет публикаций > 14 дней. */
  unpublishedPositions?: AiAdvicePosition[];
  /** Каналы, доступные к публикации сегодня (cooldown закончился или не начинался). */
  channelsInCooldown?: AiAdviceChannel[];
  /** Каналы без публикаций дольше 14 дней. */
  staleChannels?: AiAdviceChannel[];
  /** Новых лидов сегодня. */
  newLeadsToday?: number;
}

export interface AiAdviceInput {
  /** Если не передан — сервер соберёт контекст из БД. */
  context?: AiAdviceContext;
}

export interface AiAdviceAction {
  priority: "high" | "medium";
  action: string;
  reason: string;
  /** Deep link внутри приложения: /publish, /positions, /channels, /deals. */
  link: string;
}

export interface AiAdviceData {
  /** 0–3 действия (не перегружать). Пусто — «всё под контролем». */
  actions: AiAdviceAction[];
}

/* ---------- 4. Price analysis ---------- */

export interface AiMarketSample {
  price: number;
  source: PriceSource;
}

export interface AiMarketSnapshot {
  min: number | null;
  max: number | null;
  avg: number | null;
  sources: PriceSource[];
  samples: AiMarketSample[];
  count?: number;
}

export interface AiPriceAnalysisInput {
  positionId: string;
  /** Если не передан — сервер возьмёт агрегаты рынка по культуре. */
  market?: AiMarketSnapshot;
}

export type AiMarketPosition = "below" | "at" | "above";

export interface AiPriceAnalysisData {
  marketPosition: AiMarketPosition;
  ourPrice: number;
  marketAvg: number | null;
  /** ourPrice − marketAvg, ₽/кг. */
  delta: number | null;
  /** Одна строка: что делать с ценой. */
  recommendation: string;
}

/* ---------- 5. Logistics ---------- */

export interface AiShipment {
  fromRegion: string;
  fromCity: string;
  toRegion: string;
  toCity: string;
  weightKg: number;
  bagWeightKg: number;
  bagsCount: number;
  volumeM3: number;
}

export interface AiCarrier {
  name: string;
  price: number;
  days: number;
}

export interface AiLogisticsInput {
  shipment: AiShipment;
  availableCarriers: AiCarrier[];
}

export interface AiLogisticsOption {
  carrier: string;
  price: number;
  days: number;
  note: string;
}

export interface AiLogisticsData {
  /** 2–4 варианта, отсортированы по цене. */
  options: AiLogisticsOption[];
  /** Одна строка: какой вариант выбрать. */
  recommendation: string;
}
