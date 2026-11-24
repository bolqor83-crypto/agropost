/**
 * Патч 4.1: обновляет в базе ТОЛЬКО шаблоны культур (attributesSchema
 * с displayType) — пользователя, позиции, каналы и счётчики не трогает.
 * Безопасно для прод-базы: upsert по уникальному имени культуры.
 *
 * Запуск: cd apps/server && DATABASE_URL=<Neon> bun run scripts/update-culture-templates.ts
 */

import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/prisma.js";
import { SEED_CULTURES } from "../../../shared/seed-data.js";

const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function main(): Promise<void> {
  for (const culture of SEED_CULTURES) {
    const updated = await prisma.cultureTemplate.upsert({
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
    const fields = culture.attributesSchema
      .map((f) => `${f.key}:${f.displayType ?? "(по типу)"}`)
      .join(" ");
    console.log(`✓ ${updated.name} — ${fields}`);
  }
  console.log("Готово: шаблоны культур обновлены (позиции не тронуты).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
