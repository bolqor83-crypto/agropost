/**
 * Статусный граф сделки (этап 4) — единый источник для сервера,
 * веба и Next-превью. Переходы строгие: «Заявка → Ожидает оплаты →
 * Оплачено → Отгружено → Доставлено → Закрыто», отменить можно до отгрузки.
 */

import type { DealStatus } from "./types";

/** Порядок таймлайна сделки (без CANCELLED — он рисуется отдельно). */
export const DEAL_STATUS_ORDER: DealStatus[] = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CLOSED",
];

/** Разрешённые переходы. DRAFT → PAID — быстрая сделка без счёта. */
export const DEAL_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  DRAFT: ["AWAITING_PAYMENT", "PAID", "CANCELLED"],
  AWAITING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export const TERMINAL_DEAL_STATUSES: DealStatus[] = ["CLOSED", "CANCELLED"];

/** Незавершённые сделки — для счётчика «Активные сделки» на Пульте. */
export const ACTIVE_DEAL_STATUSES: DealStatus[] = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "PAID",
  "SHIPPED",
  "DELIVERED",
];

export function canTransitionDeal(from: DealStatus, to: DealStatus): boolean {
  return (DEAL_TRANSITIONS[from] ?? []).includes(to);
}

export function isDealTerminal(status: DealStatus): boolean {
  return TERMINAL_DEAL_STATUSES.includes(status);
}

/** Удалять можно только черновики и отменённые — историю не трогаем. */
export function canDeleteDeal(status: DealStatus): boolean {
  return status === "DRAFT" || status === "CANCELLED";
}
