/**
 * Форматирование и подписи, которых нет в shared
 * (подписи сделок и документов — в shared/labels).
 */

import { CHANNEL_TYPE_LABEL as SHARED_CHANNEL_TYPE_LABEL } from "@shared/labels";

const rubFmt = new Intl.NumberFormat("ru-RU");

export function fmtRub(n: number): string {
  return `${rubFmt.format(n)} ₽`;
}

export function fmtNum(n: number): string {
  return rubFmt.format(n);
}

export const CHANNEL_TYPE_LABEL = SHARED_CHANNEL_TYPE_LABEL;

/** Короткая подпись времени: «14:32», «вчера», «12 ноя». */
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d);
}

/** Дата документа: «24.11.2026». */
export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU").format(new Date(iso));
}

import type { DealStatus } from "@shared/types";

/** Тон чипа статуса сделки (для списка и карточки). */
export function dealStatusTone(status: DealStatus): "neutral" | "green" | "warm" | "outline" {
  if (status === "AWAITING_PAYMENT") return "warm";
  if (status === "PAID" || status === "SHIPPED" || status === "DELIVERED") return "green";
  return "neutral";
}
