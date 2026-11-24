/**
 * Сервис аналитики (этап 5.1): сводка, каналы, позиции, чек-лист.
 * Только факты и простые агрегаты — без графиков и прогнозов.
 *
 * Правильная математика (этап 5.1):
 * - выручка/маржа/средний чек — по ЗАКРЫТЫМ сделкам за период,
 *   отбор по closedAt (дата закрытия), а не createdAt;
 * - конверсия — УНИКАЛЬНЫЕ лиды: лид с 2 сделками = 1 сконвертированный,
 *   конверсия не может превысить 100%;
 * - средняя цена продажи — средневзвешенная по объёму (выручка/объём);
 * - атрибуция лида каналу — по lastChannelId (последний достоверный
 *   переход по deep link объявления). Лидам без достоверного источника
 *   канал НЕ приписывается; подписчики ≠ охват (разные показатели).
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
  ChannelDealAgg,
  ChannelFactRow,
  PositionDealAgg,
  AnalyticsDb,
} from "./types.js";

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface AnalyticsDeps {
  db: AnalyticsDb;
}

/* ---------- 1. Сводка ---------- */

export async function buildSummary(
  period: AnalyticsPeriod,
  deps: AnalyticsDeps,
  now = Date.now(),
): Promise<AnalyticsSummaryDTO> {
  const [deals, leads, cultures, topChannelLeads, channels, channelDealStats] = await Promise.all([
    deps.db.dealsTotals(period, now),
    deps.db.leadsTotals(period, now),
    deps.db.topCultures(period, 3, now),
    deps.db.topChannels(period, 3, now),
    deps.db.channelFacts(),
    deps.db.channelDealStats(),
  ]);

  const averageCheck = deals.closed > 0 ? round2(deals.revenue / deals.closed) : null;

  /* Конверсия по УНИКАЛЬНЫМ лидам: один лид с N сделками = 1 сконвертированный. */
  const converted = await deps.db.convertedLeadsCount(period, now);
  const conversion = leads.total > 0 ? Math.round((converted / leads.total) * 100) : null;

  /* Топ-3 канала по лидам: last-touch атрибуция (lastChannelId). */
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const dealsByChannel = new Map(channelDealStats.map((d) => [d.channelId, d.deals]));
  const topChannels: AnalyticsTopChannel[] = topChannelLeads.map((tc) => ({
    name: channelName.get(tc.channelId) ?? "Канал удалён",
    leads: tc.leads,
    deals: dealsByChannel.get(tc.channelId) ?? 0,
  }));

  const topCultures: AnalyticsTopCulture[] = cultures.map((c) => ({
    name: c.name,
    margin: c.margin,
    dealsCount: c.deals,
  }));

  return {
    ok: true,
    period,
    revenue: deals.revenue,
    margin: deals.margin,
    dealsTotal: deals.total,
    dealsClosed: deals.closed,
    dealsActive: deals.active,
    averageCheck,
    topCultures,
    topChannels,
    leadsTotal: leads.total,
    leadsConverted: converted,
    conversion,
    newLeadsToday: leads.today,
    lowData: deals.closed < 3,
  };
}

/* ---------- 2. Каналы ---------- */

export type ChannelSort = "margin" | "leads";

export async function buildChannels(
  sort: ChannelSort,
  deps: AnalyticsDeps,
  now = Date.now(),
): Promise<AnalyticsChannelRow[]> {
  const [channels, dealStats, leadsAllTime] = await Promise.all([
    deps.db.channelFacts(),
    deps.db.channelDealStats(),
    deps.db.topChannels("all", Number.MAX_SAFE_INTEGER, now),
  ]);

  const leadsByChannel = new Map(leadsAllTime.map((tc) => [tc.channelId, tc.leads]));
  const dealStatsByChannel = new Map(dealStats.map((d) => [d.channelId, d]));

  const rows: AnalyticsChannelRow[] = channels.map((c: ChannelFactRow) => {
    const stats: ChannelDealAgg | undefined = dealStatsByChannel.get(c.id);
    const leads = leadsByChannel.get(c.id) ?? 0;
    const deals = stats?.deals ?? 0;
    const avgMargin =
      stats && stats.closedDeals > 0 ? round2(stats.closedMargin / stats.closedDeals) : null;
    const days = daysSince(c.lastPublishedAt);
    return {
      id: c.id,
      name: c.name,
      type: c.type as AnalyticsChannelRow["type"],
      region: c.region,
      city: c.city,
      /* Подписчики и фактический охват — РАЗНЫЕ показатели; null — неизвестно. */
      subscribersCount: c.subscribersCount,
      averageReach: c.averageReach,
      listings: c.listingsCount,
      publications: c.publications,
      leads,
      deals,
      /* Конверсия по уникальным сконвертированным лидам канала. */
      conversion: leads > 0 ? Math.round(((stats?.convertedLeads ?? 0) / leads) * 100) : null,
      avgMargin,
      lastPublishedAt: c.lastPublishedAt ? c.lastPublishedAt.toISOString() : null,
      daysSincePublication: days,
    };
  });

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
  const [positions, dealStats, lastPublished] = await Promise.all([
    deps.db.positionFacts(),
    deps.db.positionDealStats(),
    deps.db.lastPublishedByPosition(),
  ]);

  const rows: AnalyticsPositionRow[] = positions.map((p) => {
    const stats: PositionDealAgg | undefined = dealStats.get(p.id);
    /* Средневзвешенная цена: выручка / проданный объём. */
    const avgSalePrice =
      stats && stats.volumeKg > 0 ? round2(stats.revenue / stats.volumeKg) : null;
    /* Дни в наличии — от stockSince; для старых позиций null = неизвестно. */
    const daysInStock =
      p.stockSince !== null ? Math.max(0, Math.floor((now - p.stockSince.getTime()) / DAY_MS)) : null;
    const lastPublishedAt = lastPublished.get(p.id) ?? null;
    return {
      id: p.id,
      title: positionName(p.cultureName, p.attributes),
      cultureName: p.cultureName,
      volumeKg: p.volumeKg,
      status: p.status as AnalyticsPositionRow["status"],
      dealsCount: stats?.dealsCount ?? 0,
      revenue: stats?.revenue ?? 0,
      margin: stats?.margin ?? 0,
      avgSalePrice,
      daysInStock,
      lastPublishedAt: lastPublishedAt ? lastPublishedAt.toISOString() : null,
    };
  });

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

/**
 * ЭТАП 6: чек-лист «Перед запуском» — 7 пунктов запуска
 * (парсер цен выведен из списка: он опционален и не мешает запуску).
 */
export function buildReadiness(facts: ReadinessFacts): ReadinessDTO {
  const items: ReadinessItem[] = [
    {
      id: "requisites",
      label: "Реквизиты заполнены",
      done: facts.sellerComplete,
      hint: "«Ещё» → «Реквизиты и налог»: ИНН, ОГРНИП, адрес, банк, БИК, счёт",
    },
    {
      id: "supplier",
      label: "Поставщик добавлен",
      done: facts.suppliersCount > 0,
      hint: "«Ещё» → «Поставщики» — справочник закупок",
    },
    {
      id: "position",
      label: "Позиция добавлена",
      done: facts.positionsCount > 0,
      hint: "«Позиции и остатки»: культура, атрибуты, цена и остаток",
    },
    {
      id: "channel",
      label: "Канал добавлен",
      done: facts.channelsCount > 0,
      hint: "«Каналы» — площадки для объявлений, по тегам работает подбор",
    },
    {
      id: "bot",
      label: "Бот добавлен админом в канал",
      done: facts.botInChannel,
      hint: "Добавьте @aylatica_sales_bot администратором в свой Telegram-канал",
    },
    {
      id: "ai",
      label: "OPENROUTER_API_KEY задан (для AI)",
      done: facts.aiConfigured,
      hint: "Render → agropost-api → Environment: OPENROUTER_API_KEY (или GLM_API_KEY)",
    },
    {
      id: "r2",
      label: "R2 настроен (для фото)",
      done: facts.r2Configured,
      hint: "Опционально: Render env — R2_ENDPOINT, ключи и bucket. Без R2 файлы хранятся в базе",
      optional: true,
    },
  ];
  const ready = items.filter((i) => i.done).length;
  return { ok: true, items, ready, total: items.length };
}
