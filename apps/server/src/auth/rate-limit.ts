/**
 * Ограничение частоты попыток входа (этап 5.1).
 * Скользящее окно в памяти по IP: N неудач за M минут → 429.
 * Успешный вход сбрасывает счётчик своего IP.
 */

export interface LoginRateLimiter {
  /** false — IP в блокировке, входить рано. */
  canAttempt(ip: string, now: number): boolean;
  /** Зафиксировать неудачную попытку. */
  recordFailure(ip: string, now: number): void;
  /** Сбросить счётчик (успешный вход). */
  reset(ip: string): void;
  /** Секунд до снятия блокировки (для сообщения), 0 — не заблокирован. */
  retryAfterSeconds(ip: string, now: number): number;
}

export class MemoryLoginRateLimiter implements LoginRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  canAttempt(ip: string, now: number): boolean {
    const attempts = this.failures.get(ip)?.filter((t) => now - t < this.windowMs) ?? [];
    return attempts.length < this.maxAttempts;
  }

  recordFailure(ip: string, now: number): void {
    const attempts = (this.failures.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    attempts.push(now);
    this.failures.set(ip, attempts);
  }

  reset(ip: string): void {
    this.failures.delete(ip);
  }

  retryAfterSeconds(ip: string, now: number): number {
    const attempts = this.failures.get(ip)?.filter((t) => now - t < this.windowMs) ?? [];
    if (attempts.length < this.maxAttempts) return 0;
    const oldest = Math.min(...attempts);
    return Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
  }
}
