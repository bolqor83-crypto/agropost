import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

/**
 * /api/positions — позиции поставщиков.
 * Фильтры: type (семена/орех), cultureId, supplierId, status, q (поиск
 * по культуре и сорту). salePrice всегда пересчитывается на сервере.
 */

import { prisma } from "../prisma.js";
import { badRequest, notFound } from "../errors.js";
import {
  parseOrThrow,
  positionCreateSchema,
  positionStatusSchema,
  positionUpdateSchema,
} from "../validation.js";
import { includeChannel, includePosition, mapChannel, mapPosition } from "../mappers.js";
import { computeSalePrice } from "@shared/pricing";
import { normalizeAttributes } from "@shared/attributes";
import { rankForRotation, buildRotation, withRotationInfo } from "@shared/rotation";
import { aggregateMarket, MARKET_WINDOW_DAYS, marketQueriesFor } from "@shared/market";
import type { AttributeField, MarketDTO, MarketSampleDTO } from "@shared/types";
import { invalidateAiCache } from "../ai/cache.js";

function buildWhere(query: Record<string, unknown>): Prisma.SupplierPositionWhereInput {
  const where: Prisma.SupplierPositionWhereInput = {};
  const type = positionTypeFilter(query["type"]);
  if (type) where.culture = { type };
  const cultureId = str(query["cultureId"]);
  if (cultureId) where.cultureId = cultureId;
  const supplierId = str(query["supplierId"]);
  if (supplierId) where.supplierId = supplierId;
  const status = str(query["status"]);
  if (status) {
    const parsed = positionStatusSchema.safeParse(status);
    if (!parsed.success) throw badRequest("Неверный статус позиции");
    where.status = parsed.data;
  }
  const q = str(query["q"]);
  if (q) {
    where.OR = [
      { culture: { name: { contains: q, mode: "insensitive" } } },
      { attributes: { path: ["sort"], string_contains: q } },
    ];
  }
  return where;
}

function str(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

/* Этап 2.5: рынок — кэш в памяти на 24 ч (обновление раз в день по ТЗ).
 * Инвалидация — POST /api/parser/run (routes/parser.ts). */
const marketCache = new Map<string, { at: number; data: MarketDTO }>();
const MARKET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function invalidateMarketCache(): void {
  marketCache.clear();
}

function positionTypeFilter(value: unknown): "SEED" | "NUT" | null {
  const v = str(value);
  if (v === "SEED" || v === "NUT") return v;
  return null;
}

export async function positionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/positions", async (req) => {
    const query = req.query as Record<string, unknown>;
    const rows = await prisma.supplierPosition.findMany({
      where: buildWhere(query),
      orderBy: { updatedAt: "desc" },
      include: includePosition,
    });
    return rows.map(mapPosition);
  });

  app.post("/api/positions", async (req) => {
    const data = parseOrThrow(positionCreateSchema, req.body);
    const culture = await prisma.cultureTemplate.findUnique({ where: { id: data.cultureId } });
    if (!culture) throw notFound("Культура не найдена");
    const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
    if (!supplier) throw notFound("Поставщик не найден");
    const attributes = normalizeAttributes(
      culture.attributesSchema as unknown as AttributeField[],
      data.attributes,
    );
    const salePrice = computeSalePrice(data.supplierPrice, data.markupPercent);
    const row = await prisma.supplierPosition.create({
      data: {
        supplierId: data.supplierId,
        cultureId: data.cultureId,
        attributes,
        volumeKg: data.volumeKg,
        bagWeightKg: data.bagWeightKg,
        supplierPrice: data.supplierPrice,
        markupPercent: data.markupPercent,
        salePrice,
        minLotKg: data.minLotKg,
        hasCertificate: data.hasCertificate ?? false,
        status: data.status ?? "IN_STOCK",
        /* Этап 5.1: фактическое начало наличия — для честных дней
           в аналитике (старым позициям не выдумываем дату: null). */
        ...(data.status === undefined || data.status === "IN_STOCK"
          ? { stockSince: new Date() }
          : {}),
      },
      include: includePosition,
    });
    return mapPosition(row);
  });

  app.get("/api/positions/:id", async (req) => {
    const { id } = req.params as { id: string };
    const row = await prisma.supplierPosition.findUnique({ where: { id }, include: includePosition });
    if (!row) throw notFound("Позиция не найдена");
    return mapPosition(row);
  });

  app.patch("/api/positions/:id", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(positionUpdateSchema, req.body);
    const current = await prisma.supplierPosition.findUnique({ where: { id } });
    if (!current) throw notFound("Позиция не найдена");

    /* Смена культуры требует заново передать атрибуты под новую схему. */
    const cultureChanged = data.cultureId && data.cultureId !== current.cultureId;
    if (cultureChanged && !data.attributes) {
      throw badRequest("При смене культуры заполните атрибуты под новый шаблон");
    }
    let attributes = undefined;
    if (data.attributes) {
      const culture = cultureChanged
        ? await prisma.cultureTemplate.findUnique({ where: { id: data.cultureId! } })
        : await prisma.cultureTemplate.findUnique({ where: { id: current.cultureId } });
      if (!culture) throw notFound("Культура не найдена");
      attributes = normalizeAttributes(
        culture.attributesSchema as unknown as AttributeField[],
        data.attributes,
      );
    }
    if (data.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
      if (!supplier) throw notFound("Поставщик не найден");
    }

    const supplierPrice = data.supplierPrice ?? Number(current.supplierPrice);
    const markupPercent = data.markupPercent ?? Number(current.markupPercent);
    /* Этап 5.1: переход в IN_STOCK фиксирует начало ТЕКУЩЕГО периода
       наличия (дни в наличии = непрерывный период). OUT_OF_STOCK →
       возврат позже обновит дату — это новый период наличия. */
    const returningInStock =
      data.status === "IN_STOCK" && current.status !== "IN_STOCK";
    const row = await prisma.supplierPosition.update({
      where: { id },
      data: {
        ...data,
        ...(attributes ? { attributes } : {}),
        ...(returningInStock ? { stockSince: new Date() } : {}),
        salePrice: computeSalePrice(supplierPrice, markupPercent),
      },
      include: includePosition,
    });
    /* Этап 3.0: позиция изменилась — AI-кэш по ней устарел. */
    invalidateAiCache({ positionId: id });
    return mapPosition(row);
  });

  app.delete("/api/positions/:id", async (req) => {
    const { id } = req.params as { id: string };
    await prisma.supplierPosition.delete({ where: { id } });
    invalidateAiCache({ positionId: id });
    return { ok: true };
  });

  /* Этап 2 + 2.1: умный подбор каналов под позицию — с гео-ротацией.
   * Сортировка: тег вида товара → свой регион → «не публиковали/давно»
   * (cooldown-каналы вниз с бейджем) → активность → охват.
   * rotation — виджет ротации по городам, если в одном регионе ≥2 городов. */
  app.post("/api/positions/:id/suggest-channels", async (req) => {
    const { id } = req.params as { id: string };
    const position = await prisma.supplierPosition.findUnique({
      where: { id },
      include: { culture: true },
    });
    if (!position) throw notFound("Позиция не найдена");
    const channels = await prisma.channel.findMany({ include: includeChannel });
    const published = await prisma.listing.findMany({
      where: { status: "PUBLISHED" },
      select: { channelId: true, publishedAt: true },
    });
    const mapped = channels.map(mapChannel);
    const ranked = rankForRotation(mapped, published, position.culture.type, 5);
    const rotation = buildRotation(mapped, published, position.culture.type);
    return {
      positionId: id,
      channels: withRotationInfo(ranked, published),
      ...(rotation ? { rotation } : {}),
    };
  });

  /* Этап 2.5: рынок по культуре позиции — агрегаты CompetitorPrice. */
  app.get("/api/positions/:id/market", async (req) => {
    const { id } = req.params as { id: string };
    const cached = marketCache.get(id);
    if (cached && Date.now() - cached.at < MARKET_CACHE_TTL_MS) {
      return cached.data;
    }
    const position = await prisma.supplierPosition.findUnique({
      where: { id },
      include: { culture: true },
    });
    if (!position) throw notFound("Позиция не найдена");
    const queries = marketQueriesFor(position.culture.name);
    const since = new Date(Date.now() - MARKET_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.competitorPrice.findMany({
      where: {
        OR: queries.map((q) => ({ query: { equals: q, mode: "insensitive" } })),
        fetchedAt: { gte: since },
      },
      orderBy: { fetchedAt: "desc" },
    });
    const data: MarketDTO = {
      ...aggregateMarket(
        id,
        position.culture.name,
        queries,
        rows.map((r) => ({
          id: r.id,
          source: r.source,
          price: Number(r.price),
          unit: r.unit,
          region: r.region,
          sellerName: r.sellerName,
          link: r.link,
          fetchedAt: r.fetchedAt.toISOString(),
        })),
      ),
      samples: rows.slice(0, 5).map<MarketSampleDTO>((r) => ({
        id: r.id,
        source: r.source,
        price: Number(r.price),
        unit: r.unit,
        region: r.region,
        sellerName: r.sellerName,
        link: r.link,
        fetchedAt: r.fetchedAt.toISOString(),
      })),
    };
    /* Пустой результат НЕ кэшируем: до первого прогона парсера строки
     * появятся позже, а TTL 24 ч их бы спрятал. */
    if (data.count > 0) {
      marketCache.set(id, { at: Date.now(), data });
    }
    return data;
  });
}