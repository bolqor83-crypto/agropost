/**
 * ЭТАП 9 — маршруты фидов.
 *
 * Публичные (в allowlist guard): GET /api/feeds/yml?token=… и
 * GET /api/feeds/avito?token=… — их дёргают площадки по расписанию,
 * сессии владельца у них нет. Авторизация — токен FEED_TOKEN:
 * - без токена / неверный / FEED_TOKEN не задан → 403 (структуру
 *   фида не раскрываем);
 * - верный → XML с кэшем 1 ч (сервер + Cache-Control).
 *
 * Приватный GET /api/feeds/info — адреса фидов для кабинетов площадок
 * (экран «Настройки»): владелец копирует ссылку и вставляет её
 * в кабинет Зерно Он-Лайн / Своё Фермерство один раз.
 */

import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { getFeedService } from "./runtime.js";
import { feedUrls, loadFeedConfigAsync, resolveFeedToken } from "./config.js";
import type { FeedsInfoDTO } from "@shared/types";

/** Проверка токена фида: строка запроса против действующего токена
    (env ⋁ «Настройки» → «Фиды», шифрованная секция AppSetting). */
export async function assertFeedToken(query: Record<string, unknown>): Promise<void> {
  const expected = await resolveFeedToken();
  const provided = query["token"];
  if (expected === null || typeof provided !== "string" || provided !== expected) {
    throw new ApiError(403, "FEED_FORBIDDEN", "Доступ к фиду запрещён");
  }
}

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  /* YML — Зерно Он-Лайн, Своё Фермерство (стандарт Яндекс.Маркета). */
  app.get("/api/feeds/yml", async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    await assertFeedToken(query);
    const snapshot = await getFeedService().snapshot();
    return reply
      .code(200)
      .header("content-type", "application/xml; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(snapshot.yml);
  });

  /* Авито Autoload XML (Ads formatVersion=3). */
  app.get("/api/feeds/avito", async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    await assertFeedToken(query);
    const snapshot = await getFeedService().snapshot();
    return reply
      .code(200)
      .header("content-type", "application/xml; charset=utf-8")
      .header("cache-control", "public, max-age=3600")
      .send(snapshot.avito);
  });

  /* Инфо для владельца: адреса фидов и число офферов (за сессией). */
  app.get("/api/feeds/info", async (): Promise<FeedsInfoDTO> => {
    const config = await loadFeedConfigAsync();
    const urls = feedUrls(config);
    const snapshot = await getFeedService().snapshot();
    return {
      ok: true,
      configured: config.token !== null,
      yml: urls.yml,
      avito: urls.avito,
      offers: snapshot.offers,
    };
  });
}
