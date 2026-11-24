/**
 * Серверные сессии владельца (этап 5.1).
 *
 * Cookie содержит случайный 32-байтный токен (base64url). В хранилище
 * лежит только SHA-256(token) — украденная база не даёт действующих
 * токенов. TTL скользящий: активная сессия продлевается при половине
 * срока; истёкшие вычищаются лениво.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface StoredSession {
  id: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface SessionStore {
  /** Создать сессию; вернуть токен для cookie и запись. */
  create(ttlMs: number): Promise<{ token: string; session: StoredSession }>;
  /** Найти по токену; null — нет/истекла. */
  find(token: string): Promise<StoredSession | null>;
  /** Продлить сессию (скользящий TTL). */
  extend(sessionId: string, ttlMs: number): Promise<void>;
  /** Уничтожить сессию (logout). */
  delete(token: string): Promise<void>;
  /** Вычистить истёкшие; вернуть число удалённых. */
  deleteExpired(): Promise<number>;
}

/* ---------- Общие утилиты ---------- */

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Сравнение токенов в постоянном времени (защита от timing-атак). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* ---------- Prisma-реализация (prod) ---------- */

import { prisma } from "../prisma.js";

type PrismaSession = {
  id: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

function toStored(row: PrismaSession): StoredSession {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  };
}

export const prismaSessionStore: SessionStore = {
  async create(ttlMs) {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    const row = await prisma.ownerSession.create({
      data: { tokenHash: tokenHash(token), expiresAt },
    });
    return { token, session: toStored(row) };
  },

  async find(token) {
    const row = await prisma.ownerSession.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      await prisma.ownerSession.delete({ where: { id: row.id } }).catch(() => undefined);
      return null;
    }
    return toStored(row);
  },

  async extend(sessionId, ttlMs) {
    await prisma.ownerSession
      .update({
        where: { id: sessionId },
        data: { expiresAt: new Date(Date.now() + ttlMs), lastSeenAt: new Date() },
      })
      .catch(() => undefined);
  },

  async delete(token) {
    await prisma.ownerSession
      .delete({ where: { tokenHash: tokenHash(token) } })
      .catch(() => undefined);
  },

  async deleteExpired() {
    const { count } = await prisma.ownerSession.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  },
};

/* ---------- In-memory реализация (тесты; переживает рестарт нет) ---------- */

import { randomUUID } from "node:crypto";

export class MemorySessionStore implements SessionStore {
  readonly sessions = new Map<string, StoredSession>(); /* tokenHash → row */

  create(ttlMs: number): Promise<{ token: string; session: StoredSession }> {
    const token = newSessionToken();
    const now = Date.now();
    const session: StoredSession = {
      id: randomUUID(),
      tokenHash: tokenHash(token),
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + ttlMs),
    };
    this.sessions.set(session.tokenHash, session);
    return Promise.resolve({ token, session });
  }

  find(token: string): Promise<StoredSession | null> {
    const row = this.sessions.get(tokenHash(token));
    if (!row) return Promise.resolve(null);
    if (row.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(row.tokenHash);
      return Promise.resolve(null);
    }
    return Promise.resolve(row);
  }

  extend(sessionId: string, ttlMs: number): Promise<void> {
    for (const row of this.sessions.values()) {
      if (row.id === sessionId) {
        row.expiresAt = new Date(Date.now() + ttlMs);
        row.lastSeenAt = new Date();
      }
    }
    return Promise.resolve();
  }

  delete(token: string): Promise<void> {
    this.sessions.delete(tokenHash(token));
    return Promise.resolve();
  }

  deleteExpired(): Promise<number> {
    let removed = 0;
    const now = Date.now();
    for (const [hash, row] of this.sessions) {
      if (row.expiresAt.getTime() <= now) {
        this.sessions.delete(hash);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
}
