/**
 * Журнал изменений переменных (AuditLog): кто, когда, какое поле.
 *
 * Пишем только маски (••••1234) — сырые значения не попадают ни в БД,
 * ни в логи. Сбой записи аудита не роняет сохранение секрета
 * (предупреждение в консоль), чтение при недоступной БД — пустой список.
 */

import { prisma } from "../prisma.js";

export type AuditAction = "secret.set" | "secret.clear";

export interface AuditRecordDTO {
  id: string;
  actor: string;
  action: string;
  field: string;
  detail: string | null;
  createdAt: string;
}

interface AuditStore {
  write(record: { actor: string; action: string; field: string; detail: string | null }): Promise<void>;
  recent(limit: number): Promise<AuditRecordDTO[]>;
}

const prismaAuditStore: AuditStore = {
  async write(record) {
    await prisma.auditLog.create({ data: record });
  },
  async recent(limit) {
    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      field: row.field,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    }));
  },
};

/* Тесты: подмена хранилища аудита (без Prisma). */
let auditStore: AuditStore = prismaAuditStore;

export function setAuditStore(override: AuditStore | null): void {
  auditStore = override ?? prismaAuditStore;
}

/** Записать изменение (сбой не роняет операцию — секрет важнее журнала). */
export async function writeAudit(
  action: AuditAction,
  field: string,
  detail: string | null,
): Promise<void> {
  try {
    await auditStore.write({ actor: "owner", action, field, detail });
  } catch (err) {
    console.warn(`[audit] не записано ${action} ${field}: ${err instanceof Error ? err.message : "ошибка"}`);
  }
}

/** Последние изменения переменных (для экрана «История»). */
export async function recentAudit(limit = 15): Promise<AuditRecordDTO[]> {
  try {
    return await auditStore.recent(limit);
  } catch {
    return [];
  }
}
