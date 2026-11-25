/**
 * Тесты шифрования секретов (AES-256-GCM): раунд-трип, защита от
 * подделки (GCM-тег), смена/отсутствие ключа, маски и легаси-значения.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const savedKey = process.env.SECRETS_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.SECRETS_ENCRYPTION_KEY = "a".repeat(64); /* 64 hex = 32 байта */
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = savedKey;
});

const { decryptSecret, encryptSecret, isEncryptedValue, maskSecret, maybeDecrypt, secretsEncryptionAvailable } =
  await import("../crypto.js");

describe("Шифрование секретов (AES-256-GCM)", () => {
  test("раунд-трип: зашифровали → расшифровали → то же значение", () => {
    const secret = "feed-token-abcdef123456";
    const payload = encryptSecret(secret);
    expect(payload.startsWith("v1:")).toBe(true);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload)).toBe(secret);
  });

  test("каждое шифрование — новый iv (шифротексты разные)", () => {
    const a = encryptSecret("one-value-123456");
    const b = encryptSecret("one-value-123456");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("one-value-123456");
    expect(decryptSecret(b)).toBe("one-value-123456");
  });

  test("подделка шифротекста отклоняется (GCM-тег)", () => {
    const payload = encryptSecret("important-secret-value");
    const parts = payload.split(":");
    const ct = Buffer.from(parts[3], "base64");
    ct[0] = ct[0] ^ 0xff; /* меняем один байт */
    parts[3] = Buffer.from(ct).toString("base64");
    expect(decryptSecret(parts.join(":"))).toBeNull();
  });

  test("неверный ключ → null (не бросает)", () => {
    const payload = encryptSecret("some-secret-987654");
    const other = process.env.SECRETS_ENCRYPTION_KEY;
    process.env.SECRETS_ENCRYPTION_KEY = "b".repeat(64);
    try {
      expect(decryptSecret(payload)).toBeNull();
    } finally {
      process.env.SECRETS_ENCRYPTION_KEY = other;
    }
  });

  test("ключ: hex-64, парольная фраза ≥32 и короткий мусор", () => {
    expect(secretsEncryptionAvailable()).toBe(true);
    const original = process.env.SECRETS_ENCRYPTION_KEY;
    try {
      process.env.SECRETS_ENCRYPTION_KEY = "пароль-фраза-длиной-больше-тридцати-двух-символов";
      expect(secretsEncryptionAvailable()).toBe(true);
      const passphrasePayload = encryptSecret("x".repeat(20));
      expect(decryptSecret(passphrasePayload)).toBe("x".repeat(20));
      process.env.SECRETS_ENCRYPTION_KEY = "short";
      expect(secretsEncryptionAvailable()).toBe(false);
      delete process.env.SECRETS_ENCRYPTION_KEY;
      expect(secretsEncryptionAvailable()).toBe(false);
    } finally {
      /* Восстанавливаем: следующие тести файла зависят от ключа. */
      if (original === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
      else process.env.SECRETS_ENCRYPTION_KEY = original;
    }
  });

  test("isEncryptedValue различает шифротекст и произвольную строку", () => {
    expect(isEncryptedValue(encryptSecret("abcdef123456"))).toBe(true);
    expect(isEncryptedValue("v1:not-enough")).toBe(false);
    expect(isEncryptedValue("plain-legacy-value")).toBe(false);
    expect(isEncryptedValue("8944861002:AAGY0aeJZ")).toBe(false);
  });

  test("maybeDecrypt: легаси-plaintext читается как есть", () => {
    expect(maybeDecrypt("legacy-plaintext-token")).toBe("legacy-plaintext-token");
    expect(maybeDecrypt("  ")).toBeNull();
    const payload = encryptSecret("real-secret-654321");
    expect(maybeDecrypt(payload)).toBe("real-secret-654321");
  });

  test("маска: точки + последние 4 символа", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("••••mnop");
    expect(maskSecret("1234")).toBe("••••");
    expect(maskSecret("123")).toBe("••••");
  });
});
