/**
 * Позиции из seed-data как PositionDTO — для unit-тестов fallback
 * и golden set без обращения к БД.
 */

import { SEED_CULTURES, SEED_POSITIONS, SEED_SUPPLIERS } from "@shared/seed-data";
import type { PositionDTO } from "@shared/types";

export function seedPosition(id: string): PositionDTO {
  const p = SEED_POSITIONS.find((x) => x.id === id);
  if (!p) throw new Error(`seed position ${id} not found`);
  const supplier = SEED_SUPPLIERS.find((s) => s.id === p.supplierId);
  const culture = SEED_CULTURES.find((c) => c.id === p.cultureId);
  if (!supplier || !culture) throw new Error(`seed refs for ${id} not found`);
  return {
    id: p.id,
    supplierId: p.supplierId,
    cultureId: p.cultureId,
    attributes: p.attributes,
    volumeKg: p.volumeKg,
    bagWeightKg: p.bagWeightKg,
    minLotKg: p.minLotKg,
    supplierPrice: p.supplierPrice,
    markupPercent: p.markupPercent,
    salePrice: Math.round(p.supplierPrice * (1 + p.markupPercent / 100) * 100) / 100,
    hasCertificate: p.hasCertificate,
    status: p.status,
    media: [],
    certificates: [],
    supplier: {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      location: supplier.location,
      shippingMode: supplier.shippingMode,
      notes: supplier.notes ?? null,
      positionCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    culture: {
      id: culture.id,
      name: culture.name,
      type: culture.type,
      attributesSchema: culture.attributesSchema,
      positionCount: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
