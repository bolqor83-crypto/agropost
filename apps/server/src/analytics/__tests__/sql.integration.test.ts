/**
 * SQL-регрессия аналитики (аудит прода 25.11.2026).
 *
 * Контекст: topCultures содержит JOIN трёх таблиц, и замкнутый
 * closedSince() подставлял НЕквалифицированное "status" — Postgres
 * отвечал 42702 «column reference "status" is ambiguous», а
 * /api/analytics/summary — 500 на проде. Юнит-тесты этого не видели:
 * MemoryAnalyticsDb не выполняет SQL. Браузерные аудиты шли по мок-API.
 *
 * Тест запускается ТОЛЬКО при TEST_DATABASE_URL (PostgreSQL с
 * применёнными миграциями схемы — как golden-тест от GLM_API_KEY):
 *   TEST_DATABASE_URL=postgres://… bun test src/analytics
 * ВАЖНО: гейт — отдельная переменная (не DATABASE_URL), чтобы тест
 * нельзя было случайно запустить против прода; внутри она подменяет
 * DATABASE_URL ДО создания PrismaClient (динамический импорт).
 */

import { afterAll, describe, expect, test } from "bun:test";

const url = process.env.TEST_DATABASE_URL?.trim();

/* Подмена до импорта prisma.js: клиент строится в момент импорта. */
if (url) process.env.DATABASE_URL = url;

const now = Date.now();

describe.skipIf(!url)("SQL аналитики на реальном PG", () => {
  const periods = ["week", "month", "all"] as const;

  test("topCultures (week) — без 42702 ambiguous", async () => {
    const { prismaAnalyticsDb } = await import("../db.js");
    const rows = await prismaAnalyticsDb.topCultures("week", 3, now);
    expect(Array.isArray(rows)).toBe(true);
  });

  test("dealsTotals (week/month/all) — без ошибок парсера", async () => {
    const { prismaAnalyticsDb } = await import("../db.js");
    for (const period of periods) {
      const totals = await prismaAnalyticsDb.dealsTotals(period, now);
      expect(totals.total).toBeGreaterThanOrEqual(0);
      expect(totals.closed).toBeGreaterThanOrEqual(0);
    }
  });

  test("convertedLeadsCount + channelDealStats + channelFacts", async () => {
    const { prismaAnalyticsDb } = await import("../db.js");
    expect(await prismaAnalyticsDb.convertedLeadsCount("week", now)).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(await prismaAnalyticsDb.channelDealStats())).toBe(true);
    expect(Array.isArray(await prismaAnalyticsDb.channelFacts())).toBe(true);
  });

  test("buildSummary целиком — тот самый 500", async () => {
    const { prismaAnalyticsDb } = await import("../db.js");
    const { buildSummary } = await import("../service.js");
    const deps = { db: prismaAnalyticsDb };
    for (const period of periods) {
      const summary = await buildSummary(period, deps, now);
      expect(summary.ok).toBe(true);
      expect(summary.period).toBe(period);
    }
  });

  afterAll(async () => {
    if (!url) return;
    const { prisma } = await import("../../prisma.js");
    await prisma.$disconnect();
  });
});
