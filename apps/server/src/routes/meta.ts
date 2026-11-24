import type { FastifyInstance } from "fastify";

/** Мета: версия и готовность этапов. Фронт использует для статуса «Ещё» */
import { storageMode } from "../storage/factory.js";

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/meta", async () => ({
    ok: true,
    name: "АгроПост",
    version: "0.9.0",
    stage: 6,
    stages: {
      suppliers: true, // этап 1
      positions: true, // этап 1
      channels: true, // этап 2 (+ гео-ротация 2.1, подача 2.5)
      parser: true, // этап 2.5
      ai: true, // этап 3.0 (5 use cases)
      bot: true, // этап 3.2 (Telegram-бот, инбокс, автопостинг)
      deals: true, // этап 4 (сделки, доставка, документы, рекламации)
      advice: true, // этап 5 (расширенный контекст + аналитика)
      analytics: true, // этап 5 (сводка, каналы, позиции, readiness)
      storage: true, // этап 6 (единое хранилище: base64 | R2)
    },
    /* ЭТАП 6: режим файлового хранилища — фронт выбирает способ загрузки
       и показывает честное предупреждение про «файлы в БД». */
    storage: {
      mode: storageMode(process.env),
    },
  }));
}
