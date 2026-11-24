/**
 * In-memory кэш AI-ответов, TTL 24 часа. Ключ — SHA-256 входа.
 * Храним только успешные ответы AI (не fallback): шаблон дешёвый,
 * а AI стоит денег. Инвалидация — по positionId (PATCH позиции/канала).
 *
 * MVP: Map в процессе API. Free tier Render засыпает — кэш теряется,
 * это допустимо; Redis появится, если понадобится.
 */

export interface AiCacheEntry<T = unknown> {
  at: number;
  data: T;
  positionIds: string[];
}

export class AiCache {
  private readonly map = new Map<string, AiCacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 500;
  }

  get<T>(hash: string): T | null {
    const entry = this.map.get(hash);
    if (!entry) return null;
    if (Date.now() - entry.at > this.ttlMs) {
      this.map.delete(hash);
      return null;
    }
    /* LRU-подобное поведение: переносим в конец. */
    this.map.delete(hash);
    this.map.set(hash, entry);
    return entry.data as T;
  }

  set<T>(hash: string, data: T, positionIds: string[] = []): void {
    this.map.delete(hash);
    this.map.set(hash, { at: Date.now(), data, positionIds: [...new Set(positionIds)] });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  invalidate(options: { positionId?: string; all?: boolean } = {}): void {
    if (options.all) {
      this.map.clear();
      return;
    }
    const positionId = options.positionId;
    if (!positionId) return;
    for (const [hash, entry] of this.map) {
      if (entry.positionIds.includes(positionId)) this.map.delete(hash);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const aiCache = new AiCache();

export function invalidateAiCache(options: { positionId?: string; all?: boolean } = {}): void {
  aiCache.invalidate(options);
}
