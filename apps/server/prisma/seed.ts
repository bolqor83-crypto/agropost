/**
 * Демо-данные этапов 1–2 (из брифа).
 *
 * Правила обновления (не ломаем существующее):
 * - пользователь — один, обновляется;
 * - шаблоны культур — upsert по уникальному имени (позиции не трогаем:
 *   значения живут в плоском JSONB у позиций, подписи — в шаблоне);
 * - поставщики — upsert по id;
 * - аккаунты и каналы — upsert по id;
 * - позиции — создаются ТОЛЬКО если таблица пуста (не перезаписываем
 *   работу пользователя повторными сидами).
 *
 * Запуск: npm run db:seed
 */

import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/prisma.js";
import {
  OBSOLETE_ROTATION_LISTING_IDS,
  OBSOLETE_SEED_CHANNEL_IDS,
  SEED_ACCOUNTS,
  SEED_CHANNELS,
  SEED_CULTURES,
  SEED_POSITIONS,
  SEED_ROTATION_LISTINGS,
  SEED_SUPPLIERS,
  SEED_USER,
  demoPhoto,
} from "../../../shared/seed-data.js";
import { computeSalePrice } from "../../../shared/pricing.js";

/* JSONB-поля Prisma требуют InputJson* — приводим схему атрибутов */
const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  console.log("Сеем демо-данные этапа 1…");

  /* Пользователь */
  const existingUser = await prisma.user.findFirst();
  if (existingUser) {
    await prisma.user.update({ where: { id: existingUser.id }, data: SEED_USER });
  } else {
    await prisma.user.create({ data: SEED_USER });
  }

  /* Шаблоны культур — upsert по имени */
  for (const culture of SEED_CULTURES) {
    await prisma.cultureTemplate.upsert({
      where: { name: culture.name },
      create: {
        id: culture.id,
        name: culture.name,
        type: culture.type,
        attributesSchema: asJson(culture.attributesSchema),
      },
      update: {
        type: culture.type,
        attributesSchema: asJson(culture.attributesSchema),
      },
    });
  }
  console.log(`  культуры: ${SEED_CULTURES.length}`);

  /* Поставщики — upsert по id */
  for (const supplier of SEED_SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      create: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        location: supplier.location,
        shippingMode: supplier.shippingMode,
        notes: supplier.notes,
      },
      update: {
        name: supplier.name,
        phone: supplier.phone,
        location: supplier.location,
        shippingMode: supplier.shippingMode,
        notes: supplier.notes,
      },
    });
  }
  console.log(`  поставщики: ${SEED_SUPPLIERS.length}`);

  /* Аккаунты (этап 2) — upsert по id; счётчики не трогаем */
  for (const account of SEED_ACCOUNTS) {
    const { id, ...fields } = account;
    await prisma.account.upsert({
      where: { id },
      create: { id, ...fields },
      update: fields,
    });
  }
  console.log(`  аккаунты: ${SEED_ACCOUNTS.length}`);

  /* Каналы (этап 2.5: реальные из исследования + подача/профиль) — upsert по id.
   * mirrorOf проставляем вторым проходом (self-FK: зеркальный канал уже создан). */
  for (const channel of SEED_CHANNELS) {
    const { id, activityDaysAgo, mirrorOf, ...fields } = channel;
    const data = {
      ...fields,
      lastActivityAt: activityDaysAgo !== null ? daysAgo(activityDaysAgo) : null,
    };
    await prisma.channel.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  for (const channel of SEED_CHANNELS) {
    if (!channel.mirrorOf) continue;
    await prisma.channel.update({
      where: { id: channel.id },
      data: { mirrorOf: channel.mirrorOf },
    });
  }
  console.log(`  каналы: ${SEED_CHANNELS.length} (реальные, из исследования)`);

  /* Этап 2.5: демо-каналы этапов 2/2.1 заменены — убираем их из базы
   * (только фиксированные демо-идентификаторы; пользовательские не трогаем).
   * Размещения при этом каскадно удаляются — история ротации пересеивается ниже. */
  for (const id of OBSOLETE_SEED_CHANNEL_IDS) {
    const removed = await prisma.channel.deleteMany({ where: { id } });
    if (removed.count > 0) console.log(`  удалён демо-канал ${id}`);
  }
  await prisma.listing.deleteMany({
    where: { id: { in: OBSOLETE_ROTATION_LISTING_IDS } },
  });

  /* Позиции — только в пустую базу */
  const positionCount = await prisma.supplierPosition.count();
  if (positionCount > 0) {
    console.log(`  позиции: уже есть ${positionCount} — пропускаю (сид не перезаписывает)`);
  } else {
    await seedPositions();
  }

  /* Этап 2.1→2.5: демо-история ротации — upsert по id (Новочеркасск
   * «размещали» 2 дня назад → cooldown; Таганрог — никогда →
   * recommendedCity = Таганрог). Позицию подставляем первую доступную —
   * реальные размещения пользователя не трогаем. */
  const demoPosition = await prisma.supplierPosition.findFirst({
    orderBy: { updatedAt: "asc" },
  });
  if (demoPosition) {
    for (const demo of SEED_ROTATION_LISTINGS) {
      const publishedAt = daysAgo(demo.publishedDaysAgo);
      await prisma.listing.upsert({
        where: { id: demo.id },
        create: {
          id: demo.id,
          positionId: demoPosition.id,
          channelId: demo.channelId,
          text: "Демо-размещение для гео-ротации (история cooldown).",
          status: "PUBLISHED",
          publishedAt,
          publishedCount: 1,
        },
        update: { status: "PUBLISHED", publishedAt, publishedCount: 1 },
      });
    }
    console.log(`  ротация: демо-история ${SEED_ROTATION_LISTINGS.length} размещения`);
  } else {
    console.log("  ротация: демо-история пропущена — нет позиций");
  }
  console.log("Готово.");
}

async function seedPositions(): Promise<void> {
  for (const position of SEED_POSITIONS) {
    const salePrice = computeSalePrice(position.supplierPrice, position.markupPercent);
    const created = await prisma.supplierPosition.create({
      data: {
        id: position.id,
        supplierId: position.supplierId,
        cultureId: position.cultureId,
        attributes: position.attributes,
        volumeKg: position.volumeKg,
        bagWeightKg: position.bagWeightKg,
        supplierPrice: position.supplierPrice,
        markupPercent: position.markupPercent,
        salePrice,
        minLotKg: position.minLotKg,
        hasCertificate: position.hasCertificate,
        status: position.status,
        updatedAt: daysAgo(position.updatedDaysAgo),
      },
    });

    /* Демо-фото: встроенные SVG-заглушки (data-URL) */
    const cultureName =
      SEED_CULTURES.find((c) => c.id === position.cultureId)?.name ?? "Позиция";
    for (let i = 1; i <= position.photoCount; i += 1) {
      await prisma.media.create({
        data: {
          positionId: created.id,
          type: "PHOTO",
          url: demoPhoto(cultureName, i),
          watermark: false,
        },
      });
    }

    for (const certificate of position.certificates) {
      /* fileUrl пустой: реальный PDF появится после настройки R2 */
      await prisma.certificate.create({
        data: {
          positionId: created.id,
          name: certificate.name,
          fileUrl: "",
          issuedAt: new Date(certificate.issuedAt),
        },
      });
    }
  }
  console.log(`  позиции: ${SEED_POSITIONS.length} (+ медиа и сертификаты)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
