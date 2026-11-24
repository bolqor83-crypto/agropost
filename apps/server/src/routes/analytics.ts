/**
 * /api/analytics — этап 5: сводка, каналы, позиции, чек-лист.
 * Всё — GET по запросу: аналитика простая, без дашбордов и графиков.
 * Чек-лист readiness собирает факты из БД и env (без значений ключей).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { parseOrThrow } from "../validation.js";
import { prismaAnalyticsDb } from "../analytics/db.js";
import {
  buildChannels,
  buildPositions,
  buildReadiness,
  buildSummary,
  type ChannelSort,
  type PositionSort,
} from "../analytics/service.js";
import { loadAiConfig } from "../ai/config.js";

const periodSchema = z.enum(["week", "month", "all"]);
const channelSortSchema = z.enum(["margin", "leads"]);
const positionSortSchema = z.enum(["margin", "stock"]);

const deps = { db: prismaAnalyticsDb };

/** Реквизиты для документов: ИНН + ОГРНИП + адрес + банк-блок. */
function sellerRequisitesComplete(seller: {
  inn: string | null;
  ogrnip: string | null;
  address: string | null;
  bank: string | null;
  bik: string | null;
  account: string | null;
}): boolean {
  return Boolean(
    seller.inn &&
      seller.ogrnip &&
      seller.address &&
      seller.bank &&
      seller.bik &&
      seller.account,
  );
}

async function readinessFacts() {
  const [seller, suppliersCount, positionsCount, channelsCount, botConfigs] = await Promise.all([
    prisma.user.findFirst(),
    prisma.supplier.count(),
    prisma.supplierPosition.count({ where: { volumeKg: { gt: 0 } } }),
    prisma.channel.count(),
    prisma.botConfig.count(),
  ]);
  const ai = loadAiConfig();
  const r2Configured = Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
  /* Этап 5.1: парсер честно отражён в чек-листе — без него «Рынок» пустой. */
  const parserConfigured = Boolean(
    process.env.PARSER_URL?.trim() && process.env.PARSER_SECRET?.trim(),
  );
  return {
    sellerComplete: seller ? sellerRequisitesComplete(seller) : false,
    suppliersCount,
    positionsCount,
    channelsCount,
    botInChannel: botConfigs > 0,
    aiConfigured: Boolean(ai.glmApiKey || ai.openrouterApiKey),
    r2Configured,
    parserConfigured,
  };
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  /* Сводка: ?period=week|month|all (по умолчанию week). */
  app.get("/api/analytics/summary", async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const period = query.period ? parseOrThrow(periodSchema, query.period) : "week";
    return buildSummary(period, deps);
  });

  /* Каналы: ?sort=margin|leads (по умолчанию margin). */
  app.get("/api/analytics/channels", async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const sort = query.sort ? parseOrThrow(channelSortSchema, query.sort) : "margin";
    const items = await buildChannels(sort as ChannelSort, deps);
    return { ok: true, items };
  });

  /* Позиции: ?sort=margin|stock (по умолчанию margin). */
  app.get("/api/analytics/positions", async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const sort = query.sort ? parseOrThrow(positionSortSchema, query.sort) : "margin";
    const items = await buildPositions(sort as PositionSort, deps);
    return { ok: true, items };
  });

  /* Чек-лист «Перед запуском»: 7 пунктов, прогресс N из 7. */
  app.get("/api/analytics/readiness", async () => {
    const facts = await readinessFacts();
    return buildReadiness(facts);
  });
}
