/**
 * Общие типы АгроПост (этап 1): контракт API + домен.
 * Модуль чистый (без prisma/fastify/react) — его импортируют
 * apps/server (Fastify + Prisma), apps/web (Vite) и Next-превью.
 *
 * WHITE-LABEL: поля SupplierDTO никогда не попадают в тексты объявлений,
 * документы и ответы ИИ — только на внутренние экраны приложения.
 */

/* ---------- Перечисления (в Prisma — enum, здесь — union) ---------- */

import type { AiMeta } from "./ai";

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

/* ---------- Этап 2: каналы, аккаунты, размещения ---------- */

export type ChannelType =
  | "TELEGRAM_CHAT"
  | "TELEGRAM_CHANNEL"
  | "AVITO"
  | "AGROSERVER"
  | "MAX"
  | "YOULA"
  | "OTHER";

/** Словарь тегов каналов — константа CHANNEL_TAGS в shared/channels.ts. */
export type ChannelTag = "SEEDS" | "NUT" | "LIVESTOCK" | "WHOLESALE" | "GENERAL";

export type AccountPlatform = "TELEGRAM" | "AVITO" | "MAX" | "YOULA" | "OTHER";
export type AccountStatus = "ACTIVE" | "LIMITED" | "PAUSED" | "BLOCKED";
export type ListingStatus = "DRAFT" | "COPIED" | "PUBLISHED";

/* Этап 2.5: способы подачи и профиль канала (исследование рынка). */

/** Как подавать объявление в канал. */
export type SubmissionMethod =
  | "BOT"
  | "ADMIN_CONTACT"
  | "SITE_FORM"
  | "CABINET"
  | "NONE";

/** Честный статус канала: проверен / требует проверки. */
export type ConfirmationStatus = "CONFIRMED" | "REQUIRES_CHECK";

/** Профиль аудитории канала. */
export type AudienceType = "B2B" | "B2C" | "REGIONAL" | "GENERAL";

export interface ChannelDTO {
  id: string;
  name: string;
  type: ChannelType;
  /** Deep link: t.me/…, URL подачи объявления, URL чата. */
  url: string;
  region: string;
  /** Город для гео-ротации (null — канал на весь регион, без ротации). */
  city: string | null;
  tags: ChannelTag[];
  subscribersCount: number | null;
  averageReach: number | null;
  lastActivityAt: string | null;
  /** Аккаунт, которым размещаем (null — вручную, без аккаунта). */
  accountId: string | null;
  notes: string | null;
  /* Этап 2.5: способы подачи и профиль канала (исследование рынка). */
  /** Как подавать объявление (бот / админ-контакт / форма сайта / кабинет). */
  submissionMethod: SubmissionMethod;
  /** Бот-приёмщик, например @Taganrog_Predlozhka_bot — для BOT. */
  submissionBotUsername: string | null;
  /** Контакт администратора, например @admn_013 — для ADMIN_CONTACT. */
  adminContact: string | null;
  /** Лимит подач, например «2 раза в день». */
  frequencyLimit: string | null;
  /** Честный статус канала: проверен / требует проверки. */
  confirmationStatus: ConfirmationStatus;
  /** Зеркало канала на другой площадке (TG↔MAX) — id канала. */
  mirrorOf: string | null;
  /** Профиль аудитории: агро-чат (B2B) или барахолка (REGIONAL/GENERAL). */
  audienceType: AudienceType | null;
  listingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDTO {
  id: string;
  platform: AccountPlatform;
  phone: string | null;
  status: AccountStatus;
  dailyLimit: number;
  /** Использовано сегодня (сбрасывается при смене дня, растёт при «размещено»). */
  usedToday: number;
  /** День, к которому относится счётчик (ISO). */
  usedDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingDTO {
  id: string;
  positionId: string;
  channelId: string;
  /** Черновик текста (white-label: поставщик не упоминается). */
  text: string;
  status: ListingStatus;
  publishedAt: string | null;
  /** Сколько раз отмечали «размещено» (растёт при повторной отметке). */
  publishedCount: number;
  /** Ссылка на сообщение (этап 3.2: постинг через своего бота). */
  url: string | null;
  channel: ChannelDTO;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Тела запросов этапа 2 ---------- */

export interface ChannelInput {
  name: string;
  type: ChannelType;
  url: string;
  region: string;
  /** Город для гео-ротации; null/пусто — канал на весь регион. */
  city?: string | null;
  tags: ChannelTag[];
  subscribersCount?: number | null;
  averageReach?: number | null;
  lastActivityAt?: string | null;
  accountId?: string | null;
  notes?: string;
  /* Этап 2.5: способы подачи (все опциональны). */
  submissionMethod?: SubmissionMethod;
  submissionBotUsername?: string | null;
  adminContact?: string | null;
  frequencyLimit?: string | null;
  confirmationStatus?: ConfirmationStatus;
  /** Id канала-зеркала (TG↔MAX). */
  mirrorOf?: string | null;
  audienceType?: AudienceType | null;
}

export interface AccountInput {
  platform: AccountPlatform;
  phone?: string | null;
  status?: AccountStatus;
  dailyLimit?: number;
  notes?: string;
}

export interface ListingCreateInput {
  positionId: string;
  channelId: string;
  /** Свой текст черновика; по умолчанию — серверный шаблон (white-label). */
  text?: string;
}

export interface ListingUpdateInput {
  text?: string;
  status?: ListingStatus;
}

/* ---------- Этап 2.1: гео-ротация ---------- */

/** Город в виджете ротации: когда здесь размещали последний раз. */
export interface RotationCityDTO {
  city: string;
  lastPublishedAt: string | null;
  /** Целых дней с последнего размещения; null — никогда. */
  daysSince: number | null;
  /** Не в cooldown — можно размещать сегодня. */
  available: boolean;
  /** Сколько дней осталось ждать (0 — доступен). */
  cooldownDaysLeft: number;
}

/** Ротация по региону: города и рекомендация на сегодня. */
export interface RotationDTO {
  region: string;
  cities: RotationCityDTO[];
  /** Город, где размещать сегодня (null — всё в cooldown). */
  recommendedCity: string | null;
}

/** Канал в подборке + состояние ротации (cooldown после публикации). */
export interface SuggestedChannelDTO extends ChannelDTO {
  cooldown: boolean;
  daysSince: number | null;
}

/** Ответ POST /api/positions/:id/suggest-channels. */
export interface SuggestChannelsDTO {
  positionId: string;
  channels: SuggestedChannelDTO[];
  /** Гео-ротация — только если в одном регионе ≥2 городов. */
  rotation?: RotationDTO;
}

/* ---------- Этап 2.5: рынок (парсер цен конкурентов) ---------- */

/** Источник собранной цены. */
export type PriceSource = "AGROSERVER" | "TELEGRAM";

/** Одна собранная цена конкурента (обезличенно, без телефонов — 152-ФЗ). */
export interface MarketSampleDTO {
  id: string;
  source: PriceSource;
  /** Цена, ₽ (за единицу unit). */
  price: number;
  /** Единица: «₽/кг». */
  unit: string;
  region: string | null;
  /** Название продавца-компании или @username (без ФИО). */
  sellerName: string | null;
  link: string;
  fetchedAt: string;
}

/** Агрегаты рынка по культуре позиции (GET /api/positions/:id/market). */
export interface MarketDTO {
  positionId: string;
  /** Культура позиции («Люцерна») и запрос парсера («люцерна»). */
  cultureName: string;
  queries: string[];
  /** Сколько цен в окне (MARKET_WINDOW_DAYS). */
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  /** Источники, из которых есть данные. */
  sources: PriceSource[];
  /** Последняя дата сбора (ISO). */
  lastFetchedAt: string | null;
  /** Последние 5 сэмплов. */
  samples: MarketSampleDTO[];
}

/** Ответ POST /api/parser/run (прокси на Python-сервис парсинга). */
export interface ParserRunDTO {
  ok: boolean;
  runId: string;
  /** Пояснение, если сервис недоступен или адаптеры отключены. */
  note?: string;
  [key: string]: unknown;
}

/* ---------- Этап 3.2: инбокс (лиды) и Telegram-бот ---------- */

export type LeadSource = "TELEGRAM_BOT" | "TELEGRAM_CHAT" | "AVITO" | "MANUAL";
export type LeadStatus = "NEW" | "IN_PROGRESS" | "ANSWERED" | "CLOSED" | "SPAM";
export type MessageDirection = "INBOUND" | "OUTBOUND";

export interface LeadMessageDTO {
  id: string;
  direction: MessageDirection;
  text: string;
  sentAt: string;
  aiGenerated: boolean;
  aiCallId: string | null;
}

/** Пункт списка инбокса: лид + последнее сообщение для превью. */
export interface LeadDTO {
  id: string;
  source: LeadSource;
  externalId: string | null;
  externalUsername: string | null;
  name: string | null;
  phone: string | null;
  region: string | null;
  interest: string | null;
  status: LeadStatus;
  positionId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage: { text: string; direction: MessageDirection; sentAt: string } | null;
}

export interface LeadDetailDTO extends LeadDTO {
  messages: LeadMessageDTO[];
}

/** Ответ «Черновик AI» в карточке лида. */
export interface LeadDraftDTO {
  ok: true;
  draft: string;
  includes: string[];
  warnings: string[];
  meta: AiMeta;
}

/** GET /api/telegram/status. */
export interface TelegramStatusDTO {
  ok: true;
  configured: boolean;
  bot: { username: string; url: string } | null;
  webhook: { url: string; pendingUpdateCount: number; lastErrorMessage?: string } | null;
  newLeads: number;
  leadsToday: number;
  channels: { channelId: string; name: string; url: string }[];
}

/** Ответ POST /api/telegram/publish. */
export interface TelegramPublishDTO {
  ok: true;
  listingId: string;
  url: string | null;
  publishedAt: string;
  warning?: string;
}

/** PATCH /api/leads/:id — статус, заметка, интерес, позиция. */
export interface LeadUpdateInput {
  status?: LeadStatus;
  notes?: string;
  interest?: string;
  /** null снимает привязку к позиции. */
  positionId?: string | null;
}

/** POST /api/leads/:id/reply: черновик AI (useAi) или готовый текст. */
export interface LeadReplyInput {
  useAi?: boolean;
  text?: string;
  /** id AiCall черновика, если отправили его как есть/с правками. */
  aiCallId?: string;
}

/* ---------- Этап 4: сделки, доставка, документы, рекламации ---------- */

export type DealStatus =
  | "DRAFT"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "CLOSED"
  | "CANCELLED";

/** Налоговый режим сделки: ИП 6% / самозанятый 4% / самозанятый 6%. */
export type DealTaxMode = "IP_6" | "SELF_EMPLOYED_4" | "SELF_EMPLOYED_6";

export type DeliveryMethod = "PICKUP" | "TK" | "FELLOW_TRAVELER";
export type DocumentType = "INVOICE" | "CONTRACT" | "TRANSPORT_NOTE" | "UPD";
export type ShipmentStatus = "PENDING" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED";
export type ClaimStatus =
  | "NEW"
  | "IN_REVIEW"
  | "RESOLVED"
  | "REJECTED"
  | "FORWARDED_TO_SUPPLIER";

/** Бизнес-правило: доставку всегда оплачивает покупатель. */
export type DeliveryPaidBy = "BUYER";

/** GET/PATCH /api/user/profile — реквизиты продавца для документов. */
export interface UserProfileDTO extends UserDTO {
  ogrnip: string | null;
  address: string | null;
  bank: string | null;
  bik: string | null;
  account: string | null;
  /** Налоговый режим по умолчанию для новых сделок. */
  dealTaxMode: DealTaxMode;
}

export interface UserProfileInput {
  name?: string;
  inn?: string | null;
  ogrnip?: string | null;
  address?: string | null;
  bank?: string | null;
  bik?: string | null;
  account?: string | null;
  /** Смена режима по умолчанию (обновляет и taxMode/taxRate пользователя). */
  dealTaxMode?: DealTaxMode;
}

/** Транспортная компания из справочника. */
export interface CarrierDTO {
  id: string;
  name: string;
  city: string;
  /** Забирает груз со склада поставщика. */
  pickupAvailable: boolean;
  /** В радиусе 50 км от Павловской — приоритет в калькуляторе. */
  isLocal: boolean;
  notes: string | null;
  createdAt: string;
}

export interface CarrierInput {
  name: string;
  city: string;
  pickupAvailable?: boolean;
  isLocal?: boolean;
  notes?: string;
}

/** Сделка: карточка списка (экономика уже посчитана на сервере). */
export interface DealDTO {
  id: string;
  /** «СД-0001». */
  number: string;
  leadId: string | null;
  positionId: string | null;
  /** Название позиции (культура + ключевые атрибуты) для списков. */
  positionName: string | null;
  buyerName: string;
  buyerPhone: string;
  buyerRegion: string;
  buyerInn: string | null;
  /** Объём, кг. */
  volumeKg: number;
  /** Цена продажи, ₽/кг. */
  salePrice: number;
  /** Закуп поставщика (фиксируется на момент сделки), ₽/кг. */
  supplierPrice: number;
  taxMode: DealTaxMode;
  taxAmount: number;
  margin: number;
  /** Выручка = salePrice × volumeKg. */
  revenue: number;
  deliveryMethod: DeliveryMethod;
  /** Стоимость доставки (платит покупатель, в маржу не входит). */
  deliveryCost: number | null;
  deliveryPaidBy: DeliveryPaidBy;
  status: DealStatus;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/deals/:id — карточка со связями. */
export interface DealDetailDTO extends DealDTO {
  shipment: ShipmentDTO | null;
  documents: DocumentDTO[];
  claims: ClaimDTO[];
}

export interface ShipmentDTO {
  id: string;
  dealId: string;
  carrierId: string | null;
  carrierName: string | null;
  method: DeliveryMethod;
  fromCity: string;
  toCity: string;
  cost: number;
  days: number | null;
  trackingNumber: string | null;
  status: ShipmentStatus;
  createdAt: string;
}

/** fileUrl (base64 data-URL) отдаётся только при генерации/скачивании. */
export interface DocumentDTO {
  id: string;
  dealId: string;
  type: DocumentType;
  /** «СЧ-001», «Д-001», «ТН-001», «УПД-001». */
  number: string;
  fileUrl?: string;
  generatedAt: string;
  createdAt: string;
}

export interface ClaimDTO {
  id: string;
  dealId: string;
  description: string;
  /** Фото — когда подключим R2. */
  photos: string[];
  status: ClaimStatus;
  resolution: string | null;
  forwardedToSupplier: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DealCreateInput {
  leadId?: string;
  positionId?: string;
  /** Не указаны — берутся из лида. */
  buyerName?: string;
  buyerPhone?: string;
  buyerRegion?: string;
  buyerInn?: string | null;
  /** Объём, кг. */
  volumeKg: number;
  /** Цена продажи, ₽/кг. Не указана — возьмём цену позиции. */
  salePrice?: number;
  /** Закуп, ₽/кг. Не указан — возьмём закуп позиции на момент сделки. */
  supplierPrice?: number;
  taxMode?: DealTaxMode;
  deliveryMethod?: DeliveryMethod;
  deliveryCost?: number | null;
  notes?: string;
}

export interface DealUpdateInput {
  buyerName?: string;
  buyerPhone?: string;
  buyerRegion?: string;
  buyerInn?: string | null;
  volumeKg?: number;
  salePrice?: number;
  supplierPrice?: number;
  taxMode?: DealTaxMode;
  deliveryMethod?: DeliveryMethod;
  deliveryCost?: number | null;
  notes?: string | null;
  /** Разрешены только переходы статусного графа (shared/deals). */
  status?: DealStatus;
}

/** POST /api/deals/:id/ship. */
export interface DealShipInput {
  method?: DeliveryMethod;
  carrierId?: string | null;
  /** ТК не из справочника — имя вручную. */
  carrierName?: string | null;
  fromCity: string;
  toCity: string;
  cost: number;
  days?: number | null;
  trackingNumber?: string | null;
}

export interface ClaimCreateInput {
  dealId: string;
  description: string;
}

export interface ClaimUpdateInput {
  status?: ClaimStatus;
  resolution?: string;
  /** true — переадресовать поставщику (ставит и статус). */
  forwardedToSupplier?: boolean;
}

/** Вариант калькулятора доставки. */
export interface DeliveryOptionDTO {
  carrierId: string | null;
  carrier: string;
  cost: number;
  days: number;
  isLocal: boolean;
  pickupAvailable: boolean;
  note: string;
}

/** Ответ POST /api/deals/calculate-delivery. */
export interface DeliveryCalculateDTO {
  ok: true;
  fromCity: string;
  toCity: string;
  volumeKg: number;
  options: DeliveryOptionDTO[];
  /** Индекс рекомендованного варианта в options. */
  recommendedIndex: number;
  meta: {
    /** true — оценки от AI (план логистики), false — детерминированная формула. */
    ai: boolean;
    model: string | null;
    note: string;
  };
}
