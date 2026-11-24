import type { FastifyInstance } from "fastify";

/**
 * /api/accounts — мультиаккаунты для размещения (этап 2).
 * Только учёт: платформа, телефон, статус, дневной лимит.
 * Счётчик usedToday растёт при «Отметить размещено» (листинги),
 * сбрасывается сам при смене дня. Сессий нет — автопостинг этапа 3.
 */

import { prisma } from "../prisma.js";
import { notFound } from "../errors.js";
import { accountCreateSchema, accountUpdateSchema, parseOrThrow } from "../validation.js";
import { mapAccount } from "../mappers.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/accounts", async () => {
    const rows = await prisma.account.findMany({
      orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapAccount);
  });

  app.post("/api/accounts", async (req) => {
    const data = parseOrThrow(accountCreateSchema, req.body);
    const row = await prisma.account.create({
      data: {
        platform: data.platform,
        phone: data.phone ?? null,
        status: data.status ?? "ACTIVE",
        dailyLimit: data.dailyLimit ?? 20,
        notes: data.notes ?? null,
      },
    });
    return mapAccount(row);
  });

  app.get("/api/accounts/:id", async (req) => {
    const { id } = req.params as { id: string };
    const row = await prisma.account.findUnique({ where: { id } });
    if (!row) throw notFound("Аккаунт не найден");
    return mapAccount(row);
  });

  app.patch("/api/accounts/:id", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(accountUpdateSchema, req.body);
    const row = await prisma.account.update({
      where: { id },
      data: {
        ...(data.platform !== undefined ? { platform: data.platform } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.dailyLimit !== undefined ? { dailyLimit: data.dailyLimit } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      },
    });
    return mapAccount(row);
  });

  app.delete("/api/accounts/:id", async (req) => {
    const { id } = req.params as { id: string };
    /* Каналы остаются: их accountId обнуляется (SetNull) */
    await prisma.account.delete({ where: { id } });
    return { ok: true };
  });
}
