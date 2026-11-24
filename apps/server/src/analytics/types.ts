/**
 * Контракты модуля аналитики (этап 5.1).
 *
 * Ключевое отличие от этапа 5: БД-слой возвращает АГРЕГАТЫ (SQL
 * groupBy/суммы на стороне базы), а не строки с тихими лимитами
 * (раньше: 500 лидов / 500 сделок / 1000 объявлений / 200 позиций —
 * итоги обрезались при росте базы). Ни один метод интерфейса не имеет
 * take-ограничений: итоги всегда по полному набору данных.
 *
 * Атрибуция лида каналу: lastChannelId/firstChannelId на Lead —
 * реальные переходы по deep link объявления (lst_…); лиды без
 * достоверного источника (в т.ч. старые pos_…-ссылки) НЕ атрибутируются.
 */

import type { AnalyticsPeriod } from "@shared/types";

/* ---------- Итоги сделок за период ---------- */

/** Закрытые сделки считаются по closedAt (дата закрытия, не создания). */
export interface DealsTotals {
  /** Создано за период (createdAt). */
  total: number;
  /** Закрыто за период (closedAt; «всё время» — все CLOSED). */
  closed: number;
  /** Активные из созданных за период. */
  active: number;
  /** Σ salePrice×volumeKg закрытых за период. */
  revenue: number;
  /** Σ margin закрытых за период. */
  margin: number;
}

export interface CultureAgg {
  name: string;
  margin: number;
  deals: number;
}

export interface ChannelAgg {
  channelId: string;
  leads: number;
}

export interface ChannelDealAgg {
  channelId: string;
  /** Сделки у лидов, чей последний источник — этот канал. */
  deals: number;
  /** Уникальные лиды канала, ставшие сделками. */
  convertedLeads: number;
  closedDeals: number;
  closedMargin: number;
}

export interface PositionDealAgg {
  positionId: string;
  dealsCount: number;
  /** Σ salePrice×volumeKg по CLOSED (всё время). */
  revenue: number;
  margin: number;
  /** Σ volumeKg по CLOSED — для средневзвешенной цены. */
  volumeKg: number;
}

/* ---------- Строки-факты ---------- */

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
  /** Сумма publishedCount. */
  publications: number;
  lastPublishedAt: Date | null;
}

/** Позиция для вкладки «Позиции». */
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
  /** Фактическое начало наличия; null — неизвестно (старые записи). */
  stockSince: Date | null;
}

/* ---------- Узкий интерфейс БД (агрегаты, без лимитов) ---------- */

export interface AnalyticsDb {
  dealsTotals(period: AnalyticsPeriod, now: number): Promise<DealsTotals>;
  topCultures(period: AnalyticsPeriod, limit: number, now: number): Promise<CultureAgg[]>;
  /** Лиды: создано за период + создано сегодня (по московскому дню). */
  leadsTotals(period: AnalyticsPeriod, now: number): Promise<{ total: number; today: number }>;
  /** Уникальные лиды, созданные за период и имеющие ≥1 сделку. */
  convertedLeadsCount(period: AnalyticsPeriod, now: number): Promise<number>;
  /** Лиды по lastChannelId за период (last-touch атрибуция). */
  topChannels(period: AnalyticsPeriod, limit: number, now: number): Promise<ChannelAgg[]>;
  /** Сделки по лидам, сгруппированные по lastChannelId (всё время). */
  channelDealStats(): Promise<ChannelDealAgg[]>;
  channelFacts(): Promise<ChannelFactRow[]>;
  positionFacts(): Promise<PositionFactRow[]>;
  positionDealStats(): Promise<Map<string, PositionDealAgg>>;
  /** positionId → последняя публикация (MAX publishedAt). */
  lastPublishedByPosition(): Promise<Map<string, Date>>;
}

/* Границы периодов (Europe/Moscow) — в shared/time.ts. */
