import type { FastifyInstance } from "fastify";

/**
 * /api/user — профиль единственного пользователя (налоговый режим).
 * Нужен для расчёта маржи «после налога». Настройки профиля — этап 4.
 */

import { prisma } from "../prisma.js";
import type { UserDTO } from "@shared/types";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/user", async (): Promise<UserDTO | null> => {
    const row = await prisma.user.findFirst();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      inn: row.inn,
      taxMode: row.taxMode,
      taxRate: Number(row.taxRate),
    };
  });
}
