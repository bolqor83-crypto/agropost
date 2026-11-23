import { PrismaClient } from "@prisma/client";

/**
 * Единственный экземпляр PrismaClient на процесс.
 * Соединение ленивое: без DATABASE_URL сервер стартует,
 * а /api/health отвечает (контракт ошибок — см. errors.ts).
 */

export const prisma = new PrismaClient();
