import type { FastifyInstance } from "fastify";

/**
 * /api/cultures — шаблоны культур (схемы атрибутов позиций).
 *
 * Обновление шаблона НЕ трогает существующие позиции: значения лежат
 * в плоском JSONB у позиции, подписи/порядок — здесь. Новые ключи
 * у старых позиций просто отсутствуют (UI покажет «—»).
 */

import { prisma } from "../prisma.js";
import { conflict, notFound } from "../errors.js";
import { cultureCreateSchema, cultureUpdateSchema, parseOrThrow } from "../validation.js";
import { includeCulture, mapCulture } from "../mappers.js";

export async function cultureRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/cultures", async () => {
    const rows = await prisma.cultureTemplate.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: includeCulture,
    });
    return rows.map(mapCulture);
  });

  app.post("/api/cultures", async (req) => {
    const data = parseOrThrow(cultureCreateSchema, req.body);
    const existing = await prisma.cultureTemplate.findUnique({ where: { name: data.name } });
    if (existing) throw conflict("Культура с таким названием уже есть");
    const row = await prisma.cultureTemplate.create({ data, include: includeCulture });
    return mapCulture(row);
  });

  app.get("/api/cultures/:id", async (req) => {
    const { id } = req.params as { id: string };
    const row = await prisma.cultureTemplate.findUnique({ where: { id }, include: includeCulture });
    if (!row) throw notFound("Культура не найдена");
    return mapCulture(row);
  });

  app.patch("/api/cultures/:id", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(cultureUpdateSchema, req.body);
    const row = await prisma.cultureTemplate.update({ where: { id }, data, include: includeCulture });
    return mapCulture(row);
  });

  app.delete("/api/cultures/:id", async (req) => {
    const { id } = req.params as { id: string };
    const positions = await prisma.supplierPosition.count({ where: { cultureId: id } });
    if (positions > 0) {
      throw conflict("По культуре есть позиции — сначала удалите или смените им культуру");
    }
    await prisma.cultureTemplate.delete({ where: { id } });
    return { ok: true };
  });
}
