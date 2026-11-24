import type { FastifyInstance } from "fastify";

/** Health-check: Render использует его для мониторинга. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
    service: "agropost-api",
    stage: 3.2,
    time: new Date().toISOString(),
  }));
}
