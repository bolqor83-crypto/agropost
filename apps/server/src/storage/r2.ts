/**
 * ЭТАП 6 — реализация Storage на Cloudflare R2 (S3-совместимый).
 * Загрузка PutObject-командой с сервера, в БД — публичный URL.
 * Удаление — best-effort (строка в БД важнее, чем объект в бакете).
 *
 * Клиент S3 inject-ится для тестов (см. __tests__/storage.test.ts);
 * в проде создаётся один раз лениво из env.
 */

import type { DeleteObjectCommandInput, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Storage, StoredFile } from "./types.js";

/** Минимальный интерфейс клиента, нужный хранилищу (для моков в тестах). */
export type S3Like = Pick<S3Client, "send">;

export interface R2Env {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}

/** Для тестов: собрать env R2. */
export function r2EnvFrom(env: Record<string, string | undefined>): R2Env | null {
  const value = (name: string): string => {
    const raw = env[name];
    return raw && raw.trim() ? raw.trim() : "";
  };
  const conf: R2Env = {
    endpoint: value("R2_ENDPOINT"),
    bucket: value("R2_BUCKET"),
    accessKeyId: value("R2_ACCESS_KEY_ID"),
    secretAccessKey: value("R2_SECRET_ACCESS_KEY"),
    publicUrl: value("R2_PUBLIC_URL"),
  };
  const complete = Object.values(conf).every((v) => v.length > 0);
  return complete ? conf : null;
}

export function createR2Storage(conf: R2Env, client: S3Like): Storage {
  const base = conf.publicUrl.replace(/\/+$/, "");
  const publicUrlOf = (key: string): string => `${base}/${key.replace(/^\/+/, "")}`;

  return {
    mode: "r2" as const,
    configured: () => true,
    async upload(key: string, contentType: string, bytes: Buffer): Promise<StoredFile> {
      const input: PutObjectCommandInput = {
        Bucket: conf.bucket,
        Key: key,
        ContentType: contentType,
        Body: bytes,
      };
      await client.send(new PutObjectCommand(input));
      return { url: publicUrlOf(key), key };
    },
    async delete(url: string): Promise<void> {
      if (!url.startsWith(`${base}/`)) return; /* чужой url — не наш объект */
      const key = url.slice(base.length + 1);
      const input: DeleteObjectCommandInput = { Bucket: conf.bucket, Key: key };
      try {
        await client.send(new DeleteObjectCommand(input));
      } catch {
        /* удаление объекта — лучший результат, строка в БД важнее */
      }
    },
  };
}
