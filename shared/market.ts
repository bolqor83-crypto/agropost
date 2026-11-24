/**
 * Рынок цен конкурентов (этап 2.5).
 *
 * Парсер пишет в CompetitorPrice поисковый запрос (query, lowercase).
 * Этот модуль связывает культуру позиции с запросами парсера и
 * считает агрегаты по собранным строкам. Чистый модуль — его
 * импортируют apps/server (GET /api/positions/:id/market) и мок-API превью.
 */

import type { MarketSampleDTO, PriceSource } from "./types";

/** Запросы парсера по умолчанию (ТЗ этапа 2.5). */
export const DEFAULT_PARSER_QUERIES = [
  "люцерна",
  "эспарцет",
  "суданка",
  "грецкий орех",
] as const;

/**
 * Запросы парсера для культуры позиции. «Суданская трава» ищется
 * как «суданка» (на досках пишут и так, и так), остальное — 1:1.
 */
export function marketQueriesFor(cultureName: string): string[] {
  const n = cultureName.trim().toLowerCase();
  if (n === "суданская трава") return ["суданка", "суданская трава"];
  return [n];
}

/**
 * Запрос, под которым культура лежит в CompetitorPrice у парсера:
 * первый из marketQueriesFor (его парсер и ищет по умолчанию).
 */
export function primaryMarketQuery(cultureName: string): string {
  return marketQueriesFor(cultureName)[0];
}

/** Окно свежести для агрегатов «Рынок: …» в карточке позиции, дней. */
export const MARKET_WINDOW_DAYS = 30;

/** Строка цены для агрегации (окно уже отфильтровано вызывающим). */
export interface MarketRow {
  id: string;
  source: PriceSource;
  price: number;
  unit: string;
  region: string | null;
  sellerName: string | null;
  link: string;
  fetchedAt: string;
}

/**
 * Агрегаты рынка: min/max/avg, источники, последние 5 сэмплов.
 * Пустой список → нули и null-поля (UI прячет строку «Рынок: …»).
 */
export function aggregateMarket(
  positionId: string,
  cultureName: string,
  queries: string[],
  rows: MarketRow[],
): {
  positionId: string;
  cultureName: string;
  queries: string[];
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  sources: PriceSource[];
  lastFetchedAt: string | null;
  samples: MarketSampleDTO[];
} {
  const prices = rows.map((r) => r.price).filter((p) => Number.isFinite(p));
  const sorted = [...rows].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  const samples: MarketSampleDTO[] = sorted.slice(0, 5).map((r) => ({
    id: r.id,
    source: r.source,
    price: r.price,
    unit: r.unit,
    region: r.region,
    sellerName: r.sellerName,
    link: r.link,
    fetchedAt: r.fetchedAt,
  }));
  const sources = [...new Set(rows.map((r) => r.source))].sort();
  return {
    positionId,
    cultureName,
    queries,
    count: rows.length,
    min: prices.length > 0 ? Math.min(...prices) : null,
    max: prices.length > 0 ? Math.max(...prices) : null,
    avg: prices.length > 0
      ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
      : null,
    sources,
    lastFetchedAt: sorted[0]?.fetchedAt ?? null,
    samples,
  };
}
