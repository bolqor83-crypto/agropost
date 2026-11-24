/**
 * Prisma-реализация интерфейса DealsDb (этап 4).
 * Decimal → number, include позиции с культурой и поставщиком.
 */

import { ACTIVE_DEAL_STATUSES } from "@shared/deals";
import type { ClaimStatus, DocumentType } from "@shared/types";
import { prisma } from "../prisma.js";
import type {
  CarrierRow,
  ClaimRow,
  DealListStatus,
  DealRow,
  DealsDb,
  DocumentRow,
  ListDealsFilter,
  PositionRow,
  SellerRow,
  ShipmentRow,
} from "./types.js";

const num = (d: unknown): number => Number(d ?? 0);

function toSellerRow(row: {
  id: string;
  name: string;
  inn: string | null;
  ogrnip: string | null;
  address: string | null;
  bank: string | null;
  bik: string | null;
  account: string | null;
  taxMode: string;
  taxRate: unknown;
}): SellerRow {
  return {
    id: row.id,
    name: row.name,
    inn: row.inn,
    ogrnip: row.ogrnip,
    address: row.address,
    bank: row.bank,
    bik: row.bik,
    account: row.account,
    taxMode: row.taxMode as SellerRow["taxMode"],
    taxRate: num(row.taxRate),
  };
}

type PrismaPosition = {
  id: string;
  cultureId: string;
  attributes: unknown;
  volumeKg: number;
  bagWeightKg: number;
  supplierPrice: unknown;
  salePrice: unknown;
  supplier?: { location: string; name: string; shippingMode: string } | null;
  culture?: { name: string; type: string } | null;
};

function toPositionRow(row: PrismaPosition): PositionRow {
  return {
    id: row.id,
    cultureId: row.cultureId,
    cultureName: row.culture?.name ?? "",
    cultureType: (row.culture?.type ?? "SEED") as "SEED" | "NUT",
    attributes: (row.attributes ?? {}) as Record<string, string | number>,
    volumeKg: row.volumeKg,
    bagWeightKg: row.bagWeightKg,
    supplierPrice: num(row.supplierPrice),
    salePrice: num(row.salePrice),
    supplierLocation: (row.supplier?.location ?? "OTHER") as PositionRow["supplierLocation"],
    supplierName: row.supplier?.name ?? "",
    supplierShippingMode: (row.supplier?.shippingMode ?? "BOTH") as PositionRow["supplierShippingMode"],
  };
}

const positionInclude = {
  position: { include: { culture: true, supplier: true } },
} as const;

function toDealRow(row: Record<string, unknown>): DealRow {
  const position = row.position ? toPositionRow(row.position as PrismaPosition) : null;
  return {
    id: row.id as string,
    number: row.number as string,
    leadId: (row.leadId as string | null) ?? null,
    positionId: (row.positionId as string | null) ?? null,
    position,
    buyerName: row.buyerName as string,
    buyerPhone: row.buyerPhone as string,
    buyerRegion: row.buyerRegion as string,
    buyerInn: (row.buyerInn as string | null) ?? null,
    volumeKg: num(row.volumeKg),
    salePrice: num(row.salePrice),
    supplierPrice: num(row.supplierPrice),
    taxMode: row.taxMode as DealRow["taxMode"],
    taxAmount: num(row.taxAmount),
    margin: num(row.margin),
    deliveryMethod: row.deliveryMethod as DealRow["deliveryMethod"],
    deliveryCost: row.deliveryCost === null || row.deliveryCost === undefined ? null : num(row.deliveryCost),
    status: row.status as DealRow["status"],
    paidAt: (row.paidAt as Date | null) ?? null,
    shippedAt: (row.shippedAt as Date | null) ?? null,
    deliveredAt: (row.deliveredAt as Date | null) ?? null,
    closedAt: (row.closedAt as Date | null) ?? null,
    itemName: (row.itemName as string | null) ?? null,
    itemCulture: (row.itemCulture as string | null) ?? null,
    itemAttributes: (row.itemAttributes ?? null) as Record<string, string | number> | null,
    supplierName: (row.supplierName as string | null) ?? null,
    supplierLocation: (row.supplierLocation as string | null) ?? null,
    shippingMode: (row.shippingMode as string | null) ?? null,
    deliveryToTerminalCost:
      row.deliveryToTerminalCost === null || row.deliveryToTerminalCost === undefined
        ? null
        : num(row.deliveryToTerminalCost),
    notes: (row.notes as string | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

function periodStart(period: "all" | "week" | "month"): Date | null {
  if (period === "week" || period === "month") {
    const days = period === "week" ? 7 : 31;
    return new Date(Date.now() - days * 24 * 3600 * 1000);
  }
  return null;
}

export const prismaDealsDb: DealsDb = {
  async findUser() {
    const row = await prisma.user.findFirst();
    return row ? toSellerRow(row) : null;
  },

  async findPosition(id) {
    const row = await prisma.supplierPosition.findUnique({
      where: { id },
      include: { culture: true, supplier: true },
    });
    return row ? toPositionRow(row) : null;
  },

  async findLead(id) {
    const row = await prisma.lead.findUnique({ where: { id } });
    if (!row) return null;
    return {
      id: row.id,
      source: row.source,
      externalId: row.externalId,
      externalUsername: row.externalUsername,
      name: row.name,
      phone: row.phone,
      region: row.region,
      positionId: row.positionId,
    };
  },

  async listDeals(filter: ListDealsFilter) {
    const status = filter.status;
    const createdAfter = periodStart(filter.period ?? "all");
    const q = filter.q?.trim();
    const rows = await prisma.deal.findMany({
      where: {
        ...(status === "ACTIVE"
          ? { status: { in: ACTIVE_DEAL_STATUSES } }
          : status === "FINISHED"
            ? { status: "CLOSED" }
            : status
              ? { status }
              : {}),
        ...(createdAfter ? { createdAt: { gte: createdAfter } } : {}),
        ...(q
          ? {
              OR: [
                { number: { contains: q, mode: "insensitive" } },
                { buyerName: { contains: q, mode: "insensitive" } },
                { buyerRegion: { contains: q, mode: "insensitive" } },
                { notes: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: positionInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => toDealRow(r as unknown as Record<string, unknown>));
  },

  async countDeals() {
    return prisma.deal.count();
  },

  async findDeal(id) {
    const row = await prisma.deal.findUnique({ where: { id }, include: positionInclude });
    return row ? toDealRow(row as unknown as Record<string, unknown>) : null;
  },

  async createDeal(data) {
    const row = await prisma.deal.create({
      data: {
        number: data.number,
        leadId: data.leadId,
        positionId: data.positionId,
        buyerName: data.buyerName,
        buyerPhone: data.buyerPhone,
        buyerRegion: data.buyerRegion,
        buyerInn: data.buyerInn,
        volumeKg: data.volumeKg,
        salePrice: data.salePrice,
        supplierPrice: data.supplierPrice,
        taxMode: data.taxMode,
        taxAmount: data.taxAmount,
        margin: data.margin,
        deliveryMethod: data.deliveryMethod,
        deliveryCost: data.deliveryCost,
        /* Этап 5.1: снимок условий + закрытие + доп. расходы. */
        itemName: data.itemName ?? null,
        itemCulture: data.itemCulture ?? null,
        ...(data.itemAttributes
          ? { itemAttributes: data.itemAttributes as object }
          : {}),
        supplierName: data.supplierName ?? null,
        supplierLocation: data.supplierLocation ?? null,
        shippingMode: data.shippingMode ?? null,
        deliveryToTerminalCost: data.deliveryToTerminalCost ?? null,
        status: data.status,
        notes: data.notes,
      },
      include: positionInclude,
    });
    return toDealRow(row as unknown as Record<string, unknown>);
  },

  async updateDeal(id, data) {
    try {
      const row = await prisma.deal.update({
        where: { id },
        data: {
          ...(data.buyerName !== undefined ? { buyerName: data.buyerName } : {}),
          ...(data.buyerPhone !== undefined ? { buyerPhone: data.buyerPhone } : {}),
          ...(data.buyerRegion !== undefined ? { buyerRegion: data.buyerRegion } : {}),
          ...(data.buyerInn !== undefined ? { buyerInn: data.buyerInn } : {}),
          ...(data.volumeKg !== undefined ? { volumeKg: data.volumeKg } : {}),
          ...(data.salePrice !== undefined ? { salePrice: data.salePrice } : {}),
          ...(data.supplierPrice !== undefined ? { supplierPrice: data.supplierPrice } : {}),
          ...(data.taxMode !== undefined ? { taxMode: data.taxMode } : {}),
          ...(data.taxAmount !== undefined ? { taxAmount: data.taxAmount } : {}),
          ...(data.margin !== undefined ? { margin: data.margin } : {}),
          ...(data.deliveryMethod !== undefined ? { deliveryMethod: data.deliveryMethod } : {}),
          ...(data.deliveryCost !== undefined ? { deliveryCost: data.deliveryCost } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.paidAt !== undefined ? { paidAt: data.paidAt } : {}),
          ...(data.shippedAt !== undefined ? { shippedAt: data.shippedAt } : {}),
          ...(data.deliveredAt !== undefined ? { deliveredAt: data.deliveredAt } : {}),
          ...(data.closedAt !== undefined ? { closedAt: data.closedAt } : {}),
          ...(data.deliveryToTerminalCost !== undefined
            ? { deliveryToTerminalCost: data.deliveryToTerminalCost }
            : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        include: positionInclude,
      });
      return toDealRow(row as unknown as Record<string, unknown>);
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return null;
      throw err;
    }
  },

  async deleteDeal(id) {
    try {
      await prisma.deal.delete({ where: { id } });
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return false;
      throw err;
    }
  },

  async createShipment(data) {
    const row = await prisma.shipment.create({
      data: {
        dealId: data.dealId,
        carrierId: data.carrierId,
        method: data.method,
        carrierName: data.carrierName,
        fromCity: data.fromCity,
        toCity: data.toCity,
        cost: data.cost,
        days: data.days,
        trackingNumber: data.trackingNumber,
        status: data.status,
      },
    });
    return row as unknown as ShipmentRow;
  },

  async updateShipmentByDeal(dealId, data) {
    const row = await prisma.shipment.updateMany({
      where: { dealId },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.trackingNumber !== undefined ? { trackingNumber: data.trackingNumber } : {}),
      },
    });
    void row;
    const after = await prisma.shipment.findFirst({ where: { dealId }, orderBy: { createdAt: "desc" } });
    return (after as unknown as ShipmentRow | null) ?? null;
  },

  async findShipmentByDeal(dealId) {
    const row = await prisma.shipment.findFirst({ where: { dealId }, orderBy: { createdAt: "desc" } });
    return (row as ShipmentRow | null) ?? null;
  },

  async countDocuments(type: DocumentType) {
    return prisma.document.count({ where: { type } });
  },

  async createDocument(data) {
    const row = await prisma.document.create({
      data: {
        dealId: data.dealId,
        type: data.type,
        number: data.number,
        fileUrl: data.fileUrl,
        generatedAt: data.generatedAt,
      },
    });
    return row as unknown as DocumentRow;
  },

  async listDocuments(dealId) {
    const rows = await prisma.document.findMany({ where: { dealId }, orderBy: { generatedAt: "desc" } });
    return rows as unknown as DocumentRow[];
  },

  async findDocument(id) {
    const row = await prisma.document.findUnique({ where: { id } });
    return (row as unknown as DocumentRow | null) ?? null;
  },

  async listClaims(filter: { dealId?: string; status?: ClaimStatus }) {
    const rows = await prisma.claim.findMany({
      where: {
        ...(filter.dealId ? { dealId: filter.dealId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows as unknown as ClaimRow[];
  },

  async findClaim(id) {
    const row = await prisma.claim.findUnique({ where: { id } });
    return (row as unknown as ClaimRow | null) ?? null;
  },

  async createClaim(data) {
    const row = await prisma.claim.create({
      data: { dealId: data.dealId, description: data.description },
    });
    return row as unknown as ClaimRow;
  },

  async updateClaim(id, data) {
    try {
      const row = await prisma.claim.update({ where: { id }, data });
      return row as unknown as ClaimRow;
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return null;
      throw err;
    }
  },

  async listCarriers() {
    const rows = await prisma.carrier.findMany({ orderBy: [{ isLocal: "desc" }, { name: "asc" }] });
    return rows as unknown as CarrierRow[];
  },

  async countCarriers() {
    return prisma.carrier.count();
  },

  async createCarrier(data) {
    const row = await prisma.carrier.create({
      data: {
        name: data.name,
        city: data.city,
        pickupAvailable: data.pickupAvailable,
        isLocal: data.isLocal,
        notes: data.notes,
      },
    });
    return row as unknown as CarrierRow;
  },
};

export type { DealListStatus };
