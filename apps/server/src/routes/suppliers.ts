import type { FastifyInstance } from "fastify";

/**
 * /api/suppliers — справочник поставщиков.
 * WHITE-LABEL: данные поставщика видны только внутри приложения.
 */

import { prisma } from "../prisma.js";
import { conflict, notFound } from "../errors.js";
import { parseOrThrow, supplierCreateSchema, supplierUpdateSchema } from "../validation.js";
import { includeSupplier, mapSupplier } from "../mappers.js";

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/suppliers", async () => {
    const rows = await prisma.supplier.findMany({
      orderBy: { createdAt: "asc" },
      include: includeSupplier,
    });
    return rows.map(mapSupplier);
  });

  app.post("/api/suppliers", async (req) => {
    const data = parseOrThrow(supplierCreateSchema, req.body);
    const row = await prisma.supplier.create({ data, include: includeSupplier });
    return mapSupplier(row);
  });

  app.get("/api/suppliers/:id", async (req) => {
    const { id } = req.params as { id: string };
    const row = await prisma.supplier.findUnique({ where: { id }, include: includeSupplier });
    if (!row) throw notFound("Поставщик не найден");
    return mapSupplier(row);
  });

  app.patch("/api/suppliers/:id", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(supplierUpdateSchema, req.body);
    const row = await prisma.supplier.update({ where: { id }, data, include: includeSupplier });
    return mapSupplier(row);
  });

  app.delete("/api/suppliers/:id", async (req) => {
    const { id } = req.params as { id: string };
    const positions = await prisma.supplierPosition.count({ where: { supplierId: id } });
    if (positions > 0) {
      throw conflict("У поставщика есть позиции — сначала удалите или перенесите их");
    }
    await prisma.supplier.delete({ where: { id } });
    return { ok: true };
  });
}
