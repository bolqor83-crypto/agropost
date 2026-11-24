/**
 * ЭТАП 9 — /api/avito/*: статус, ключи, проверка, dry-run, публикация.
 *
 * Все маршруты за авторизацией владельца (guard). Ключи Авито API —
 * env AVITO_CLIENT_ID/SECRET/USER_ID/CONTACT_PHONE (Render) или
 * «Ещё» → «Настройки» → «Авито API» (AppSetting "avito"); env сильнее.
 *
 * Не настроено — приложение работает как раньше (полуавто): dry-run и
 * publish отвечают 503 AVITO_NOT_CONFIGURED, честный warning в UI.
 *
 * Публикация — Автозагрузка по официальному API: dry-run (локальная
 * валидация + превью XML) → подтверждение → POST /autoload/v1/upload
 * с адресом фида — Авито сам забирает XML и обновляет объявления.
 */

import type { FastifyInstance } from "fastify";
import { ApiError } from "../../errors.js";
import { avitoSettingsSchema, parseOrThrow } from "../../validation.js";
import { prisma } from "../../prisma.js";
import type {
  AvitoCheckDTO,
  AvitoDryRunDTO,
  AvitoPublishDTO,
  AvitoSettingsDTO,
  AvitoSettingsInput,
  AvitoStatusDTO,
} from "@shared/types";
import { getFeedService } from "../../feeds/runtime.js";
import { feedUrls, loadFeedConfig } from "../../feeds/config.js";
import { isAvitoConfigured } from "./config.js";
import { avitoSettingsFromDb, configuredFrom, currentAvitoConfig } from "./runtime.js";
import { createAvitoClient } from "./client.js";
import { avitoDryRun, avitoPublish } from "./autoload.js";

/** 503, если ключи не заданы — приложение продолжает полуавто-режим. */
async function requireAvitoConfig() {
  const config = await currentAvitoConfig();
  if (!isAvitoConfigured(config)) {
    throw new ApiError(
      503,
      "AVITO_NOT_CONFIGURED",
      "Авито API не настроен: задайте AVITO_CLIENT_ID/AVITO_CLIENT_SECRET на Render или введите ключи в «Настройки → Авито API»",
    );
  }
  return config;
}

/** Клиент для флоу dry-run/publish: общий сервис фидов + адрес фида. */
function flowDeps(config: Awaited<ReturnType<typeof requireAvitoConfig>>) {
  const service = getFeedService();
  const urls = feedUrls(loadFeedConfig());
  const client = createAvitoClient({ config });
  return {
    deps: {
      service,
      client,
      contactPhone: config.contactPhone,
      feedUrl: urls.avito ?? `${loadFeedConfig().publicApiUrl}/api/feeds/avito`,
    },
  };
}

export async function avitoRoutes(app: FastifyInstance): Promise<void> {
  /* Статус: настроен ли клиент, откуда, id профиля, адрес фида. */
  app.get("/api/avito/status", async (): Promise<AvitoStatusDTO> => {
    const config = await currentAvitoConfig();
    const urls = feedUrls(loadFeedConfig());
    return {
      ok: true,
      configured: isAvitoConfigured(config),
      configuredFrom: configuredFrom(config),
      userId: config.userId,
      contactPhone: config.contactPhone,
      feedUrl: urls.avito,
    };
  });

  /* Настройки (GET — секрет маскирован; env-ключи в UI недоступны). */
  app.get("/api/avito/settings", async (): Promise<AvitoSettingsDTO> => {
    const config = await currentAvitoConfig();
    return {
      clientId: config.clientId,
      clientSecretSet: config.clientSecret !== null,
      userId: config.userId,
      contactPhone: config.contactPhone,
      fromEnv: config.fromEnv,
    };
  });

  /* Сохранение ключей в AppSetting "avito" (env имеет приоритет). */
  app.put("/api/avito/settings", async (req): Promise<AvitoSettingsDTO> => {
    const input = parseOrThrow<AvitoSettingsInput>(avitoSettingsSchema, req.body ?? {});
    const existing = await avitoSettingsFromDb();
    const merged = {
      clientId: input.clientId !== undefined ? input.clientId : (existing?.clientId ?? null),
      clientSecret:
        input.clientSecret !== undefined ? input.clientSecret : (existing?.clientSecret ?? null),
      userId: input.userId !== undefined ? input.userId : (existing?.userId ?? null),
      phone: input.contactPhone !== undefined ? input.contactPhone : (existing?.phone ?? null),
    };
    await prisma.appSetting.upsert({
      where: { key: "avito" },
      create: { key: "avito", value: merged },
      update: { value: merged },
    });
    const config = await currentAvitoConfig();
    return {
      clientId: config.clientId,
      clientSecretSet: config.clientSecret !== null,
      userId: config.userId,
      contactPhone: config.contactPhone,
      fromEnv: config.fromEnv,
    };
  });

  /* «Проверить подключение»: OAuth-токен + состояние автозагрузки. */
  app.post("/api/avito/check", async (): Promise<AvitoCheckDTO> => {
    const config = await requireAvitoConfig();
    const client = createAvitoClient({ config });
    try {
      await client.getToken();
      const uploadStatus = await client.currentUpload().catch(() => null);
      return { ok: true, tokenOk: true, uploadStatus };
    } catch (err) {
      return {
        ok: true,
        tokenOk: false,
        uploadStatus: null,
        error: err instanceof Error ? err.message : "Не удалось получить токен Авито",
      };
    }
  });

  /* Dry-run: превью XML + локальная валидация + удалённая (если есть). */
  app.post("/api/avito/dry-run", async (): Promise<AvitoDryRunDTO> => {
    const config = await requireAvitoConfig();
    const { deps } = flowDeps(config);
    return avitoDryRun(deps);
  });

  /* Публикация (после подтверждения в UI): upload фида по ссылке. */
  app.post("/api/avito/publish", async (): Promise<AvitoPublishDTO> => {
    const config = await requireAvitoConfig();
    const { deps } = flowDeps(config);
    return avitoPublish(deps);
  });
}
