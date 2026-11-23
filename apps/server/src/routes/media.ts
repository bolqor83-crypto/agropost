import type { FastifyInstance } from "fastify";

/**
 * Медиа и сертификаты позиций.
 * Загрузка: presigned PUT в R2 на 15 минут, Content-Type зашит в подпись.
 * Клиент: POST (получить ссылку) → PUT файла в R2 → готово.
 *
 * Сертификаты — PDF. Медиа: JPEG/PNG/WebP, MP4/MOV.
 * Watermark — пока флаг на будущее наложение (этап 3).
 */

import { prisma } from "../prisma.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import {
  certificateCreateSchema,
  mediaCreateSchema,
  parseOrThrow,
} from "../validation.js";
import { deleteObjectBestEffort, isR2Configured, keyFromUrl, presignPut, publicUrl } from "../r2.js";
import { mapCertificateRow, mapMediaRow } from "../media-mappers.js";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

function requireR2(): void {
  if (!isR2Configured()) {
    throw new ApiError(
      503,
      "R2_NOT_CONFIGURED",
      "Загрузка файлов требует настройки Cloudflare R2 — см. README (раздел «R2 и CORS»)",
    );
  }
}

async function positionOr404(id: string) {
  const row = await prisma.supplierPosition.findUnique({ where: { id } });
  if (!row) throw notFound("Позиция не найдена");
  return row;
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- Медиа ---------- */

  app.post("/api/positions/:id/media", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(mediaCreateSchema, req.body);
    if (data.type === "PHOTO" && !PHOTO_TYPES.includes(data.contentType)) {
      throw badRequest("Для фото — JPEG, PNG или WebP");
    }
    if (data.type === "VIDEO" && !VIDEO_TYPES.includes(data.contentType)) {
      throw badRequest("Для видео — MP4 или MOV");
    }
    await positionOr404(id);
    requireR2();

    const media = await prisma.media.create({
      data: { positionId: id, type: data.type, url: "pending", watermark: data.watermark ?? false },
    });
    const ext = EXT_BY_CONTENT_TYPE[data.contentType];
    const key = `positions/${id}/${media.id}.${ext}`;
    const uploadUrl = await presignPut(key, data.contentType);
    const updated = await prisma.media.update({
      where: { id: media.id },
      data: { url: publicUrl(key) },
    });
    return {
      media: mapMediaRow(updated),
      uploadUrl,
      method: "PUT" as const,
      headers: { "Content-Type": data.contentType },
    };
  });

  app.delete("/api/positions/:id/media/:mediaId", async (req) => {
    const { id, mediaId } = req.params as { id: string; mediaId: string };
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.positionId !== id) throw notFound("Медиа не найдено");
    await prisma.media.delete({ where: { id: mediaId } });
    const key = keyFromUrl(media.url);
    if (key) await deleteObjectBestEffort(key);
    return { ok: true };
  });

  /* ---------- Сертификаты ---------- */

  app.post("/api/positions/:id/certificates", async (req) => {
    const { id } = req.params as { id: string };
    const data = parseOrThrow(certificateCreateSchema, req.body);
    await positionOr404(id);
    requireR2();

    let issuedAt: Date | undefined;
    if (data.issuedAt !== undefined && data.issuedAt !== "") {
      const parsed = new Date(data.issuedAt);
      if (Number.isNaN(parsed.getTime())) throw badRequest("Неверная дата выдачи");
      issuedAt = parsed;
    }

    const certificate = await prisma.certificate.create({
      data: { positionId: id, name: data.name, fileUrl: "pending", issuedAt },
    });
    const key = `certificates/${id}/${certificate.id}.pdf`;
    const uploadUrl = await presignPut(key, data.contentType);
    const updated = await prisma.certificate.update({
      where: { id: certificate.id },
      data: { fileUrl: publicUrl(key) },
    });
    return {
      certificate: mapCertificateRow(updated),
      uploadUrl,
      method: "PUT" as const,
      headers: { "Content-Type": data.contentType },
    };
  });

  app.delete("/api/positions/:id/certificates/:certificateId", async (req) => {
    const { id, certificateId } = req.params as { id: string; certificateId: string };
    const certificate = await prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!certificate || certificate.positionId !== id) throw notFound("Сертификат не найден");
    await prisma.certificate.delete({ where: { id: certificateId } });
    const key = keyFromUrl(certificate.fileUrl);
    if (key) await deleteObjectBestEffort(key);
    return { ok: true };
  });
}
