/**
 * ЭТАП 6 — тесты хранилища: factory по env, base64, мок-R2.
 * S3-клиент подменяется фейком (никаких сетевых вызовов).
 */

import { describe, expect, test } from "bun:test";
import {
  getStorage,
  resetStorage,
  setS3ClientForTests,
  storageMode,
} from "../factory.js";
import { createBase64Storage } from "../base64.js";
import { createR2Storage, r2EnvFrom } from "../r2.js";
import { parseDataUrl } from "../types.js";
import type { S3Like } from "../r2.js";
import type { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ENV_FULL = {
  R2_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
  R2_BUCKET: "agropost-media",
  R2_ACCESS_KEY_ID: "key-id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_PUBLIC_URL: "https://pub-xxx.r2.dev",
};

describe("storage factory (этап 6)", () => {
  test("без env — base64", () => {
    expect(storageMode({})).toBe("base64");
  });

  test("все 5 значений — r2 (авто)", () => {
    expect(storageMode(R2_ENV_FULL)).toBe("r2");
  });

  test("R2_CONFIGURED=false выключает r2 даже при ключах", () => {
    expect(storageMode({ ...R2_ENV_FULL, R2_CONFIGURED: "false" })).toBe("base64");
    expect(storageMode({ ...R2_ENV_FULL, R2_CONFIGURED: "FALSE" })).toBe("base64");
  });

  test("R2_CONFIGURED=true без ключей — безопасный фолбэк на base64", () => {
    expect(storageMode({ R2_CONFIGURED: "true" })).toBe("base64");
    expect(storageMode({ R2_CONFIGURED: "true", R2_ENDPOINT: "x" })).toBe("base64");
  });

  test("R2_CONFIGURED=true с ключами — r2", () => {
    expect(storageMode({ ...R2_ENV_FULL, R2_CONFIGURED: "true" })).toBe("r2");
  });

  test("пустые значения не считаются настроенными", () => {
    expect(storageMode({ ...R2_ENV_FULL, R2_PUBLIC_URL: "   " })).toBe("base64");
    expect(r2EnvFrom({ ...R2_ENV_FULL, R2_BUCKET: "" })).toBeNull();
  });

  test("getStorage кеширует; resetStorage пересоздаёт по env", () => {
    resetStorage();
    expect(getStorage({}).mode).toBe("base64");
    expect(getStorage(R2_ENV_FULL).mode).toBe("base64"); /* кеш */
    resetStorage();
    expect(getStorage(R2_ENV_FULL).mode).toBe("r2");
    resetStorage();
    expect(getStorage({}).mode).toBe("base64");
  });
});

describe("base64-хранилище", () => {
  test("upload → data-URL; delete — no-op", async () => {
    const s = createBase64Storage();
    const bytes = Buffer.from("фото-байты");
    const stored = await s.upload("claims/x/1.jpg", "image/jpeg", bytes);
    expect(stored.key).toBeNull();
    expect(stored.url).toBe(`data:image/jpeg;base64,${bytes.toString("base64")}`);
    expect(s.configured()).toBe(false);
    await expect(s.delete(stored.url)).resolves.toBeUndefined();
  });
});

describe("r2-хранилище (мок-клиент)", () => {
  function mockClient() {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const client: S3Like = {
      send: async (cmd: PutObjectCommand | DeleteObjectCommand) => {
        sent.push({ name: cmd.constructor.name, input: cmd.input as unknown as Record<string, unknown> });
        return {} as never;
      },
    };
    return { client, sent };
  }

  const conf = r2EnvFrom(R2_ENV_FULL)!;

  test("upload → PutObject + публичный URL + ключ", async () => {
    const { client, sent } = mockClient();
    const s = createR2Storage(conf, client);
    const bytes = Buffer.from([1, 2, 3]);
    const stored = await s.upload("claims/c1/1.jpg", "image/jpeg", bytes);
    expect(stored.url).toBe("https://pub-xxx.r2.dev/claims/c1/1.jpg");
    expect(stored.key).toBe("claims/c1/1.jpg");
    expect(sent.length).toBe(1);
    expect(sent[0].name).toBe("PutObjectCommand");
    expect(sent[0].input.Bucket).toBe("agropost-media");
    expect(sent[0].input.Key).toBe("claims/c1/1.jpg");
    expect(sent[0].input.ContentType).toBe("image/jpeg");
    expect(Buffer.from(sent[0].input.Body as Buffer).equals(bytes)).toBe(true);
    expect(s.configured()).toBe(true);
  });

  test("delete своего URL → DeleteObject; чужого — no-op", async () => {
    const { client, sent } = mockClient();
    const s = createR2Storage(conf, client);
    await s.delete("https://pub-xxx.r2.dev/claims/c1/1.jpg");
    expect(sent.length).toBe(1);
    expect(sent[0].name).toBe("DeleteObjectCommand");
    expect(sent[0].input.Key).toBe("claims/c1/1.jpg");
    await s.delete("https://evil.example.com/claims/c1/1.jpg");
    await s.delete("data:image/jpeg;base64,AAA");
    expect(sent.length).toBe(1); /* чужие не трогаем */
  });

  test("ошибка DeleteObject глотается (best-effort)", async () => {
    const client: S3Like = {
      send: async () => {
        throw new Error("R2 упал");
      },
    };
    const s = createR2Storage(conf, client);
    await expect(s.delete("https://pub-xxx.r2.dev/x.jpg")).resolves.toBeUndefined();
  });

  test("setS3ClientForTests подменяет клиент factory", async () => {
    const { client, sent } = mockClient();
    setS3ClientForTests(client);
    resetStorage();
    const s = getStorage(R2_ENV_FULL);
    expect(s.mode).toBe("r2");
    await s.upload("probe.txt", "text/plain", Buffer.from("x"));
    expect(sent.length).toBe(1);
    setS3ClientForTests(null);
    resetStorage();
  });
});

describe("parseDataUrl", () => {
  test("валидный data-URL разбирается", () => {
    const bytes = Buffer.from("hello");
    const parsed = parseDataUrl(`data:image/png;base64,${bytes.toString("base64")}`);
    expect(parsed?.mime).toBe("image/png");
    expect(parsed?.bytes.toString()).toBe("hello");
  });

  test("не data-URL → null", () => {
    expect(parseDataUrl("https://example.com/a.jpg")).toBeNull();
    expect(parseDataUrl("")).toBeNull();
    expect(parseDataUrl("data:image/png;base64,")).toBeNull();
  });

  test("мусорная base64-часть → null", () => {
    expect(parseDataUrl("data:image/png;base64,!!!!")).toBeNull();
  });
});
