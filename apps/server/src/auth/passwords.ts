/**
 * Пароль владельца: проверка через Argon2id (@node-rs/argon2).
 * В env и в базе лежит только закодированный хеш
 * ($argon2id$v=19$m=…,t=…,p=…$salt$hash) — пароль нигде не хранится.
 *
 * Формат хеша сам кодирует параметры; hash-password генерирует
 * m=19456 KiB (OWASP-минимум), t=2, p=1 — Argon2id.
 */

import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/** Проверить пароль против Argon2id-хеша. false — не совпал/хеш битый. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    /* Битый хеш в env — не раскрываем деталей, просто «не подошёл». */
    return false;
  }
}

/** Сгенерировать Argon2id-хеш (утилита hash-password, не для рантайма).
 * memoryCost — KiB (OWASP-минимум 19456 = 19 МиB), t=2, p=1. */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
