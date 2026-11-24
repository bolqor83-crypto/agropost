/**
 * /api/deals — сделки (этап 4): CRUD, действия статусного графа
 * (к оплате / оплачено / отгрузить / доставлено / закрыть / отменить),
 * калькулятор доставки, генерация PDF-документов и их скачивание.
 */

import type { FastifyInstance } from "fastify";
import { positionName } from "@shared/attributes";
import type { ClaimDTO, DealDetailDTO, DealDTO, DocumentDTO } from "@shared/types";
import { ApiError, badRequest, notFound } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import {
  dealCalculateSchema,
  dealCreateSchema,
  dealListStatusSchema,
  dealPeriodSchema,
  dealShipSchema,
  dealUpdateSchema,
} from "../validation.js";
import { DocumentsError } from "../documents/types.js";
import { prismaDealsDb } from "../deals/db.js";
import {
  calculateDelivery,
  createDeal,
  dealAction,
  deleteDeal,
  findDocumentFile,
  generateDealDocument,
  getDealBundle,
  listDealDocuments,
  listDeals,
  updateDeal,
  type DealBundle,
} from "../deals/service.js";
import { planLogistics } from "../ai/service.js";
import type { DealRow } from "../deals/types.js";

const deps = { db: prismaDealsDb, planLogistics };

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** DocumentsError → 400 (реквизиты не заполнены). */
function mapDocumentsError<T>(p: Promise<T>): Promise<T> {
  return p.catch((err) => {
    if (err instanceof DocumentsError) {
      throw new ApiError(400, err.code, err.message);
    }
    throw err;
  });
}

function toDealDTO(row: DealRow): DealDTO {
  return {
    id: row.id,
    number: row.number,
    leadId: row.leadId,
    positionId: row.positionId,
    /* Этап 5.1: позиция могла быть удалена — из снимка (устойчивая история). */
    positionName: row.position
      ? positionName(row.position.cultureName, row.position.attributes)
      : row.itemName,
    buyerName: row.buyerName,
    buyerPhone: row.buyerPhone,
    buyerRegion: row.buyerRegion,
    buyerInn: row.buyerInn,
    volumeKg: row.volumeKg,
    salePrice: row.salePrice,
    supplierPrice: row.supplierPrice,
    taxMode: row.taxMode,
    taxAmount: row.taxAmount,
    margin: row.margin,
    revenue: round2(row.salePrice * row.volumeKg),
    deliveryMethod: row.deliveryMethod,
    deliveryCost: row.deliveryCost,
    deliveryToTerminalCost: row.deliveryToTerminalCost,
    deliveryPaidBy: "BUYER",
    status: row.status,
    paidAt: iso(row.paidAt),
    shippedAt: iso(row.shippedAt),
    deliveredAt: iso(row.deliveredAt),
    closedAt: iso(row.closedAt),
    supplierName: row.supplierName,
    supplierLocation: row.supplierLocation,
    shippingMode: row.shippingMode,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetailDTO(bundle: DealBundle): DealDetailDTO {
  const { deal, documents, claims, shipment } = bundle;
  return {
    ...toDealDTO(deal),
    shipment: shipment
      ? {
          id: shipment.id,
          dealId: shipment.dealId,
          carrierId: shipment.carrierId,
          carrierName: shipment.carrierName,
          method: shipment.method,
          fromCity: shipment.fromCity,
          toCity: shipment.toCity,
          cost: shipment.cost,
          days: shipment.days,
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          createdAt: shipment.createdAt.toISOString(),
        }
      : null,
    documents: documents.map(
      (d): DocumentDTO => ({
        id: d.id,
        dealId: d.dealId,
        type: d.type,
        number: d.number,
        generatedAt: d.generatedAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
      }),
    ),
    claims: claims.map(
      (c): ClaimDTO => ({
        id: c.id,
        dealId: c.dealId,
        description: c.description,
        photos: c.photos,
        status: c.status,
        resolution: c.resolution,
        forwardedToSupplier: c.forwardedToSupplier,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }),
    ),
  };
}

export async function dealsRoutes(app: FastifyInstance): Promise<void> {
  /* Список: ?status=ACTIVE|FINISHED|<статус>&q=&period=week|month|all */
  app.get("/api/deals", async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const status = query.status ? parseOrThrow(dealListStatusSchema, query.status) : undefined;
    const period = query.period ? parseOrThrow(dealPeriodSchema, query.period) : undefined;
    const rows = await listDeals({ status, period, q: query.q }, deps);
    return { ok: true, items: rows.map(toDealDTO) };
  });

  /* Калькулятор доставки: локальные ТК приоритетнее, потом по цене. */
  app.post("/api/deals/calculate-delivery", async (req) => {
    const input = parseOrThrow(dealCalculateSchema, req.body ?? {});
    return calculateDelivery(input, deps);
  });

  /* Создание сделки (из лида, из позиции или вручную) → DRAFT. */
  app.post("/api/deals", async (req) => {
    const input = parseOrThrow(dealCreateSchema, req.body ?? {});
    const deal = await mapDocumentsError(createDeal(input, deps));
    return {
      ok: true,
      ...toDealDTO(deal),
      shipment: null,
      documents: [] as DocumentDTO[],
      claims: [] as ClaimDTO[],
    };
  });

  /* Карточка с отгрузкой, документами и рекламациями. */
  app.get("/api/deals/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const bundle = await getDealBundle(id, deps);
    if (!bundle) throw notFound("Сделка не найдена");
    return { ok: true, ...toDetailDTO(bundle) };
  });

  /* Обновление полей (экономика пересчитывается) + допустимые переходы. */
  app.patch("/api/deals/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const input = parseOrThrow(dealUpdateSchema, req.body ?? {});
    await mapDocumentsError(updateDeal(id, input, deps));
    return { ok: true, ...toDetailDTO(await requireBundle(id)) };
  });

  app.delete("/api/deals/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    await mapDocumentsError(deleteDeal(id, deps));
    return { ok: true };
  });

  /* Действия статусного графа. */
  app.post("/api/deals/:id/awaiting-payment", async (req) => {
    await dealAction((req.params as { id: string }).id, "awaiting-payment", deps);
    return { ok: true, ...toDetailDTO(await requireBundle((req.params as { id: string }).id)) };
  });

  app.post("/api/deals/:id/pay", async (req) => {
    await dealAction((req.params as { id: string }).id, "pay", deps);
    return { ok: true, ...toDetailDTO(await requireBundle((req.params as { id: string }).id)) };
  });

  app.post("/api/deals/:id/ship", async (req) => {
    const id = (req.params as { id: string }).id;
    const ship = parseOrThrow(dealShipSchema, req.body ?? {});
    await dealAction(id, "ship", deps, ship);
    return { ok: true, ...toDetailDTO(await requireBundle(id)) };
  });

  app.post("/api/deals/:id/deliver", async (req) => {
    await dealAction((req.params as { id: string }).id, "deliver", deps);
    return { ok: true, ...toDetailDTO(await requireBundle((req.params as { id: string }).id)) };
  });

  app.post("/api/deals/:id/close", async (req) => {
    await dealAction((req.params as { id: string }).id, "close", deps);
    return { ok: true, ...toDetailDTO(await requireBundle((req.params as { id: string }).id)) };
  });

  app.post("/api/deals/:id/cancel", async (req) => {
    await dealAction((req.params as { id: string }).id, "cancel", deps);
    return { ok: true, ...toDetailDTO(await requireBundle((req.params as { id: string }).id)) };
  });

  /* Документы: список (без base64) и генерация PDF. */
  app.get("/api/deals/:id/documents", async (req) => {
    const id = (req.params as { id: string }).id;
    const docs = await listDealDocuments(id, deps);
    return {
      ok: true,
      items: docs.map(
        (d): DocumentDTO => ({
          id: d.id,
          dealId: d.dealId,
          type: d.type,
          number: d.number,
          generatedAt: d.generatedAt.toISOString(),
          createdAt: d.createdAt.toISOString(),
        }),
      ),
    };
  });

  app.post("/api/deals/:id/documents/:type", async (req) => {
    const params = req.params as { id: string; type: string };
    const type = normalizeDocumentType(params.type);
    const result = await mapDocumentsError(generateDealDocument(params.id, type, deps));
    const row = (await listDealDocuments(params.id, deps)).find((d) => d.number === result.number);
    if (!row) throw new ApiError(500, "INTERNAL", "Документ создан, но не найден");
    return {
      ok: true,
      document: {
        id: row.id,
        dealId: row.dealId,
        type: row.type,
        number: row.number,
        fileUrl: row.fileUrl,
        generatedAt: row.generatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      } satisfies DocumentDTO,
    };
  });

  /* Скачивание PDF: бинарный ответ с вложением.
     ЭТАП 6: R2-режим — редирект на публичный URL бакета. */
  app.get("/api/documents/:id/file", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const file = await mapDocumentsError(findDocumentFile(id, deps));
    if (file.kind === "remote") {
      reply.redirect(file.url, 302);
      return reply;
    }
    reply.header("Content-Type", "application/pdf");
    reply.header(
      "Content-Disposition",
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(`${file.number}.pdf`)}`,
    );
    reply.send(file.buffer);
    return reply;
  });
}

function normalizeDocumentType(
  raw: string,
): "INVOICE" | "CONTRACT" | "TRANSPORT_NOTE" | "UPD" {
  const t = raw.trim().toLowerCase();
  const map: Record<string, "INVOICE" | "CONTRACT" | "TRANSPORT_NOTE" | "UPD"> = {
    invoice: "INVOICE",
    schet: "INVOICE",
    contract: "CONTRACT",
    dogovor: "CONTRACT",
    transport_note: "TRANSPORT_NOTE",
    tn: "TRANSPORT_NOTE",
    upd: "UPD",
  };
  const result = map[t] ?? (raw.trim().toUpperCase() as typeof map[string]);
  if (!["INVOICE", "CONTRACT", "TRANSPORT_NOTE", "UPD"].includes(result)) {
    throw badRequest("Неизвестный тип документа (invoice | contract | transport_note | upd)");
  }
  return result;
}

async function requireBundle(id: string): Promise<DealBundle> {
  const bundle = await getDealBundle(id, deps);
  if (!bundle) throw notFound("Сделка не найдена");
  return bundle;
}
