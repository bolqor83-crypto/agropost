/**
 * Prisma-реализация интерфейса AnalyticsDb (этап 5).
 * Агрегаты по каналам считаются на стороне БД (_count + groupBy
 * листингов), аттрибуция лидов и экономика — в сервисе.
 */

import { prisma } from "../prisma.js";
import type { AnalyticsPeriod } from "@shared/types";
import type {
  AnalyticsDb,
  ChannelFactRow,
  DealFactRow,
  LeadFactRow,
  ListingFactRow,
  PositionFactRow,
} from "./types.js";
import { periodStart } from "./types.js";

const num = (d: unknown): number => Number(d ?? 0);

export const prismaAnalyticsDb: AnalyticsDb = {
  async listDealFacts(period: AnalyticsPeriod): Promise<DealFactRow[]> {
    const since = periodStart(period);
    const rows = await prisma.deal.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      include: { position: { include: { culture: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      leadId: r.leadId,
      positionId: r.positionId,
      cultureName: r.position?.culture?.name ?? null,
      attributes: (r.position?.attributes ?? null) as Record<string, string | number> | null,
      volumeKg: num(r.volumeKg),
      salePrice: num(r.salePrice),
      margin: num(r.margin),
      status: r.status,
      createdAt: r.createdAt,
    }));
  },

  async listChannelFacts(): Promise<ChannelFactRow[]> {
    const channels = await prisma.channel.findMany({
      orderBy: { lastActivityAt: "desc" },
      include: {
        _count: { select: { listings: true } },
        listings: { where: { publishedAt: { not: null } }, select: { publishedAt: true, publishedCount: true } },
      },
    });
    return channels.map((c) => {
      const published = c.listings;
      const lastPublishedAt =
        published.length > 0
          ? published
              .map((l) => l.publishedAt as Date)
              .reduce((a, b) => (a > b ? a : b))
          : null;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        region: c.region,
        city: c.city,
        subscribersCount: c.subscribersCount,
        averageReach: c.averageReach,
        listingsCount: c._count.listings,
        publications: published.reduce((sum, l) => sum + l.publishedCount, 0),
        lastPublishedAt,
      };
    });
  },

  async listPositionFacts(): Promise<PositionFactRow[]> {
    const positions = await prisma.supplierPosition.findMany({
      include: { culture: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return positions.map((p) => ({
      id: p.id,
      cultureId: p.cultureId,
      cultureName: p.culture.name,
      cultureType: p.culture.type as "SEED" | "NUT",
      attributes: (p.attributes ?? {}) as Record<string, string | number>,
      volumeKg: p.volumeKg,
      salePrice: num(p.salePrice),
      status: p.status,
      createdAt: p.createdAt,
      lastPublishedAt: null, /* заполняется листингами в сервисе */
    }));
  },

  async listLeadFacts(period: AnalyticsPeriod): Promise<LeadFactRow[]> {
    const since = periodStart(period);
    const rows = await prisma.lead.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((l) => ({
      id: l.id,
      source: l.source,
      positionId: l.positionId,
      status: l.status,
      createdAt: l.createdAt,
    }));
  },

  async listListingFacts(): Promise<ListingFactRow[]> {
    const rows = await prisma.listing.findMany({
      select: { id: true, channelId: true, positionId: true, status: true, publishedAt: true },
      take: 1000,
    });
    return rows.map((l) => ({
      id: l.id,
      channelId: l.channelId,
      positionId: l.positionId,
      status: l.status,
      publishedAt: l.publishedAt,
    }));
  },
};
