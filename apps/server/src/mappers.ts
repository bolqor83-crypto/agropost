import type { Prisma } from "@prisma/client";

/**
 * Мапперы строк Prisma → DTO (shared/types).
 * Decimal приводится к number (цены в рублях — точность достаточна),
 * даты — к ISO-строкам.
 */

import type {
  AccountDTO,
  AttributeField,
  CertificateDTO,
  ChannelDTO,
  CultureTemplateDTO,
  ListingDTO,
  MediaDTO,
  PositionDTO,
  SupplierDTO,
} from "@shared/types";

const supplierInclude = {
  _count: { select: { positions: true } },
} satisfies Prisma.SupplierInclude;

const cultureInclude = {
  _count: { select: { positions: true } },
} satisfies Prisma.CultureTemplateInclude;

const positionInclude = {
  supplier: { include: supplierInclude },
  culture: { include: cultureInclude },
  media: { orderBy: { createdAt: "asc" as const } },
  certificates: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.SupplierPositionInclude;

export type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;
export type CultureRow = Prisma.CultureTemplateGetPayload<{ include: typeof cultureInclude }>;
export type PositionRow = Prisma.SupplierPositionGetPayload<{ include: typeof positionInclude }>;

export const includeSupplier = supplierInclude;
export const includeCulture = cultureInclude;
export const includePosition = positionInclude;

export function mapSupplier(row: SupplierRow): SupplierDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    location: row.location,
    shippingMode: row.shippingMode,
    notes: row.notes,
    positionCount: row._count.positions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapCulture(row: CultureRow): CultureTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    attributesSchema: row.attributesSchema as unknown as AttributeField[],
    positionCount: row._count.positions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMedia(row: PositionRow["media"][number]): MediaDTO {
  return {
    id: row.id,
    positionId: row.positionId,
    type: row.type,
    url: row.url,
    watermark: row.watermark,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapCertificate(row: PositionRow["certificates"][number]): CertificateDTO {
  return {
    id: row.id,
    positionId: row.positionId,
    name: row.name,
    fileUrl: row.fileUrl,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapPosition(row: PositionRow): PositionDTO {
  return {
    id: row.id,
    supplierId: row.supplierId,
    cultureId: row.cultureId,
    attributes: (row.attributes ?? {}) as PositionDTO["attributes"],
    volumeKg: row.volumeKg,
    bagWeightKg: row.bagWeightKg,
    minLotKg: row.minLotKg,
    supplierPrice: Number(row.supplierPrice),
    markupPercent: Number(row.markupPercent),
    salePrice: Number(row.salePrice),
    hasCertificate: row.hasCertificate,
    status: row.status,
    media: row.media.map(mapMedia),
    certificates: row.certificates.map(mapCertificate),
    supplier: mapSupplier(row.supplier),
    culture: mapCulture(row.culture),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ---------- Этап 2: каналы, аккаунты, размещения ---------- */

const channelInclude = {
  _count: { select: { listings: true } },
} satisfies Prisma.ChannelInclude;

const listingInclude = {
  channel: { include: channelInclude },
} satisfies Prisma.ListingInclude;

export type ChannelRow = Prisma.ChannelGetPayload<{ include: typeof channelInclude }>;
export type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;
export type AccountRow = Prisma.AccountGetPayload<{}>;

export const includeChannel = channelInclude;
export const includeListing = listingInclude;

export function mapChannel(row: ChannelRow): ChannelDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    url: row.url,
    region: row.region,
    city: row.city,
    tags: row.tags as ChannelDTO["tags"],
    subscribersCount: row.subscribersCount,
    averageReach: row.averageReach,
    lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
    accountId: row.accountId,
    notes: row.notes,
    /* Этап 2.5: подача и профиль. */
    submissionMethod: row.submissionMethod,
    submissionBotUsername: row.submissionBotUsername,
    adminContact: row.adminContact,
    frequencyLimit: row.frequencyLimit,
    confirmationStatus: row.confirmationStatus,
    mirrorOf: row.mirrorOf,
    audienceType: row.audienceType,
    /* ЭТАП 9: уровень автоматизации канала (бейдж мастера). */
    automationLevel: row.automationLevel,
    listingCount: row._count.listings,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapAccount(row: AccountRow): AccountDTO {
  return {
    id: row.id,
    platform: row.platform,
    phone: row.phone,
    status: row.status,
    dailyLimit: row.dailyLimit,
    usedToday: row.usedToday,
    usedDate: row.usedDate ? row.usedDate.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapListing(row: ListingRow): ListingDTO {
  return {
    id: row.id,
    positionId: row.positionId,
    channelId: row.channelId,
    text: row.text,
    status: row.status,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    publishedCount: row.publishedCount,
    url: row.url ?? null,
    channel: mapChannel(row.channel),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
