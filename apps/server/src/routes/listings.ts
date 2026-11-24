import type { FastifyInstance } from "fastify";

/**
 * /api/listings — размещения (этап 2 + 2.1).
 * POST собирает черновик текста из позиции: шаблонный текст в
 * shared/listing-text.ts, платформа — по типу канала.
 *
 * WHITE-LABEL: в тексте нет имени поставщика — только регион отгрузки.
 * «Отметить размещено» (PUBLISHED) проставляет publishedAt и incr-ит
 * счётчик usedToday у аккаунта канала (со сбросом при смене дня).
 *
 * Этап 2.1: POST идемпотентен по паре (позиция, канал) — повторный запуск
 * потока возвращает существующий черновик, дублей не создаёт.
 * Повторная отметка PUBLISHED обновляет publishedAt и наращивает
 * publishedCount — без создания нового размещения.
 */

import { prisma } from "../prisma.js";
import { notFound } from "../errors.js";
import { listingCreateSchema, listingUpdateSchema, parseOrThrow } from "../validation.js";
import { includeListing, includePosition, mapListing, mapPosition } from "../mappers.js";
import { buildListing, listingPlatformForChannel } from "@shared/listing-text";
import { SUPPLIER_LOCATION_REGION } from "@shared/labels";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** +1 к счётчику дня аккаунта (сброс при смене дня). */
async function bumpAccountUsage(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return;
  const now = new Date();
  const sameDay = account.usedDate ? isSameDay(account.usedDate, now) : false;
  await prisma.account.update({
    where: { id: accountId },
    data: {
      usedToday: sameDay ? account.usedToday + 1 : 1,
      usedDate: now,
    },
  });
}

export async function listingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/listings", async (req) => {
    const query = req.query as Record<string, unknown>;
    const positionId = typeof query["positionId"] === "string" ? query["positionId"] : null;
    const limitRaw = Number(query["limit"] ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
    const rows = await prisma.listing.findMany({
      where: positionId ? { positionId } : undefined,
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: includeListing,
    });
    return rows.map(mapListing);
  });

  app.post("/api/listings", async (req) => {
    const data = parseOrThrow(listingCreateSchema, req.body);

    const position = await prisma.supplierPosition.findUnique({
      where: { id: data.positionId },
      include: includePosition,
    });
    if (!position) throw notFound("Позиция не найдена");
    const channel = await prisma.channel.findUnique({
      where: { id: data.channelId },
    });
    if (!channel) throw notFound("Канал не найден");

    /* Этап 2.1: дубль не создаём — для пары (позиция, канал) возвращаем
     * существующее размещение (повторный запуск потока «Разместить»). */
    const existing = await prisma.listing.findFirst({
      where: { positionId: data.positionId, channelId: data.channelId },
      orderBy: { createdAt: "desc" },
      include: includeListing,
    });
    if (existing) return mapListing(existing);

    /* Текст: свой или шаблонный (white-label: только регион, без поставщика) */
    const mapped = mapPosition(position);
    const text =
      data.text ??
      buildListing(
        mapped,
        mapped.culture,
        SUPPLIER_LOCATION_REGION[mapped.supplier.location],
        mapped.salePrice,
        listingPlatformForChannel(channel.type),
      );

    const row = await prisma.listing.create({
      data: {
        positionId: data.positionId,
        channelId: data.channelId,
        text,
        status: "DRAFT",
      },
      include: includeListing,
    });
    return mapListing(row);
  });

  app.patch("/api/listings/:id", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(listingUpdateSchema, req.body);

    const current = await prisma.listing.findUnique({ where: { id } });
    if (!current) throw notFound("Размещение не найдено");

    const wasPublished = current.status === "PUBLISHED";
    const row = await prisma.listing.update({
      where: { id },
      data: {
        ...(data.text !== undefined ? { text: data.text } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        /* Этап 2.1: каждая отметка PUBLISHED — обновляет дату и счётчик;
         * дубль не создаём, аккаунт — только при первом переходе. */
        ...(data.status === "PUBLISHED"
          ? { publishedAt: new Date(), publishedCount: { increment: 1 } }
          : {}),
      },
      include: includeListing,
    });

    if (data.status === "PUBLISHED" && !wasPublished && row.channel.accountId) {
      await bumpAccountUsage(row.channel.accountId);
    }

    return mapListing(row);
  });

  app.delete("/api/listings/:id", async (req) => {
    const { id } = req.params as { id: string };
    await prisma.listing.delete({ where: { id } });
    return { ok: true };
  });
}
