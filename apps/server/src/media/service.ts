/**
 * ЭТАП 6 — сервис загрузки медиа позиций через единое хранилище.
 * Узкий интерфейс MediaDb (как DealsDb в этапе 4): подменяется в тестах,
 * в проде — адаптер поверх Prisma (routes/media.ts).
 */

import { ApiError, badRequest } from "../errors.js";
import type { MediaDTO, MediaType } from "@shared/types";
import { getStorage } from "../storage/factory.js";
import { parseDataUrl, type Storage } from "../storage/types.js";

/** Строка Media, нужная мапперу (плоское подмножество Prisma Media). */
export interface MediaRow {
  id: string;
  positionId: string;
  type: MediaType;
  url: string;
  watermark: boolean;
  createdAt: Date;
}

export interface MediaUploadDb {
  /** Существует ли позиция. */
  positionExists(id: string): Promise<boolean>;
  /** Создать строку с url="pending" — реальный url после upload. */
  createMediaPending(data: {
    positionId: string;
    type: MediaType;
    watermark: boolean;
  }): Promise<MediaRow>;
  updateMediaUrl(id: string, url: string): Promise<MediaRow>;
}

export interface MediaUploadDeps {
  db: MediaUploadDb;
  /** По умолчанию — getStorage(); тесты подменяют мок-R2. */
  storage?: Storage;
}

export interface MediaUploadLimits {
  photoMaxBytesBase64: number;
  fileMaxBytesR2: number;
}

export const DEFAULT_LIMITS: MediaUploadLimits = {
  photoMaxBytesBase64: 8 * 1024 * 1024,
  fileMaxBytesR2: 25 * 1024 * 1024,
};

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export interface MediaUploadInput {
  dataUrl: string;
  type: MediaType;
  watermark?: boolean;
}

export interface MediaUploadResult {
  media: MediaDTO;
  storage: Storage["mode"];
}

/** Загрузить медиа: валидация → строка pending → storage.upload → url. */
export async function uploadPositionMedia(
  positionId: string,
  input: MediaUploadInput,
  deps: MediaUploadDeps,
  limits: MediaUploadLimits = DEFAULT_LIMITS,
): Promise<MediaUploadResult> {
  if (!(await deps.db.positionExists(positionId))) {
    throw new ApiError(404, "NOT_FOUND", "Позиция не найдена");
  }

  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) throw badRequest("Ожидается файл как data-URL (base64)");
  const isPhoto = PHOTO_TYPES.includes(parsed.mime);
  const isVideo = VIDEO_TYPES.includes(parsed.mime);
  if (!isPhoto && !isVideo) throw badRequest("Медиа — JPEG, PNG, WebP, MP4 или MOV");
  if (isPhoto && input.type !== "PHOTO") throw badRequest("Это фото — тип PHOTO");
  if (isVideo && input.type !== "VIDEO") throw badRequest("Это видео — тип VIDEO");

  const storage = deps.storage ?? getStorage();
  const base64Mode = storage.mode === "base64";

  if (isVideo && base64Mode) {
    throw new ApiError(
      415,
      "VIDEO_NEEDS_R2",
      "Видео можно загрузить после настройки Cloudflare R2 (см. README «Как настроить R2»)",
    );
  }
  if (parsed.bytes.length === 0) throw badRequest("Пустой файл");
  if (base64Mode && parsed.bytes.length > limits.photoMaxBytesBase64) {
    throw badRequest("Без R2 фото — до 8 МБ. Настройте R2 или уменьшите фото");
  }
  if (!base64Mode && parsed.bytes.length > limits.fileMaxBytesR2) {
    throw badRequest("Файл больше 25 МБ");
  }

  const media = await deps.db.createMediaPending({
    positionId,
    type: input.type,
    watermark: input.watermark ?? false,
  });
  const ext = EXT_BY_MIME[parsed.mime] ?? "bin";
  const key = `positions/${positionId}/${media.id}.${ext}`;
  const stored = await storage.upload(key, parsed.mime, parsed.bytes);
  const updated = await deps.db.updateMediaUrl(media.id, stored.url);
  return {
    media: {
      id: updated.id,
      positionId: updated.positionId,
      type: updated.type,
      url: updated.url,
      watermark: updated.watermark,
      createdAt: updated.createdAt.toISOString(),
    },
    storage: storage.mode,
  };
}
