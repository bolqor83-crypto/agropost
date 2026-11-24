import type { FastifyInstance } from "fastify";

/**
 * Медиа и сертификаты позиций.
 *
 * Два способа загрузки медиа (ЭТАП 6):
 *  1. presigned PUT в R2 на 15 минут (браузер → бакет напрямую) —
 *     работает при настроенном R2 (POST /media, без изменений с этапа 1);
 *  2. POST /media/upload — файл как data-URL через сервер и единое
 *     хранилище Storage: без R2 — base64 в БД, с R2 — объект в бакете.
 *     Так мастер позиций грузит реальные фото и до настройки R2.
 *
 * Сертификаты — PDF. Медиа: JPEG/PNG/WebP, MP4/MOV.
 * Watermark — пока флаг на будущее наложение (этап 3).
 */

import { prisma } from "../prisma.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import {
  certificateCreateSchema,
  mediaCreateSchema,
  mediaUploadSchema,
  parseOrThrow,
} from "../validation.js";
import { deleteObjectBestEffort, isR2Configured, keyFromUrl, presignPut, publicUrl } from "../r2.js";
import { getStorage } from "../storage/factory.js";
import { uploadPositionMedia, type MediaRow } from "../media/service.js";
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

/* ЭТАП 6: адаптер Prisma для сервиса загрузки медиа. */
const mediaDeps = {
  db: {
    async positionExists(id: string): Promise<boolean> {
      return (await prisma.supplierPosition.findUnique({ where: { id } })) !== null;
    },
    async createMediaPending(data: { positionId: string; type: "PHOTO" | "VIDEO"; watermark: boolean }): Promise<MediaRow> {
      return prisma.media.create({ data: { ...data, url: "pending" } });
    },
    async updateMediaUrl(id: string, url: string): Promise<MediaRow> {
      return prisma.media.update({ where: { id }, data: { url } });
    },
  },
};

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
    /* ЭТАП 6: base64-файлы лежат в строке БД (удаляются вместе с ней),
       R2-объекты — в бакете. deleteObjectBestEffort по прежнему пути. */
    const key = keyFromUrl(media.url);
    if (key) await deleteObjectBestEffort(key);
    else await getStorage().delete(media.url);
    return { ok: true };
  });

  /* ЭТАП 6: JSON-загрузка медиа через сервер и единое хранилище
     (без R2 — base64 в БД, с R2 — объект в бакете; видео требует R2). */
  app.post(
    "/api/positions/:id/media/upload",
    { bodyLimit: 36 * 1024 * 1024 },
    async (req) => {
      const { id } = req.params as { id: string };
      const data = parseOrThrow(mediaUploadSchema, req.body ?? {});
      const result = await uploadPositionMedia(id, data, mediaDeps);
      return { ok: true, ...result };
    },
  );

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
