import type { FastifyInstance } from "fastify";

/** Мета: версия и готовность этапов. Фронт использует для статуса «Ещё». */
export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/meta", async () => ({
    ok: true,
    name: "АгроПост",
    version: "0.2.0",
    stage: 1,
    stages: {
      suppliers: true, // этап 1
      positions: true, // этап 1
      channels: false, // этап 2
      parser: false, // этап 2.5
      ai: false, // этап 3
      deals: false, // этап 4
      advice: false, // этап 5
    },
  }));
}
