/**
 * ЭТАП 6 — фото рекламаций через единое хранилище:
 * без R2 (base64) фото остаётся data-URL в claim.photos;
 * с мок-R2 — в photos публичный URL, объект уходит в мок-клиент.
 * Удаление фото: base64 — no-op; r2 — DeleteObject best-effort.
 */

import { describe, expect, test } from "bun:test";
import { seededDb } from "./fixtures.js";
import { addClaimPhoto, createClaim, createDeal, removeClaimPhoto } from "../service.js";
import { ApiError } from "../../errors.js";
import type { DealsDeps } from "../types.js";
import type { Storage } from "../../storage/types.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

/** Мок-R2: upload → https://…/{key}; delete — помечается в список. */
function mockR2Storage(): Storage & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    mode: "r2",
    configured: () => true,
    async upload(key: string, contentType: string) {
      return { url: `https://pub-fake.r2.dev/${key}`, key };
    },
    async delete(url: string) {
      deleted.push(url);
    },
    get deleted() {
      return deleted;
    },
  } as Storage & { deleted: string[] };
}

function deps(storage?: Storage): DealsDeps {
  return storage ? { db: seededDb(), storage } : { db: seededDb() };
}

async function claimWithPhoto(storage?: Storage) {
  const d = deps(storage);
  const deal = await createDeal({ leadId: "lead-1", volumeKg: 1000 }, d);
  const claim = await createClaim({ dealId: deal.id, description: "Влага в двух мешках" }, d);
  const result = await addClaimPhoto(claim.id, PNG_DATA_URL, d);
  return { d, claim: result.claim, result };
}

describe("фото рекламаций (этап 6)", () => {
  test("без R2 → base64: в photos data-URL, байты совпадают", async () => {
    const { claim, result } = await claimWithPhoto();
    expect(result.storage).toBe("base64");
    expect(claim.photos.length).toBe(1);
    expect(claim.photos[0]).toBe(PNG_DATA_URL);
  });

  test("с мок-R2 → в photos публичный URL", async () => {
    const storage = mockR2Storage();
    const { claim, result } = await claimWithPhoto(storage);
    expect(result.storage).toBe("r2");
    expect(claim.photos.length).toBe(1);
    expect(claim.photos[0].startsWith("https://pub-fake.r2.dev/claims/")).toBe(true);
    expect(claim.photos[0].endsWith(".png")).toBe(true);
  });

  test("второе фото добавляется, не затирая первое", async () => {
    const { d, claim } = await claimWithPhoto();
    const jpeg = `data:image/jpeg;base64,${Buffer.from("jpeg").toString("base64")}`;
    const updated = await addClaimPhoto(claim.id, jpeg, d);
    expect(updated.claim.photos.length).toBe(2);
    expect(updated.claim.photos[0]).toBe(PNG_DATA_URL);
  });

  test("не-фото тип — 400 с понятным сообщением", async () => {
    const { d, claim } = await claimWithPhoto();
    const gif = `data:image/gif;base64,${Buffer.from("gif").toString("base64")}`;
    await expect(addClaimPhoto(claim.id, gif, d)).rejects.toThrow("JPEG, PNG или WebP");
  });

  test("не data-URL — 400", async () => {
    const { d, claim } = await claimWithPhoto();
    await expect(addClaimPhoto(claim.id, "https://example.com/x.png", d)).rejects.toThrow(
      "data-URL",
    );
  });

  test("фото больше 10 МБ — 400", async () => {
    const { d, claim } = await claimWithPhoto();
    const big = `data:image/png;base64,${Buffer.alloc(10 * 1024 * 1024 + 1, 1).toString("base64")}`;
    await expect(addClaimPhoto(claim.id, big, d)).rejects.toThrow("больше 10 МБ");
  });

  test("лимит 12 фото на рекламацию", async () => {
    const { d, claim } = await claimWithPhoto();
    for (let i = 0; i < 11; i += 1) {
      await addClaimPhoto(claim.id, PNG_DATA_URL, d);
    }
    await expect(addClaimPhoto(claim.id, PNG_DATA_URL, d)).rejects.toThrow("Максимум 12");
  });

  test("удаление фото: base64 — photos пустеет", async () => {
    const { d, claim } = await claimWithPhoto();
    const updated = await removeClaimPhoto(claim.id, 0, d);
    expect(updated.photos.length).toBe(0);
  });

  test("удаление фото с мок-R2 → delete вызвана с URL объекта", async () => {
    const storage = mockR2Storage();
    const { d, claim } = await claimWithPhoto(storage);
    const url = claim.photos[0];
    const updated = await removeClaimPhoto(claim.id, 0, { db: d.db, storage });
    expect(updated.photos.length).toBe(0);
    expect(storage.deleted).toEqual([url]);
  });

  test("bad index — 400; несуществующая рекламация — 404", async () => {
    const { d, claim } = await claimWithPhoto();
    await expect(removeClaimPhoto(claim.id, 5, d)).rejects.toThrow("Нет фото");
    await expect(removeClaimPhoto("no-such-claim", 0, d)).rejects.toThrow(ApiError);
  });
});
