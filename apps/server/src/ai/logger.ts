/**
 * Журнал вызовов AI в таблице AiCall: useCase, inputHash, результат,
 * latency, статус, токены. Нужен для отладки промптов и оценки стоимости.
 * Ошибка записи в журнал НИКОГДА не роняет ответ пользователю.
 */

import { AiCallStatus, Prisma } from "@prisma/client";
import type { AiStatus, AiUseCase } from "@shared/ai";
import { prisma } from "../prisma.js";

export interface AiLogEntry {
  useCase: AiUseCase;
  inputHash: string;
  outputJson: unknown;
  latencyMs: number;
  status: AiStatus;
  errorMessage?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  provider?: string | null;
  model?: string | null;
}

export interface AiLogger {
  log(entry: AiLogEntry): Promise<void>;
}

const STATUS_MAP: Record<AiStatus, AiCallStatus> = {
  ok: AiCallStatus.OK,
  retry: AiCallStatus.RETRY,
  fallback: AiCallStatus.FALLBACK,
  error: AiCallStatus.ERROR,
};

export const dbAiLogger: AiLogger = {
  async log(entry) {
    try {
      await prisma.aiCall.create({
        data: {
          useCase: entry.useCase,
          inputHash: entry.inputHash,
          outputJson: entry.outputJson === undefined ? Prisma.JsonNull : (entry.outputJson as Prisma.InputJsonValue),
          latencyMs: Math.max(0, Math.round(entry.latencyMs)),
          status: STATUS_MAP[entry.status],
          errorMessage: entry.errorMessage ?? null,
          tokensIn: entry.tokensIn ?? null,
          tokensOut: entry.tokensOut ?? null,
          provider: entry.provider ?? null,
          model: entry.model ?? null,
        },
      });
    } catch (err) {
      /* Журнал — не критический путь. Не мешаем пользователю. */
      console.warn("[ai] не удалось записать AiCall:", err instanceof Error ? err.message : err);
    }
  },
};

/** Для тестов: копим в памяти, БД не нужна. */
export class MemoryAiLogger implements AiLogger {
  readonly entries: AiLogEntry[] = [];

  async log(entry: AiLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  get last(): AiLogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }
}
