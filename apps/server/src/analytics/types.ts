/**
 * Контракты модуля аналитики (этап 5): плоские строки БД
 * (Decimal→number, только нужные поля) и узкий интерфейс AnalyticsDb,
 * подменяемый в тестах памятью — как DealsDb в этапе 4.
 * Никаких JOIN-сюрпризов: каждая выборка — отдельный метод.
 */

import type { AnalyticsPeriod } from "@shared/types";

/** Сделка для метрик: культура позиции + экономика. */
export interface DealFactRow {
  id: string;
  number: string;
  leadId: string | null;
  positionId: string | null;
  cultureName: string | null;
  /** Атрибуты позиции (для названия в «Позициях»). */
  attributes: Record<string, string | number> | null;
  volumeKg: number;
  salePrice: number;
  margin: number;
  status: string;
  createdAt: Date;
}

/** Канал для вкладки «Каналы». */
export interface ChannelFactRow {
  id: string;
  name: string;
  type: string;
  region: string;
  city: string | null;
  subscribersCount: number | null;
  averageReach: number | null;
  /** Всего размещений (Listing). */
  listingsCount: number;
  /** Сумма publishedCount (сколько раз публиковали). */
  publications: number;
  lastPublishedAt: Date | null;
}

/** Позиция для вкладки «Позиции» и советника. */
export interface PositionFactRow {
  id: string;
  cultureId: string;
  cultureName: string;
  cultureType: "SEED" | "NUT";
  attributes: Record<string, string | number>;
  volumeKg: number;
  salePrice: number;
  status: string;
  createdAt: Date;
  lastPublishedAt: Date | null;
}

/** Лид для конверсии и аттрибуции каналов. */
export interface LeadFactRow {
  id: string;
  source: string;
  positionId: string | null;
  status: string;
  createdAt: Date;
}

/** Размещение для аттрибуции «лид → канал». */
export interface ListingFactRow {
  id: string;
  channelId: string;
  positionId: string;
  status: string;
  publishedAt: Date | null;
}

/** Узкий интерфейс БД аналитики. */
export interface AnalyticsDb {
  listDealFacts(period: AnalyticsPeriod): Promise<DealFactRow[]>;
  listChannelFacts(): Promise<ChannelFactRow[]>;
  listPositionFacts(): Promise<PositionFactRow[]>;
  listLeadFacts(period: AnalyticsPeriod): Promise<LeadFactRow[]>;
  listListingFacts(): Promise<ListingFactRow[]>;
}

/** Граница периода: неделя/месяц назад или null (всё время). */
export function periodStart(period: AnalyticsPeriod, now = Date.now()): Date | null {
  if (period === "week") return new Date(now - 7 * 86_400_000);
  if (period === "month") return new Date(now - 31 * 86_400_000);
  return null;
}
