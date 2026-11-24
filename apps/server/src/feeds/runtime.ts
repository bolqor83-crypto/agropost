/**
 * ЭТАП 9 — прод-зависимости сервиса фидов (Prisma).
 *
 * Отдельно от service.ts: сам сервис чистый (тестируется на фикстурах),
 * здесь только погрузчик строк из БД. Инъекция — routes и Авито-флоу
 * получают один и тот же синглтон (общий кэш 1 ч на оба фида).
 */

import { prisma } from "../prisma.js";
import { createFeedService, type FeedService } from "./service.js";
import type { FeedOwnerRow, FeedPositionRow } from "./data.js";
import type { AvitoCategoryMap } from "./avito-xml.js";
import { currentAvitoConfig } from "../publishers/avito/runtime.js";

let singleton: FeedService | null = null;

/* Тесты: подмена фабрики сервиса (фикстуры вместо Prisma). */
let factoryOverride: (() => FeedService) | null = null;

export function setFeedServiceFactory(factory: (() => FeedService) | null): void {
  factoryOverride = factory;
}

/** Синглтон: общий кэш снапшота для YML и Авито-фида. */
export function getFeedService(): FeedService {
  if (factoryOverride) return factoryOverride();
  if (!singleton) {
    singleton = createFeedService({ loadRows, loadOwner, loadAvitoOptions });
  }
  return singleton;
}

/** Позиции IN_STOCK с культурой, поставщиком и медиа — для фида. */
async function loadRows(): Promise<FeedPositionRow[]> {
  const rows = await prisma.supplierPosition.findMany({
    where: { status: "IN_STOCK" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      attributes: true,
      volumeKg: true,
      bagWeightKg: true,
      minLotKg: true,
      salePrice: true,
      hasCertificate: true,
      supplier: { select: { location: true } },
      culture: { select: { id: true, name: true, type: true, attributesSchema: true } },
      media: { orderBy: { createdAt: "asc" }, select: { type: true, url: true } },
    },
  });
  return rows.map((row) => ({
    ...row,
    salePrice: Number(row.salePrice),
    attributes: (row.attributes ?? {}) as unknown as FeedPositionRow["attributes"],
    culture: {
      ...row.culture,
      attributesSchema: (row.culture.attributesSchema ?? []) as unknown as FeedPositionRow["culture"]["attributesSchema"],
    },
  }));
}

async function loadOwner(): Promise<FeedOwnerRow | null> {
  const owner = await prisma.user.findFirst({ select: { name: true } });
  return owner ? { name: owner.name } : null;
}

async function loadAvitoOptions(): Promise<{
  contactPhone: string | null;
  categories: AvitoCategoryMap;
}> {
  const config = await currentAvitoConfig();
  return { contactPhone: config.contactPhone, categories: config.categories };
}
