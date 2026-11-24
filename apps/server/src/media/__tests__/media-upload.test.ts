/**
 * ЭТАП 6 — медиа позиций через единое хранилище:
 * base64-режим: фото ≤8 МБ → data-URL в БД; видео → честная 415 VIDEO_NEEDS_R2;
 * мок-R2: фото и видео → публичный URL.
 */

import { describe, expect, test } from "bun:test";
import { uploadPositionMedia } from "../service.js";
import { ApiError } from "../../errors.js";
import type { MediaRow, MediaUploadDb } from "../service.js";
import type { Storage } from "../../storage/types.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 1, 2, 3]);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;
const MP4_DATA_URL = `data:video/mp4;base64,${Buffer.from("fake-mp4").toString("base64")}`;

/** Мок-R2: upload → https://…/{key}. */
const mockR2: Storage = {
  mode: "r2",
  configured: () => true,
  async upload(key: string) {
    return { url: `https://pub-fake.r2.dev/${key}`, key };
  },
  async delete() {},
};

/** Мок-БД: позиция существует, строки in-memory. */
function fakeDb(exists = true): MediaUploadDb & { rows: MediaRow[] } {
  const rows: MediaRow[] = [];
  const db: MediaUploadDb & { rows: MediaRow[] } = {
    rows,
    async positionExists() {
      return exists;
    },
    async createMediaPending(data) {
      const row: MediaRow = {
        id: `media-${rows.length + 1}`,
        positionId: data.positionId,
        type: data.type,
        url: "pending",
        watermark: data.watermark,
        createdAt: new Date(),
      };
      rows.push(row);
      return row;
    },
    async updateMediaUrl(id, url) {
      const row = rows.find((r) => r.id === id)!;
      row.url = url;
      return row;
    },
  };
  return db;
}

describe("медиа позиций: JSON-загрузка (этап 6)", () => {
  test("base64: фото → data-URL в Media.url", async () => {
    const db = fakeDb();
    const res = await uploadPositionMedia("pos-1", { dataUrl: PNG_DATA_URL, type: "PHOTO" }, { db });
    expect(res.storage).toBe("base64");
    expect(res.media.url).toBe(PNG_DATA_URL);
    expect(res.media.type).toBe("PHOTO");
    expect(res.media.id).toBe("media-1");
    expect(db.rows[0].url).toBe(PNG_DATA_URL);
  });

  test("мок-R2: фото → публичный URL, ключ с id строки", async () => {
    const db = fakeDb();
    const res = await uploadPositionMedia(
      "pos-1",
      { dataUrl: PNG_DATA_URL, type: "PHOTO" },
      { db, storage: mockR2 },
    );
    expect(res.storage).toBe("r2");
    expect(res.media.url).toBe("https://pub-fake.r2.dev/positions/pos-1/media-1.png");
  });

  test("мок-R2: видео → URL, тип VIDEO", async () => {
    const db = fakeDb();
    const res = await uploadPositionMedia(
      "pos-1",
      { dataUrl: MP4_DATA_URL, type: "VIDEO" },
      { db, storage: mockR2 },
    );
    expect(res.media.type).toBe("VIDEO");
    expect(res.media.url).toContain("media-1.mp4");
  });

  test("base64: видео → честная 415 VIDEO_NEEDS_R2", async () => {
    const db = fakeDb();
    const err = await uploadPositionMedia(
      "pos-1",
      { dataUrl: MP4_DATA_URL, type: "VIDEO" },
      { db },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(415);
    expect((err as ApiError).code).toBe("VIDEO_NEEDS_R2");
    expect(db.rows.length).toBe(0); /* строка не создаётся */
  });

  test("base64: фото > 8 МБ — 400 с подсказкой настроить R2", async () => {
    const db = fakeDb();
    const big = `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1, 1).toString("base64")}`;
    await expect(
      uploadPositionMedia("pos-1", { dataUrl: big, type: "PHOTO" }, { db }),
    ).rejects.toThrow("Настройте R2");
  });

  test("мок-R2: файл > 25 МБ — 400", async () => {
    const db = fakeDb();
    const big = `data:image/png;base64,${Buffer.alloc(25 * 1024 * 1024 + 1, 1).toString("base64")}`;
    await expect(
      uploadPositionMedia("pos-1", { dataUrl: big, type: "PHOTO" }, { db, storage: mockR2 }),
    ).rejects.toThrow("больше 25 МБ");
  });

  test("несовпадение типа: фото с type=VIDEO — 400", async () => {
    const db = fakeDb();
    await expect(
      uploadPositionMedia("pos-1", { dataUrl: PNG_DATA_URL, type: "VIDEO" }, { db }),
    ).rejects.toThrow("тип PHOTO");
  });

  test("позиция не найдена — 404", async () => {
    const db = fakeDb(false);
    await expect(
      uploadPositionMedia("no-such", { dataUrl: PNG_DATA_URL, type: "PHOTO" }, { db }),
    ).rejects.toThrow("Позиция не найдена");
  });

  test("не data-URL и неподдерживаемый mime — 400", async () => {
    const db = fakeDb();
    await expect(
      uploadPositionMedia("pos-1", { dataUrl: "https://example.com/a.png", type: "PHOTO" }, { db }),
    ).rejects.toThrow("data-URL");
    const gif = `data:image/gif;base64,${Buffer.from("gif").toString("base64")}`;
    await expect(
      uploadPositionMedia("pos-1", { dataUrl: gif, type: "PHOTO" }, { db }),
    ).rejects.toThrow("JPEG, PNG, WebP, MP4 или MOV");
  });
});
