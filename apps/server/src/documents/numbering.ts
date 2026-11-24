/**
 * Нумерация документов и сделок (этап 4).
 * «СЧ-001» → «СЧ-002»: счётчик берётся из БД (count по типу),
 * коллизии на unique-номере разрешаются повтором (редко, но возможно).
 */

import { DOCUMENT_TYPE_PREFIX } from "@shared/labels";
import type { DocumentType } from "@shared/types";

/** Номер документа по типу и количеству уже созданных: СЧ-001, Д-001… */
export function documentNumber(type: DocumentType, existingCount: number): string {
  const prefix = DOCUMENT_TYPE_PREFIX[type];
  return `${prefix}-${String(existingCount + 1).padStart(3, "0")}`;
}

/** Номер сделки: СД-0001, СД-0002… */
export function dealNumber(existingCount: number): string {
  return `СД-${String(existingCount + 1).padStart(4, "0")}`;
}
