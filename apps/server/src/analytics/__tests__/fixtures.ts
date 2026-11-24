/**
 * Памятка фейковой БД аналитики (этап 5.1): хранит строки (сделки с
 * closedAt, лиды с атрибутацией, позиции с stockSince), а интерфейс
 * AnalyticsDb реализует АГРЕГАТАМИ — в точности как SQL-версия:
 * закрытые по closedAt, конверсия по уникальным лидам, средневзвешенная
 * цена, московский «сегодня», last-touch атрибуция по lastChannelId.
 */

import type { AnalyticsPeriod } from "@shared/types";
import { periodStartDate, todayStartMoscowDate } from "@shared/time";
import type {
  AnalyticsDb,
  ChannelAgg,
  ChannelDealAgg,
  ChannelFactRow,
  CultureAgg,
  DealsTotals,
  PositionDealAgg,
  PositionFactRow,
} from "../types.js";

export interface DealSeed {
  id: string;
  number: string;
  leadId: string | null;
  positionId: string | null;
  cultureName: string | null;
  volumeKg: number;
  salePrice: number;
  margin: number;
  status: string;
  createdAt: Date;
  /* Этап 5.1: дата закрытия (null — старые закрытые, дата неизвестна). */
  closedAt: Date | null;
}

export interface LeadSeed {
  id: string;
  source: string;
  positionId: string | null;
  status: string;
  createdAt: Date;
  /* Этап 5.1: достоверная атрибуция (lst_-deep link). */
  firstChannelId?: string | null;
  lastChannelId?: string | null;
}

const DAY = 86_400_000;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const ACTIVE_STATUSES = ["DRAFT", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED"];

export class MemoryAnalyticsDb implements AnalyticsDb {
  deals: DealSeed[] = [];
  channels: (ChannelFactRow & { id: string })[] = [];
  positions: PositionFactRow[] = [];
  leads: LeadSeed[] = [];

  /* ---------- Периоды (как в SQL-версии) ---------- */

  private createdIn(period: AnalyticsPeriod, now: number): Set<string> {
    const since = periodStartDate(period, now);
    return new Set(
      this.deals.filter((d) => (since ? d.createdAt >= since : true)).map((d) => d.id),
    );
  }

  /** Закрытые за период: по closedAt; «всё время» — все CLOSED (вкл. legacy null). */
  private closedIn(period: AnalyticsPeriod, now: number): Set<string> {
    const since = periodStartDate(period, now);
    return new Set(
      this.deals
        .filter((d) => {
          if (d.status !== "CLOSED") return false;
          if (!since) return true; /* всё время */
          return d.closedAt !== null && d.closedAt >= since;
        })
        .map((d) => d.id),
    );
  }

  async dealsTotals(period: AnalyticsPeriod, now: number): Promise<DealsTotals> {
    const created = this.createdIn(period, now);
    const closed = this.closedIn(period, now);
    const closedDeals = this.deals.filter((d) => closed.has(d.id));
    const createdDeals = this.deals.filter((d) => created.has(d.id));
    return {
      total: createdDeals.length,
      closed: closedDeals.length,
      active: createdDeals.filter((d) => ACTIVE_STATUSES.includes(d.status)).length,
      revenue: round2(closedDeals.reduce((s, d) => s + d.salePrice * d.volumeKg, 0)),
      margin: round2(closedDeals.reduce((s, d) => s + d.margin, 0)),
    };
  }

  async topCultures(period: AnalyticsPeriod, limit: number, now: number): Promise<CultureAgg[]> {
    const closed = this.closedIn(period, now);
    const byCulture = new Map<string, { margin: number; deals: number }>();
    for (const d of this.deals) {
      if (!closed.has(d.id)) continue;
      const name = d.cultureName ?? "Без позиции";
      const cell = byCulture.get(name) ?? { margin: 0, deals: 0 };
      cell.margin += d.margin;
      cell.deals += 1;
      byCulture.set(name, cell);
    }
    return [...byCulture.entries()]
      .sort((a, b) => b[1].margin - a[1].margin || b[1].deals - a[1].deals)
      .slice(0, limit)
      .map(([name, cell]) => ({ name, margin: round2(cell.margin), deals: cell.deals }));
  }

  async leadsTotals(period: AnalyticsPeriod, now: number) {
    const since = periodStartDate(period, now);
    const today = todayStartMoscowDate(now);
    return {
      total: this.leads.filter((l) => (since ? l.createdAt >= since : true)).length,
      today: this.leads.filter((l) => l.createdAt >= today).length,
    };
  }

  async convertedLeadsCount(period: AnalyticsPeriod, now: number): Promise<number> {
    const since = periodStartDate(period, now);
    const leadIds = new Set(
      this.leads.filter((l) => (since ? l.createdAt >= since : true)).map((l) => l.id),
    );
    const converted = new Set<string>();
    for (const d of this.deals) {
      if (d.leadId && leadIds.has(d.leadId)) converted.add(d.leadId);
    }
    return converted.size;
  }

  async topChannels(period: AnalyticsPeriod, limit: number, now: number): Promise<ChannelAgg[]> {
    const since = periodStartDate(period, now);
    const byChannel = new Map<string, number>();
    for (const l of this.leads) {
      if (!l.lastChannelId) continue;
      if (since && l.createdAt < since) continue;
      byChannel.set(l.lastChannelId, (byChannel.get(l.lastChannelId) ?? 0) + 1);
    }
    return [...byChannel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([channelId, leads]) => ({ channelId, leads }));
  }

  async channelDealStats(): Promise<ChannelDealAgg[]> {
    const leadsByChannel = new Map<string, Set<string>>();
    for (const l of this.leads) {
      if (!l.lastChannelId) continue;
      const set = leadsByChannel.get(l.lastChannelId) ?? new Set<string>();
      set.add(l.id);
      leadsByChannel.set(l.lastChannelId, set);
    }
    const dealsByChannel = new Map<string, { deals: number; converted: Set<string>; closed: number; closedMargin: number }>();
    for (const [channelId, leadIds] of leadsByChannel) {
      const cell = { deals: 0, converted: new Set<string>(), closed: 0, closedMargin: 0 };
      for (const d of this.deals) {
        if (!d.leadId || !leadIds.has(d.leadId)) continue;
        cell.deals += 1;
        cell.converted.add(d.leadId);
        if (d.status === "CLOSED") {
          cell.closed += 1;
          cell.closedMargin += d.margin;
        }
      }
      dealsByChannel.set(channelId, cell);
    }
    return [...dealsByChannel.entries()].map(([channelId, cell]) => ({
      channelId,
      deals: cell.deals,
      convertedLeads: cell.converted.size,
      closedDeals: cell.closed,
      closedMargin: round2(cell.closedMargin),
    }));
  }

  async channelFacts(): Promise<ChannelFactRow[]> {
    return [...this.channels];
  }

  async positionFacts(): Promise<PositionFactRow[]> {
    return [...this.positions];
  }

  async positionDealStats(): Promise<Map<string, PositionDealAgg>> {
    const byPosition = new Map<string, PositionDealAgg>();
    for (const d of this.deals) {
      if (!d.positionId) continue;
      const cell =
        byPosition.get(d.positionId) ??
        { positionId: d.positionId, dealsCount: 0, revenue: 0, margin: 0, volumeKg: 0 };
      cell.dealsCount += 1;
      if (d.status === "CLOSED") {
        cell.revenue += d.salePrice * d.volumeKg;
        cell.margin += d.margin;
        cell.volumeKg += d.volumeKg;
      }
      byPosition.set(d.positionId, cell);
    }
    for (const [id, cell] of byPosition) {
      byPosition.set(id, {
        ...cell,
        revenue: round2(cell.revenue),
        margin: round2(cell.margin),
        volumeKg: cell.volumeKg,
      });
    }
    return byPosition;
  }

  async lastPublishedByPosition(): Promise<Map<string, Date>> {
    /* В памяти — фикстура: заполняется тестами при необходимости. */
    return new Map(this.lastPublished ?? []);
  }

  lastPublished: [string, Date][] | null = null;
}

/** Фабрика даты: n дней назад от now. */
export function daysAgo(n: number, now = Date.now()): Date {
  return new Date(now - n * DAY);
}

/** Фабрика лидов с атрибуцией (этап 5.1). */
export function leadFact(over: Partial<LeadSeed> = {}): LeadSeed {
  return {
    id: "lead-x",
    source: "TELEGRAM_BOT",
    positionId: null,
    status: "NEW",
    createdAt: daysAgo(0),
    firstChannelId: null,
    lastChannelId: null,
    ...over,
  };
}

/** Фабрика сделок с closedAt (этап 5.1). */
export function dealFact(over: Partial<DealSeed> = {}): DealSeed {
  return {
    id: "deal-x",
    number: "СД-0001",
    leadId: null,
    positionId: null,
    cultureName: null,
    volumeKg: 1000,
    salePrice: 100,
    margin: 14000,
    status: "CLOSED",
    createdAt: daysAgo(0),
    closedAt: daysAgo(0),
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
    stockSince: daysAgo(10),
    ...over,
  };
}
