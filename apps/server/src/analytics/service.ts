/**
 * Сервис аналитики (этап 5): сводка, каналы, позиции, чек-лист.
 * Только факты и простые агрегаты — без графиков и прогнозов.
 * Выручка/маржа/средний чек считаются по ЗАКРЫТЫМ (CLOSED) сделкам
 * за период; конверсия — лиды, ставшие сделками.
 *
 * Аттрибуция лида каналу (в схеме нет FK): берём ПОСЛЕДНЮЮ публикацию
 * позиции, о которой спросил покупатель, и относим лида в тот канал.
 * Лиды без позиции не аттрибутируются — они видны в сводке целиком.
 */

import { positionName } from "@shared/attributes";
import { COOLDOWN_DAYS, daysSince } from "@shared/rotation";
import type {
  AnalyticsChannelRow,
  AnalyticsPeriod,
  AnalyticsPositionRow,
  AnalyticsSummaryDTO,
  AnalyticsTopChannel,
  AnalyticsTopCulture,
  ReadinessDTO,
  ReadinessItem,
} from "@shared/types";
import type {
  ChannelFactRow,
  DealFactRow,
  LeadFactRow,
  ListingFactRow,
  PositionFactRow,
} from "./types.js";

const DAY_MS = 86_400_000;
const CLOSED = "CLOSED";
const ACTIVE_STATUSES = ["DRAFT", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED"];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Лид → канал: последняя PUBLISHED-публикация его позиции. */
function attributeLeadsToChannels(
  leads: LeadFactRow[],
  listings: ListingFactRow[],
): Map<string, string> {
  /* Позиция → канал последней публикации. */
  const lastByPosition = new Map<string, { channelId: string; at: number }>();
  for (const l of listings) {
    if (l.status !== "PUBLISHED" || !l.publishedAt) continue;
    const at = l.publishedAt.getTime();
    const prev = lastByPosition.get(l.positionId);
    if (!prev || at > prev.at) lastByPosition.set(l.positionId, { channelId: l.channelId, at });
  }
  const byLead = new Map<string, string>();
  for (const lead of leads) {
    if (!lead.positionId) continue;
    const hit = lastByPosition.get(lead.positionId);
    if (hit) byLead.set(lead.id, hit.channelId);
  }
  return byLead;
}

export interface AnalyticsDeps {
  db: AnalyticsDepsDb;
}

/* Локальный алиас, чтобы не тянуть типы в сигнатуры. */
type AnalyticsDepsDb = {
  listDealFacts(period: AnalyticsPeriod): Promise<DealFactRow[]>;
  listChannelFacts(): Promise<ChannelFactRow[]>;
  listPositionFacts(): Promise<PositionFactRow[]>;
  listLeadFacts(period: AnalyticsPeriod): Promise<LeadFactRow[]>;
  listListingFacts(): Promise<ListingFactRow[]>;
};

/* ---------- 1. Сводка ---------- */

export async function buildSummary(
  period: AnalyticsPeriod,
  deps: AnalyticsDeps,
  now = Date.now(),
): Promise<AnalyticsSummaryDTO> {
  const [deals, leads, listings, channels] = await Promise.all([
    deps.db.listDealFacts(period),
    deps.db.listLeadFacts(period),
    deps.db.listListingFacts(),
    deps.db.listChannelFacts(),
  ]);

  const closed = deals.filter((d) => d.status === CLOSED);
  const revenue = round2(closed.reduce((sum, d) => sum + d.salePrice * d.volumeKg, 0));
  const margin = round2(closed.reduce((sum, d) => sum + d.margin, 0));
  const averageCheck = closed.length ? round2(revenue / closed.length) : null;

  const dealsTotal = deals.length;
  const dealsClosed = closed.length;
  const dealsActive = deals.filter((d) => ACTIVE_STATUSES.includes(d.status)).length;

  /* Топ-3 культуры по марже (закрытые сделки). */
  const byCulture = new Map<string, { margin: number; deals: number }>();
  for (const d of closed) {
    const name = d.cultureName ?? "Без позиции";
    const cell = byCulture.get(name) ?? { margin: 0, deals: 0 };
    cell.margin += d.margin;
    cell.deals += 1;
    byCulture.set(name, cell);
  }
  const topCultures: AnalyticsTopCulture[] = [...byCulture.entries()]
    .sort((a, b) => b[1].margin - a[1].margin)
    .slice(0, 3)
    .map(([name, cell]) => ({
      name,
      margin: round2(cell.margin),
      dealsCount: cell.deals,
    }));

  /* Конверсия: лиды за период → сделки с leadId за период. */
  const leadIds = new Set(leads.map((l) => l.id));
  const convertedDeals = deals.filter((d) => d.leadId && leadIds.has(d.leadId));
  const leadsConverted = convertedDeals.length;
  const conversion = leads.length ? Math.round((leadsConverted / leads.length) * 100) : null;

  /* Топ-3 канала по лидам (аттрибуция по позиции). */
  const attribution = attributeLeadsToChannels(leads, listings);
  const dealLeadChannel = new Map<string, string | null>();
  for (const d of convertedDeals) {
    if (!d.leadId) continue;
    dealLeadChannel.set(d.leadId, attribution.get(d.leadId) ?? null);
  }
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const byChannel = new Map<string, { leads: number; deals: number }>();
  for (const lead of leads) {
    const channelId = attribution.get(lead.id);
    if (!channelId) continue;
    const cell = byChannel.get(channelId) ?? { leads: 0, deals: 0 };
    cell.leads += 1;
    byChannel.set(channelId, cell);
  }
  for (const [, channelId] of dealLeadChannel) {
    if (!channelId) continue;
    const cell = byChannel.get(channelId);
    if (cell) cell.deals += 1;
  }
  const topChannels: AnalyticsTopChannel[] = [...byChannel.entries()]
    .sort((a, b) => b[1].leads - a[1].leads || b[1].deals - a[1].deals)
    .slice(0, 3)
    .map(([channelId, cell]) => ({
      name: channelName.get(channelId) ?? "Канал",
      leads: cell.leads,
      deals: cell.deals,
    }));

  /* Новые лиды за сегодня (вне периода — свежая цифра всегда). */
  const allLeads = period === "all" ? leads : await deps.db.listLeadFacts("all");
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const newLeadsToday = allLeads.filter((l) => l.createdAt.getTime() >= todayStart.getTime()).length;

  return {
    ok: true,
    period,
    revenue,
    margin,
    dealsTotal,
    dealsClosed,
    dealsActive,
    averageCheck,
    topCultures,
    topChannels,
    leadsTotal: leads.length,
    leadsConverted,
    conversion,
    newLeadsToday,
    lowData: dealsClosed < 3,
  };
}

/* ---------- 2. Каналы ---------- */

export type ChannelSort = "margin" | "leads";

export async function buildChannels(
  sort: ChannelSort,
  deps: AnalyticsDeps,
  now = Date.now(),
): Promise<AnalyticsChannelRow[]> {
  const [channels, leads, listings, deals] = await Promise.all([
    deps.db.listChannelFacts(),
    deps.db.listLeadFacts("all"),
    deps.db.listListingFacts(),
    deps.db.listDealFacts("all"),
  ]);

  const attribution = attributeLeadsToChannels(leads, listings);
  const leadIdsByChannel = new Map<string, Set<string>>();
  for (const lead of leads) {
    const channelId = attribution.get(lead.id);
    if (!channelId) continue;
    const set = leadIdsByChannel.get(channelId) ?? new Set<string>();
    set.add(lead.id);
    leadIdsByChannel.set(channelId, set);
  }

  const rows: AnalyticsChannelRow[] = channels.map((c) => {
    const channelLeadIds = leadIdsByChannel.get(c.id) ?? new Set<string>();
    const channelDeals = deals.filter((d) => d.leadId && channelLeadIds.has(d.leadId));
    const closedChannelDeals = channelDeals.filter((d) => d.status === CLOSED);
    const avgMargin = closedChannelDeals.length
      ? round2(closedChannelDeals.reduce((sum, d) => sum + d.margin, 0) / closedChannelDeals.length)
      : null;
    const days = daysSince(c.lastPublishedAt);
    return {
      id: c.id,
      name: c.name,
      type: c.type as AnalyticsChannelRow["type"],
      region: c.region,
      city: c.city,
      reach: c.averageReach ?? c.subscribersCount,
      listings: c.listingsCount,
      publications: c.publications,
      leads: channelLeadIds.size,
      deals: channelDeals.length,
      conversion: channelLeadIds.size
        ? Math.round((channelDeals.length / channelLeadIds.size) * 100)
        : null,
      avgMargin,
      lastPublishedAt: c.lastPublishedAt ? c.lastPublishedAt.toISOString() : null,
      daysSincePublication: days,
    };
  });

  void now;
  return rows.sort((a, b) =>
    sort === "leads"
      ? b.leads - a.leads || (b.avgMargin ?? 0) - (a.avgMargin ?? 0)
      : (b.avgMargin ?? -1) - (a.avgMargin ?? -1) || b.leads - a.leads,
  );
}

/* ---------- 3. Позиции ---------- */

export type PositionSort = "margin" | "stock";

export async function buildPositions(
  sort: PositionSort,
  deps: AnalyticsDeps,
  now = Date.now(),
): Promise<AnalyticsPositionRow[]> {
  const [positions, deals, listings] = await Promise.all([
    deps.db.listPositionFacts(),
    deps.db.listDealFacts("all"),
    deps.db.listListingFacts(),
  ]);

  /* Позиция → последняя публикация. */
  const lastByPosition = new Map<string, Date>();
  for (const l of listings) {
    if (l.status !== "PUBLISHED" || !l.publishedAt) continue;
    const prev = lastByPosition.get(l.positionId);
    if (!prev || l.publishedAt > prev) lastByPosition.set(l.positionId, l.publishedAt);
  }

  const rows: AnalyticsPositionRow[] = positions.map((p) => {
    const positionDeals = deals.filter((d) => d.positionId === p.id);
    const closedDeals = positionDeals.filter((d) => d.status === CLOSED);
    const revenue = round2(closedDeals.reduce((sum, d) => sum + d.salePrice * d.volumeKg, 0));
    const margin = round2(closedDeals.reduce((sum, d) => sum + d.margin, 0));
    const avgSalePrice = positionDeals.length
      ? round2(positionDeals.reduce((sum, d) => sum + d.salePrice, 0) / positionDeals.length)
      : null;
    const lastPublishedAt = lastByPosition.get(p.id) ?? null;
    return {
      id: p.id,
      title: positionName(p.cultureName, p.attributes),
      cultureName: p.cultureName,
      volumeKg: p.volumeKg,
      status: p.status as AnalyticsPositionRow["status"],
      dealsCount: positionDeals.length,
      revenue,
      margin,
      avgSalePrice,
      daysInStock: Math.max(0, Math.floor((now - p.createdAt.getTime()) / DAY_MS)),
      lastPublishedAt: lastPublishedAt ? lastPublishedAt.toISOString() : null,
    };
  });

  void now;
  return rows.sort((a, b) =>
    sort === "stock" ? b.volumeKg - a.volumeKg : b.margin - a.margin || b.revenue - a.revenue,
  );
}

/* ---------- 4. Канал в cooldown: доступен к публикации сегодня ---------- */

/** Канал можно публиковать сегодня: cooldown прошёл (или публикаций не было). */
export function channelAvailable(days: number | null): boolean {
  return days === null || days >= COOLDOWN_DAYS;
}

/* ---------- 5. Чек-лист «Перед запуском» ---------- */

export interface ReadinessFacts {
  sellerComplete: boolean;
  suppliersCount: number;
  positionsCount: number;
  channelsCount: number;
  /** Наш бот добавлен хотя бы в один канал (BotConfig). */
  botInChannel: boolean;
  /** AI настроен: GLM или OpenRouter ключ в env. */
  aiConfigured: boolean;
  /** R2 настроен (медиа): endpoint + ключи. */
  r2Configured: boolean;
}

export function buildReadiness(facts: ReadinessFacts): ReadinessDTO {
  const items: ReadinessItem[] = [
    {
      id: "requisites",
      label: "Заполнены реквизиты",
      done: facts.sellerComplete,
      hint: "«Ещё» → «Реквизиты и налог»: ИНН, ОГРНИП, адрес, банк, БИК, счёт",
    },
    {
      id: "supplier",
      label: "Добавлен хотя бы один поставщик",
      done: facts.suppliersCount > 0,
      hint: "«Ещё» → «Поставщики» — справочник закупок",
    },
    {
      id: "position",
      label: "Добавлена хотя бы одна позиция",
      done: facts.positionsCount > 0,
      hint: "«Позиции и остатки»: культура, атрибуты, цена и остаток",
    },
    {
      id: "channel",
      label: "Добавлен хотя бы один канал",
      done: facts.channelsCount > 0,
      hint: "«Каналы» — площадки для объявлений, по тегам работает подбор",
    },
    {
      id: "bot",
      label: "Бот добавлен в канал",
      done: facts.botInChannel,
      hint: "«Ещё» → «Telegram-бот»: добавить бота администратором в свой канал",
    },
    {
      id: "ai",
      label: "AI-ключ добавлен",
      done: facts.aiConfigured,
      hint: "Render → agropost-api → Environment: GLM_API_KEY или OPENROUTER_API_KEY",
      optional: true,
    },
    {
      id: "r2",
      label: "R2 настроен (медиа)",
      done: facts.r2Configured,
      hint: "Render env: R2_ENDPOINT, ключи и bucket — для фото позиций",
      optional: true,
    },
  ];
  const ready = items.filter((i) => i.done).length;
  return { ok: true, items, ready, total: items.length };
}
