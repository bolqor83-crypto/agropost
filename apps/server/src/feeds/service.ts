/**
 * ЭТАП 9 — сервис фидов: сборка FeedData из БД + XML + кэш 1 час.
 *
 * Один сервис для маршрутов (/api/feeds/*) и Авито-флоу (dry-run и
 * upload забирают РОВНО тот же XML, что отдаётся площадке — без
 * расхождений превью и факта). Кэш в памяти на TTL: площадки опрашивают
 * фид редко, рендерить XML на каждый чих не нужно.
 *
 * Зависимости (строки БД, телефон Авито) инъектируются — тестам достаточно
 * фикстур, Prisma не нужен.
 */

import { loadFeedConfig, feedUrls } from "./config.js";
import { buildFeedData, type FeedOwnerRow, type FeedPositionRow } from "./data.js";
import { buildYmlCatalog } from "./yml.js";
import {
  AVITO_CATEGORY_DEFAULT,
  buildAvitoAds,
  type AvitoCategoryMap,
} from "./avito-xml.js";
import type { FeedConfig, FeedData } from "./types.js";

export interface FeedSnapshot {
  yml: string;
  avito: string;
  offers: number;
  generatedAt: string;
}

export interface FeedServiceDeps {
  /** Позиции IN_STOCK (с культурой, поставщиком и медиа). */
  loadRows(): Promise<FeedPositionRow[]>;
  /** Профиль владельца (шапка shop.company). */
  loadOwner(): Promise<FeedOwnerRow | null>;
  /** Телефон/категории Авито (env AVITO_* или Настройки → Авито API). */
  loadAvitoOptions(): Promise<{ contactPhone: string | null; categories: AvitoCategoryMap }>;
}

export function createFeedService(deps: FeedServiceDeps, now: () => Date = () => new Date()) {
  let config = loadFeedConfig();
  let cache: { snapshot: FeedSnapshot; at: number } | null = null;

  function reloadConfig(): FeedConfig {
    config = loadFeedConfig();
    cache = null; /* токен сменился — сбрасываем снапшот */
    return config;
  }

  async function buildSnapshot(): Promise<FeedSnapshot> {
    const [rows, owner, avitoOpts] = await Promise.all([
      deps.loadRows(),
      deps.loadOwner(),
      deps.loadAvitoOptions(),
    ]);
    const data: FeedData = buildFeedData(rows, owner, config.shopUrl, now().toISOString());
    return {
      yml: buildYmlCatalog(data),
      avito: buildAvitoAds(data, {
        contactPhone: avitoOpts.contactPhone,
        categories: avitoOpts.categories ?? AVITO_CATEGORY_DEFAULT,
      }),
      offers: data.offers.length,
      generatedAt: data.generatedAt,
    };
  }

  return {
    config(): FeedConfig {
      return config;
    },
    urls() {
      return feedUrls(config);
    },
    /** Снапшот с кэшем: TTL из FEED_CACHE_TTL_MS (по умолчанию 1 час). */
    async snapshot(): Promise<FeedSnapshot> {
      if (cache && Date.now() - cache.at < config.cacheTtlMs) return cache.snapshot;
      const snapshot = await buildSnapshot();
      cache = { snapshot, at: Date.now() };
      return snapshot;
    },
    /* Тесты: управление временем/сбросом. */
    reloadConfig,
    invalidate(): void {
      cache = null;
    },
  };
}

export type FeedService = ReturnType<typeof createFeedService>;
