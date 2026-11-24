import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

/**
 * /api/channels — каталог каналов размещения (этап 2).
 * Фильтры: type, tag, region, q (поиск по названию).
 * Теги — словарь shared/channels.ts (в БД String[]).
 */

import { prisma } from "../prisma.js";
import { badRequest, conflict, notFound } from "../errors.js";
import {
  channelCreateSchema,
  channelTagSchema,
  channelTypeSchema,
  channelUpdateSchema,
  parseOrThrow,
} from "../validation.js";
import { includeChannel, mapChannel } from "../mappers.js";

function str(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function buildWhere(query: Record<string, unknown>): Prisma.ChannelWhereInput {
  const where: Prisma.ChannelWhereInput = {};
  const type = str(query["type"]);
  if (type) {
    const parsed = channelTypeSchema.safeParse(type);
    if (!parsed.success) throw badRequest("Неверный тип канала");
    where.type = parsed.data;
  }
  const tag = str(query["tag"]);
  if (tag) {
    const parsed = channelTagSchema.safeParse(tag);
    if (!parsed.success) throw badRequest("Неверный тег канала");
    where.tags = { has: parsed.data };
  }
  const region = str(query["region"]);
  if (region) where.region = { contains: region, mode: "insensitive" };
  const q = str(query["q"]);
  if (q) where.name = { contains: q, mode: "insensitive" };
  return where;
}

/** accountId из тела: проверяем существование, чтобы не подсунуть мусор. */
async function assertAccount(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw notFound("Аккаунт не найден");
}

function toDbDates(data: {
  lastActivityAt?: string | null;
}): { lastActivityAt?: Date | null } {
  if (data.lastActivityAt === undefined) return {};
  return { lastActivityAt: data.lastActivityAt ? new Date(data.lastActivityAt) : null };
}

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/channels", async (req) => {
    const query = req.query as Record<string, unknown>;
    const rows = await prisma.channel.findMany({
      where: buildWhere(query),
      orderBy: { createdAt: "asc" },
      include: includeChannel,
    });
    return rows.map(mapChannel);
  });

  app.post("/api/channels", async (req) => {
    const data = parseOrThrow(channelCreateSchema, req.body);
    if (data.accountId) await assertAccount(data.accountId);
    const row = await prisma.channel.create({
      data: {
        name: data.name,
        type: data.type,
        url: data.url,
        region: data.region,
        tags: data.tags,
        subscribersCount: data.subscribersCount ?? null,
        averageReach: data.averageReach ?? null,
        ...toDbDates(data),
        accountId: data.accountId ?? null,
        notes: data.notes ?? null,
      },
      include: includeChannel,
    });
    return mapChannel(row);
  });

  app.get("/api/channels/:id", async (req) => {
    const { id } = req.params as { id: string };
    const row = await prisma.channel.findUnique({ where: { id }, include: includeChannel });
    if (!row) throw notFound("Канал не найден");
    return mapChannel(row);
  });

  app.patch("/api/channels/:id", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(channelUpdateSchema, req.body);
    if (data.accountId) await assertAccount(data.accountId);
    const row = await prisma.channel.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.subscribersCount !== undefined ? { subscribersCount: data.subscribersCount } : {}),
        ...(data.averageReach !== undefined ? { averageReach: data.averageReach } : {}),
        ...toDbDates(data),
        ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      },
      include: includeChannel,
    });
    return mapChannel(row);
  });

  app.delete("/api/channels/:id", async (req) => {
    const { id } = req.params as { id: string };
    const listings = await prisma.listing.count({ where: { channelId: id } });
    if (listings > 0) {
      throw conflict("У канала есть размещения — сначала удалите их");
    }
    await prisma.channel.delete({ where: { id } });
    return { ok: true };
  });
}
