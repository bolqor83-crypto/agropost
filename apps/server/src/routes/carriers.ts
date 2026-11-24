/**
 * /api/carriers — справочник транспортных компаний (этап 4).
 * Сид: ПЭК, СДЭК (Павловская), локальные + Деловые Линии (Краснодар).
 */

import type { FastifyInstance } from "fastify";
import type { CarrierDTO } from "@shared/types";
import { parseOrThrow } from "../validation.js";
import { carrierCreateSchema } from "../validation.js";
import { prismaDealsDb } from "../deals/db.js";
import { createCarrier, listCarriers } from "../deals/service.js";
import type { CarrierRow } from "../deals/types.js";

const deps = { db: prismaDealsDb };

function toCarrierDTO(row: CarrierRow): CarrierDTO {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    pickupAvailable: row.pickupAvailable,
    isLocal: row.isLocal,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function carrierRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/carriers", async () => {
    const rows = await listCarriers(deps);
    return { ok: true, items: rows.map(toCarrierDTO) };
  });

  app.post("/api/carriers", async (req) => {
    const input = parseOrThrow(carrierCreateSchema, req.body ?? {});
    const row = await createCarrier(input, deps);
    return { ok: true, ...toCarrierDTO(row) };
  });
}
