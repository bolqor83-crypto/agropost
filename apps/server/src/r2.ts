import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (S3-совместимый). Presigned PUT на 15 минут:
 * файл идёт из браузера напрямую в бакет, сервер не тратит трафик.
 * Content-Type зашит в подпись — заменить его нельзя.
 *
 * Если R2 не настроен — эндпоинты загрузки честно отвечают 503
 * R2_NOT_CONFIGURED, остальное приложение работает.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function isR2Configured(): boolean {
  return Boolean(
    env("R2_ENDPOINT") &&
      env("R2_BUCKET") &&
      env("R2_ACCESS_KEY_ID") &&
      env("R2_SECRET_ACCESS_KEY") &&
      env("R2_PUBLIC_URL"),
  );
}

export const UPLOAD_TTL_SECONDS = 900; // 15 минут

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env("R2_ENDPOINT"),
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID") ?? "",
        secretAccessKey: env("R2_SECRET_ACCESS_KEY") ?? "",
      },
    });
  }
  return client;
}

function bucket(): string {
  return env("R2_BUCKET") ?? "";
}

export function publicUrl(key: string): string {
  return `${String(env("R2_PUBLIC_URL")).replace(/\/+$/, "")}/${key}`;
}

/** Ключ объекта из публичного URL (для удаления). */
export function keyFromUrl(url: string): string | null {
  const base = env("R2_PUBLIC_URL");
  if (!base || !url.startsWith(base)) return null;
  return url.slice(base.replace(/\/+$/, "").length).replace(/^\/+/, "");
}

export async function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_TTL_SECONDS },
  );
}

export async function deleteObjectBestEffort(key: string): Promise<void> {
  if (!isR2Configured()) return;
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    /* удаление объекта — лучший результат, строка в БД важнее */
  }
}
