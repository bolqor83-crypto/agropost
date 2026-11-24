/**
 * ЭТАП 10 — подписи источников лидов для инбокса.
 *
 * Бейдж рядом с именем покупателя: из Telegram-бота, из TG-чата
 * (userbot), из MAX-бота, с Авито, вручную. TELEGRAM_BOT — умолчание,
 * бейдж не рисуем (инбокс исторически «про бота»).
 */

import type { LeadSource } from "@shared/types";

export type SourceTone = "neutral" | "green" | "warm" | "danger" | "outline";

export interface SourceBadge {
  label: string;
  tone: SourceTone;
  /** false — не рисуем бейдж (умолчание инбокса). */
  hidden: boolean;
}

const SOURCE_BADGE: Record<LeadSource, SourceBadge> = {
  TELEGRAM_BOT: { label: "TG-бот", tone: "outline", hidden: true },
  TELEGRAM_CHAT: { label: "TG-чат", tone: "warm", hidden: false },
  MAX: { label: "MAX", tone: "green", hidden: false },
  AVITO: { label: "Авито", tone: "outline", hidden: false },
  MANUAL: { label: "Вручную", tone: "outline", hidden: false },
};

export function leadSourceBadge(source: LeadSource): SourceBadge {
  return SOURCE_BADGE[source] ?? SOURCE_BADGE.MANUAL;
}
