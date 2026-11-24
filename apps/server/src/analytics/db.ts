/**
 * Prisma-реализация AnalyticsDb (этап 5.1) — агрегаты на стороне БД.
 *
 * Все суммы/счётчики считаются SQL-запросами (raw/groupBy) по ПОЛНОМУ
 * набору данных — без take-лимитов этапа 5 (500/1000/200). Там, где
 * нужен список (каналы/позиции), — тоже без тихих обрезок: у одного
 * владельца тысячи записей не вырастут, а агрегаты считаются в БД.
 *
 * Денежные суммы кастуются в float8 на стороне SQL — числа приходят
 * готовыми (Prisma Decimal → JS не нужен).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
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
} from "./types.js";

/* ---------- Условия периодов ---------- */

/** Закрытые сделки: по closedAt (всё время — все CLOSED, включая legacy). */
function closedSince(period: AnalyticsPeriod, now: number): Prisma.Sql {
  const since = periodStartDate(period, now);
  return since
    ? Prisma.sql`"status" = 'CLOSED' AND "closedAt" >= ${since}`
    : Prisma.sql`"status" = 'CLOSED'`;
}

/** Сделки, созданные за период. */
function createdSince(period: AnalyticsPeriod, now: number): Prisma.Sql {
  const since = periodStartDate(period, now);
  return since ? Prisma.sql`"createdAt" >= ${since}` : Prisma.sql`TRUE`;
}

const ACTIVE_STATUSES = ["DRAFT", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED"];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/* Сырые результаты SQL (имена как в запросах). */
interface DealsTotalsRow {
  total: number;
  active: number;
  closed: number;
  revenue: number;
  margin: number;
}

export const prismaAnalyticsDb: AnalyticsDb = {
  async dealsTotals(period, now): Promise<DealsTotals> {
    const rows = await prisma.$queryRaw<DealsTotalsRow[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM "Deal" WHERE ${createdSince(period, now)})::int AS total,
        (SELECT COUNT(*) FROM "Deal" WHERE ${createdSince(period, now)} AND "status" = ANY(${Prisma.raw(
          `ARRAY[${ACTIVE_STATUSES.map((s) => `'${s}'`).join(",")}]::"DealStatus"[]`,
        )}))::int AS active,
        (SELECT COUNT(*) FROM "Deal" WHERE ${closedSince(period, now)})::int AS closed,
        (SELECT COALESCE(SUM("salePrice" * "volumeKg"), 0) FROM "Deal" WHERE ${closedSince(
          period,
          now,
        )})::float8 AS revenue,
        (SELECT COALESCE(SUM("margin"), 0) FROM "Deal" WHERE ${closedSince(period, now)})::float8 AS margin
    `);
    const r = rows[0];
    return {
      total: Number(r?.total ?? 0),
      active: Number(r?.active ?? 0),
      closed: Number(r?.closed ?? 0),
      revenue: round2(Number(r?.revenue ?? 0)),
      margin: round2(Number(r?.margin ?? 0)),
    };
  },

  async topCultures(period, limit, now): Promise<CultureAgg[]> {
    const rows = await prisma.$queryRaw<{ name: string; margin: number; deals: number }[]>(
      Prisma.sql`
        SELECT c."name" AS name,
               COALESCE(SUM(d."margin"), 0)::float8 AS margin,
               COUNT(*)::int AS deals
        FROM "Deal" d
        JOIN "SupplierPosition" p ON d."positionId" = p."id"
        JOIN "CultureTemplate" c ON p."cultureId" = c."id"
        WHERE ${closedSince(period, now)}
        GROUP BY c."name"
        ORDER BY margin DESC, deals DESC
        LIMIT ${limit}
      `,
    );
    return rows.map((r) => ({
      name: r.name,
      margin: round2(Number(r.margin)),
      deals: Number(r.deals),
    }));
  },

  async leadsTotals(period, now) {
    const since = periodStartDate(period, now);
    const today = todayStartMoscowDate(now);
    const [total, createdToday] = await Promise.all([
      prisma.lead.count({ where: since ? { createdAt: { gte: since } } : {} }),
      prisma.lead.count({ where: { createdAt: { gte: today } } }),
    ]);
    return { total, today: createdToday };
  },

  async convertedLeadsCount(period, now) {
    const since = periodStartDate(period, now);
    const rows = await prisma.$queryRaw<{ converted: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT d."leadId")::int AS converted
      FROM "Deal" d
      WHERE d."leadId" IS NOT NULL
        AND d."leadId" IN (
          SELECT "id" FROM "Lead" ${
            since ? Prisma.sql`WHERE "createdAt" >= ${since}` : Prisma.sql``
          }
        )
    `);
    return Number(rows[0]?.converted ?? 0);
  },

  async topChannels(period, limit, now): Promise<ChannelAgg[]> {
    const since = periodStartDate(period, now);
    const groups = await prisma.lead.groupBy({
      by: ["lastChannelId"],
      where: {
        lastChannelId: { not: null },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _count: { _all: true },
    });
    return groups
      .filter((g) => g.lastChannelId !== null)
      .map((g) => ({ channelId: g.lastChannelId as string, leads: g._count._all }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, limit);
  },

  async channelDealStats(): Promise<ChannelDealAgg[]> {
    const rows = await prisma.$queryRaw<
      {
        channelId: string;
        deals: number;
        convertedLeads: number;
        closedDeals: number;
        closedMargin: number;
      }[]
    >(Prisma.sql`
      SELECT l."lastChannelId" AS "channelId",
             COUNT(d."id")::int AS deals,
             COUNT(DISTINCT d."leadId")::int AS "convertedLeads",
             COUNT(d."id") FILTER (WHERE d."status" = 'CLOSED')::int AS "closedDeals",
             COALESCE(SUM(d."margin") FILTER (WHERE d."status" = 'CLOSED'), 0)::float8 AS "closedMargin"
      FROM "Lead" l
      LEFT JOIN "Deal" d ON d."leadId" = l."id"
      WHERE l."lastChannelId" IS NOT NULL
      GROUP BY l."lastChannelId"
    `);
    return rows.map((r) => ({
      channelId: r.channelId,
      deals: Number(r.deals),
      convertedLeads: Number(r.convertedLeads),
      closedDeals: Number(r.closedDeals),
      closedMargin: round2(Number(r.closedMargin)),
    }));
  },

  async channelFacts(): Promise<ChannelFactRow[]> {
    const rows = await prisma.$queryRaw<
      {
        id: string;
        name: string;
        type: string;
        region: string;
        city: string | null;
        subscribersCount: number | null;
        averageReach: number | null;
        listingsCount: number;
        publications: number;
        lastPublishedAt: Date | null;
      }[]
    >(Prisma.sql`
      SELECT ch."id", ch."name", ch."type"::text AS type, ch."region", ch."city",
             ch."subscribersCount", ch."averageReach",
             COUNT(li."id")::int AS "listingsCount",
             COALESCE(SUM(li."publishedCount") FILTER (WHERE li."publishedAt" IS NOT NULL), 0)::int AS publications,
             MAX(li."publishedAt") AS "lastPublishedAt"
      FROM "Channel" ch
      LEFT JOIN "Listing" li ON li."channelId" = ch."id"
      GROUP BY ch."id", ch."name", ch."type", ch."region", ch."city",
               ch."subscribersCount", ch."averageReach"
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      region: r.region,
      city: r.city,
      subscribersCount: r.subscribersCount === null ? null : Number(r.subscribersCount),
      averageReach: r.averageReach === null ? null : Number(r.averageReach),
      listingsCount: Number(r.listingsCount),
      publications: Number(r.publications),
      lastPublishedAt: r.lastPublishedAt,
    }));
  },

  async positionFacts(): Promise<PositionFactRow[]> {
    const rows = await prisma.supplierPosition.findMany({
      select: {
        id: true,
        attributes: true,
        volumeKg: true,
        salePrice: true,
        status: true,
        createdAt: true,
        stockSince: true,
        culture: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((p) => ({
      id: p.id,
      cultureId: p.culture.id,
      cultureName: p.culture.name,
      cultureType: p.culture.type as "SEED" | "NUT",
      attributes: (p.attributes ?? {}) as Record<string, string | number>,
      volumeKg: p.volumeKg,
      salePrice: Number(p.salePrice),
      status: p.status,
      createdAt: p.createdAt,
      stockSince: p.stockSince,
    }));
  },

  async positionDealStats(): Promise<Map<string, PositionDealAgg>> {
    const rows = await prisma.$queryRaw<
      {
        positionId: string;
        dealsCount: number;
        revenue: number;
        margin: number;
        volumeKg: number;
      }[]
    >(Prisma.sql`
      SELECT "positionId",
             COUNT(*)::int AS "dealsCount",
             COALESCE(SUM("salePrice" * "volumeKg") FILTER (WHERE "status" = 'CLOSED'), 0)::float8 AS revenue,
             COALESCE(SUM("margin") FILTER (WHERE "status" = 'CLOSED'), 0)::float8 AS margin,
             COALESCE(SUM("volumeKg") FILTER (WHERE "status" = 'CLOSED'), 0)::float8 AS "volumeKg"
      FROM "Deal"
      WHERE "positionId" IS NOT NULL
      GROUP BY "positionId"
    `);
    return new Map(
      rows.map((r) => [
        r.positionId,
        {
          positionId: r.positionId,
          dealsCount: Number(r.dealsCount),
          revenue: round2(Number(r.revenue)),
          margin: round2(Number(r.margin)),
          volumeKg: Number(r.volumeKg),
        },
      ]),
    );
  },

  async lastPublishedByPosition(): Promise<Map<string, Date>> {
    const rows = await prisma.$queryRaw<{ positionId: string; last: Date }[]>(Prisma.sql`
      SELECT "positionId", MAX("publishedAt") AS last
      FROM "Listing"
      WHERE "publishedAt" IS NOT NULL
      GROUP BY "positionId"
    `);
    return new Map(rows.map((r) => [r.positionId, r.last]));
  },
};
