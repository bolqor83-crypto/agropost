/**
 * ЭТАП 9 — Автозагрузка Авито: сборка XML, dry-run, публикация.
 *
 * Фид Авито = те же позиции IN_STOCK, что и витрина (YML): Автозагрузка
 * синхронизирует ВЕСЬ каталог — создаёт/обновляет объявления и снимает
 * отсутствующие в файле. Превью (dry-run) и upload работают с одним
 * снапшотом сервиса фидов: «показали одно — отправили то же самое».
 *
 * Отправка — «Загрузка файла по ссылке» (POST /autoload/v1/upload
 * {url}): площадка сама забирает XML по адресу фида.
 */

import type { AvitoDryRunDTO, AvitoPublishDTO } from "@shared/types";
import type { FeedService } from "../../feeds/service.js";
import { validateAvitoAds } from "../../feeds/avito-xml.js";
import type { AvitoClient } from "./client.js";

export interface AvitoFlowDeps {
  service: FeedService;
  client: AvitoClient;
  /** Телефон продавца (ContactPhone) из конфигурации Авито. */
  contactPhone: string | null;
  /** Полный адрес Авито-фида (его забирает площадка). */
  feedUrl: string;
}

/** Снапшот Авито-фида из сервиса (кэш 1 ч — общий с площадкой). */
export async function avitoFeedSnapshot(service: FeedService): Promise<{
  xml: string;
  offers: number;
  generatedAt: string;
}> {
  const snapshot = await service.snapshot();
  return { xml: snapshot.avito, offers: snapshot.offers, generatedAt: snapshot.generatedAt };
}

/**
 * Dry-run публикации на Авито:
 * 1) сборка XML — тот же снапшот, что отдаётся площадке;
 * 2) локальная структурная валидация (лимиты Title/Description, теги, Id);
 * 3) удалённая валидация /autoload/v2/validate — если эндпоинт у площадки
 *    есть; 404/405/сеть → «unavailable» (локальная проверка остаётся).
 */
export async function avitoDryRun(deps: AvitoFlowDeps): Promise<AvitoDryRunDTO> {
  const snapshot = await avitoFeedSnapshot(deps.service);
  const local = validateAvitoAds(snapshot.xml, {
    expectedOffers: snapshot.offers,
    contactPhone: deps.contactPhone,
  });
  const remote = await deps.client.validate(snapshot.xml).catch(() => ({
    remote: "unavailable" as const,
    errors: [] as string[],
  }));

  const warnings = local.warnings;
  if (remote.remote === "unavailable") {
    warnings.push("удалённый валидатор Авито недоступен — выполнена локальная проверка XML");
  }
  if (local.errors.length > 0) {
    warnings.push(...local.errors.map((e) => `ошибка формата: ${e}`));
  }

  return {
    ok: true,
    xml: snapshot.xml,
    offers: snapshot.offers,
    valid: local.valid && remote.remote !== "failed",
    warnings,
    remote: remote.remote,
    ...(remote.errors.length > 0 ? { remoteErrors: remote.errors } : {}),
  };
}

/**
 * Публикация: загрузка фида по ссылке — Авито забирает XML и
 * синхронизирует объявления (создаст/обновит, снимет отсутствующие).
 * Подтверждение пользователь даёт в UI после превью dry-run.
 */
export async function avitoPublish(deps: AvitoFlowDeps): Promise<AvitoPublishDTO> {
  const snapshot = await avitoFeedSnapshot(deps.service);
  const local = validateAvitoAds(snapshot.xml, {
    expectedOffers: snapshot.offers,
    contactPhone: deps.contactPhone,
  });
  if (!local.valid) {
    throw Object.assign(new Error(`XML не прошёл локальную проверку: ${local.errors[0]}`), {
      status: 400,
      code: "AVITO_XML_INVALID",
    });
  }
  const upload = await deps.client.upload(deps.feedUrl);
  const current = await deps.client.currentUpload().catch(() => null);
  return {
    ok: true,
    uploaded: upload.ok,
    feedUrl: deps.feedUrl,
    offers: snapshot.offers,
    publishedAt: new Date().toISOString(),
    uploadStatus: upload.status ?? current,
  };
}
