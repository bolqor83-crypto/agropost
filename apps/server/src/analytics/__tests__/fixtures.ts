/**
 * Памятка фейковой БД аналитики (как MemoryDealsDb в этапе 4):
 * те же строки DealFactRow/ChannelFactRow/…, период фильтруется
 * по createdAt — как в Prisma-реализации.
 */

import type { AnalyticsPeriod } from "@shared/types";
import type {
  AnalyticsDb,
  ChannelFactRow,
  DealFactRow,
  LeadFactRow,
  ListingFactRow,
  PositionFactRow,
} from "../types.js";
import { periodStart } from "../types.js";

export class MemoryAnalyticsDb implements AnalyticsDb {
  deals: DealFactRow[] = [];
  channels: ChannelFactRow[] = [];
  positions: PositionFactRow[] = [];
  leads: LeadFactRow[] = [];
  listings: ListingFactRow[] = [];

  listDealFacts(period: AnalyticsPeriod): Promise<DealFactRow[]> {
    const since = periodStart(period);
    return Promise.resolve(
      this.deals.filter((d) => (since ? d.createdAt >= since : true)),
    );
  }

  listChannelFacts(): Promise<ChannelFactRow[]> {
    return Promise.resolve([...this.channels]);
  }

  listPositionFacts(): Promise<PositionFactRow[]> {
    return Promise.resolve([...this.positions]);
  }

  listLeadFacts(period: AnalyticsPeriod): Promise<LeadFactRow[]> {
    const since = periodStart(period);
    return Promise.resolve(this.leads.filter((l) => (since ? l.createdAt >= since : true)));
  }

  listListingFacts(): Promise<ListingFactRow[]> {
    return Promise.resolve([...this.listings]);
  }
}

const DAY = 86_400_000;

/** Фабрика даты: n дней назад от now. */
export function daysAgo(n: number, now = Date.now()): Date {
  return new Date(now - n * DAY);
}

export function dealFact(over: Partial<DealFactRow> = {}): DealFactRow {
  return {
    id: "deal-x",
    number: "СД-0001",
    leadId: null,
    positionId: null,
    cultureName: null,
    attributes: null,
    volumeKg: 1000,
    salePrice: 100,
    margin: 14000,
    status: "CLOSED",
    createdAt: daysAgo(0),
    ...over,
  };
}

export function leadFact(over: Partial<LeadFactRow> = {}): LeadFactRow {
  return {
    id: "lead-x",
    source: "TELEGRAM_BOT",
    positionId: null,
    status: "NEW",
    createdAt: daysAgo(0),
    ...over,
  };
}

export function channelFact(over: Partial<ChannelFactRow> = {}): ChannelFactRow {
  return {
    id: "ch-x",
    name: "AgroMarket",
    type: "TELEGRAM_CHANNEL",
    region: "Краснодарский край",
    city: "Краснодар",
    subscribersCount: 5000,
    averageReach: 1200,
    listingsCount: 2,
    publications: 3,
    lastPublishedAt: daysAgo(5),
    ...over,
  };
}

export function positionFact(over: Partial<PositionFactRow> = {}): PositionFactRow {
  return {
    id: "pos-x",
    cultureId: "culture-1",
    cultureName: "Люцерна",
    cultureType: "SEED",
    attributes: { sort: "Вега 87" },
    volumeKg: 20000,
    salePrice: 100,
    status: "IN_STOCK",
    createdAt: daysAgo(10),
    lastPublishedAt: null,
    ...over,
  };
}
