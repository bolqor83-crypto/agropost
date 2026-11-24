import type { FastifyInstance } from "fastify";

/** Мета: версия и готовность этапов. Фронт использует для статуса «Ещё». */
export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/meta", async () => ({
    ok: true,
    name: "АгроПост",
    version: "0.8.0",
    stage: 5,
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
    },
  }));
}
