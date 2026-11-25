/**
 * Шифрование секретов при хранении в AppSetting (AES-256-GCM).
 *
 * Ключ — SECRETS_ENCRYPTION_KEY: 64 hex-символа (32 байта) или любая
 * строка длиной ≥ 32 символов (тогда ключ = sha256(строки)). Ключ не
 * задан — шифрование недоступно: экран переменных честно предупреждает,
 * а сохранение секретов через UI отключено (env по-прежнему работает).
 *
 * Формат шифротекста: v1:<iv b64>:<tag b64>:<ciphertext b64>. Префикс v1
 * позволяет отличать зашифрованные значения от легаси-plaintext строк
 * (этапы 9–10 писали секции «avito»/«max» без шифрования) при чтении.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

/** 32 байта ключа из SECRETS_ENCRYPTION_KEY или null, если ключ не задан/короткий. */
function normalizeKey(): Buffer | null {
  const raw = (process.env.SECRETS_ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (raw.length >= 32) return createHash("sha256").update(raw, "utf8").digest();
  return null;
}

/** Доступно ли шифрование: ключ задан и валиден. */
export function secretsEncryptionAvailable(): boolean {
  return normalizeKey() !== null;
}

/** Только для тестов: восстановить проверку ключа после подмены env. */
export function __setEncryptionKeyForTests(value: string | undefined): void {
  if (value === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = value;
}

/** Зашифровать значение (вызывается только при доступном ключе). */
export function encryptSecret(plain: string): string {
  const key = normalizeKey();
  if (key === null) {
    throw new Error("SECRETS_ENCRYPTION_KEY не задан — шифрование недоступно");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Расшифровать; null при неверном ключе или повреждённом значении (не бросает). */
export function decryptSecret(payload: string): string | null {
  try {
    const parts = payload.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    const key = normalizeKey();
    if (key === null) return null;
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/** Выглядит ли значение как наш шифротекст (v1:iv:tag:ct). */
export function isEncryptedValue(value: string): boolean {
  return /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Прочитать значение секции: шифротекст — расшифровать, легаси-plaintext
 * (этапы 9–10) — принять как есть. Пустая строка → null.
 */
export function maybeDecrypt(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isEncryptedValue(trimmed)) return decryptSecret(trimmed);
  return trimmed;
}

/** Маска для UI: точки + последние 4 символа (короткие — полностью скрыты). */
export function maskSecret(value: string): string {
  const tail = value.length > 4 ? value.slice(-4) : "";
  return `••••${tail}`;
}
