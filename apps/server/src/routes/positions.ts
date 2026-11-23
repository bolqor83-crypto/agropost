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
import { includePosition, mapPosition } from "../mappers.js";
import { computeSalePrice } from "@shared/pricing";
import { normalizeAttributes } from "@shared/attributes";
import type { AttributeField } from "@shared/types";

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
    const row = await prisma.supplierPosition.update({
      where: { id },
      data: {
        ...data,
        ...(attributes ? { attributes } : {}),
        salePrice: computeSalePrice(supplierPrice, markupPercent),
      },
      include: includePosition,
    });
    return mapPosition(row);
  });

  app.delete("/api/positions/:id", async (req) => {
    const { id } = req.params as { id: string };
    await prisma.supplierPosition.delete({ where: { id } });
    return { ok: true };
  });
}
