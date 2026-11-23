import type { Media, Certificate } from "@prisma/client";

/**
 * Мапперы строк Media/Certificate → DTO (без вложенных позиций).
 */

import type { CertificateDTO, MediaDTO } from "@shared/types";

export function mapMediaRow(row: Media): MediaDTO {
  return {
    id: row.id,
    positionId: row.positionId,
    type: row.type,
    url: row.url,
    watermark: row.watermark,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapCertificateRow(row: Certificate): CertificateDTO {
  return {
    id: row.id,
    positionId: row.positionId,
    name: row.name,
    fileUrl: row.fileUrl,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
