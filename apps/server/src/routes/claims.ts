/**
 * /api/claims — рекламации покупателей (этап 4). Пользователь отвечает
 * перед покупателем и может переадресовать претензию поставщику
 * (внутри приложения; покупателю поставщик не виден).
 */

import type { FastifyInstance } from "fastify";
import type { ClaimDTO } from "@shared/types";
import { notFound } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import { claimCreateSchema, claimStatusSchema, claimUpdateSchema } from "../validation.js";
import { prismaDealsDb } from "../deals/db.js";
import { createClaim, listClaims, updateClaim } from "../deals/service.js";
import type { ClaimRow } from "../deals/types.js";

const deps = { db: prismaDealsDb };

function toClaimDTO(row: ClaimRow): ClaimDTO {
  return {
    id: row.id,
    dealId: row.dealId,
    description: row.description,
    photos: row.photos,
    status: row.status,
    resolution: row.resolution,
    forwardedToSupplier: row.forwardedToSupplier,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function claimsRoutes(app: FastifyInstance): Promise<void> {
  /* Список: ?dealId=…&status=… */
  app.get("/api/claims", async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const status = query.status ? parseOrThrow(claimStatusSchema, query.status) : undefined;
    const dealId = query.dealId?.trim() || undefined;
    const rows = await listClaims({ dealId, status }, deps);
    return { ok: true, items: rows.map(toClaimDTO) };
  });

  /* Создать рекламацию по сделке. */
  app.post("/api/claims", async (req) => {
    const input = parseOrThrow(claimCreateSchema, req.body ?? {});
    const row = await createClaim(input, deps);
    return { ok: true, ...toClaimDTO(row) };
  });

  /* Статус, решение, переадресация поставщику. */
  app.patch("/api/claims/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const input = parseOrThrow(claimUpdateSchema, req.body ?? {});
    const row = await updateClaim(id, input, deps);
    if (!row) throw notFound("Рекламация не найдена");
    return { ok: true, ...toClaimDTO(row) };
  });
}
