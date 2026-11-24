/**
 * ЭТАП 6 — выбор реализации Storage по env.
 *
 * Правила (подробнее — README «Как настроить R2» и .env.example):
 *   R2_CONFIGURED=false          → base64 всегда (явное «выключено»);
 *   R2_CONFIGURED=true           → r2, если заданы все 5 значений
 *                                  (ENDPOINT/BUCKET/ACCESS_KEY_ID/
 *                                  SECRET_ACCESS_KEY/PUBLIC_URL),
 *                                  иначе честный фолбэк на base64;
 *   R2_CONFIGURED не задан       → авто-определение: r2, когда все 5
 *                                  значений на месте; иначе base64.
 *
 * Синглтон с кешем; тесты сбрасывают через resetStorage().
 */

import { S3Client } from "@aws-sdk/client-s3";
import { createBase64Storage } from "./base64.js";
import { createR2Storage, r2EnvFrom, type R2Env, type S3Like } from "./r2.js";
import type { Storage, StorageMode } from "./types.js";

let cached: Storage | null = null;
let client: S3Like | null = null;

/** Значение env-переменной: непустая строка или undefined. */
function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const raw = env[name];
  return raw && raw.trim() ? raw.trim() : undefined;
}

/** Режим хранилища по env (чистая функция — удобно тестировать). */
export function storageMode(env: Record<string, string | undefined>): StorageMode {
  const flag = envValue(env, "R2_CONFIGURED")?.toLowerCase();
  const r2Ready = r2EnvFrom(env) !== null;
  if (flag === "false") return "base64";
  if (flag === "true") return r2Ready ? "r2" : "base64"; /* включён без ключей → безопасный фолбэк */
  return r2Ready ? "r2" : "base64";
}

/** Текущее хранилище (создаётся лениво, кешируется). */
export function getStorage(env: Record<string, string | undefined> = process.env): Storage {
  if (cached) return cached;
  const conf = r2EnvFrom(env);
  if (storageMode(env) === "r2" && conf) {
    cached = createR2Storage(conf, makeClient(conf));
    return cached;
  }
  cached = createBase64Storage();
  return cached;
}

/** Сброс кеша (тесты). Следующий getStorage пересоздаст по текущему env. */
export function resetStorage(): void {
  cached = null;
}

/** S3-клиент: ленивый синглтон из env (в тестах подменяется). */
function makeClient(conf: R2Env): S3Like {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: conf.endpoint,
      credentials: {
        accessKeyId: conf.accessKeyId,
        secretAccessKey: conf.secretAccessKey,
      },
    });
  }
  return client;
}

/** Тесты/скрипты могут подменить клиент. */
export function setS3ClientForTests(fake: S3Like | null): void {
  client = fake;
}
