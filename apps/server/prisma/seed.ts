/**
 * Демо-данные этапа 1 (из брифа).
 *
 * Правила обновления (не ломаем существующее):
 * - пользователь — один, обновляется;
 * - шаблоны культур — upsert по уникальному имени (позиции не трогаем:
 *   значения живут в плоском JSONB у позиций, подписи — в шаблоне);
 * - поставщики — upsert по id;
 * - позиции — создаются ТОЛЬКО если таблица пуста (не перезаписываем
 *   работу пользователя повторными сидами).
 *
 * Запуск: npm run db:seed
 */

import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/prisma.js";
import {
  SEED_CULTURES,
  SEED_POSITIONS,
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

  /* Позиции — только в пустую базу */
  const positionCount = await prisma.supplierPosition.count();
  if (positionCount > 0) {
    console.log(`  позиции: уже есть ${positionCount} — пропускаю (сид не перезаписывает)`);
    return;
  }

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
  console.log("Готово.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
