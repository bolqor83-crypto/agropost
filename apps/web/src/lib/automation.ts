/**
 * ЭТАП 9 — автоматизация публикации: маппинг бейджей и логика кнопки Авито.
 *
 * Бейдж канала в мастере «Разместить» (шаг 2) показывает, кто публикует:
 * - Авто (зелёный) — фид/API обновляют сами (Зерно Он-Лайн, Своё
 *   Фермерство, Авито API, свой бот-админ);
 * - Полуавто (тёплый) — приложение готовит текст, пользователь вставляет;
 * - Ручной (красный) — только точка входа (НССиС).
 *
 * Кнопка «Опубликовать на Авито» живёт состояниями dry-run → превью →
 * подтверждение: состояния чистые, тестируются в __tests__/automation.test.ts.
 */

import type { AutomationLevel, ChannelDTO } from "@shared/types";

export type BadgeTone = "green" | "warm" | "danger";

export interface AutomationBadge {
  label: string;
  tone: BadgeTone;
}

export const AUTOMATION_BADGE: Record<AutomationLevel, AutomationBadge> = {
  AUTO: { label: "Авто", tone: "green" },
  SEMI: { label: "Полуавто", tone: "warm" },
  MANUAL: { label: "Ручной", tone: "danger" },
};

/** Бейдж по уровню автоматизации канала (fallback — SEMI). */
export function automationBadge(level: AutomationLevel | null | undefined): AutomationBadge {
  return AUTOMATION_BADGE[level ?? "SEMI"] ?? AUTOMATION_BADGE.SEMI;
}

/* ---------- Кнопка «Опубликовать на Авито» ---------- */

export type AvitoFlowStep = "idle" | "dry-run" | "preview" | "publishing" | "done";

/** Итог флоу для отображения в карточке канала. */
export interface AvitoFlowState {
  step: AvitoFlowStep;
  /** XML из dry-run — превью до подтверждения. */
  xml: string | null;
  offers: number;
  valid: boolean;
  warnings: string[];
  error: string | null;
}

export const AVITO_FLOW_INITIAL: AvitoFlowState = {
  step: "idle",
  xml: null,
  offers: 0,
  valid: true,
  warnings: [],
  error: null,
};

/** Канал Авито в мастере: показываем кнопку API-публикации. */
export function isAvitoChannel(channel: ChannelDTO | null): boolean {
  return channel !== null && channel.type === "AVITO";
}

/** Кнопка недоступна, пока ключи не заданы (503 AVITO_NOT_CONFIGURED). */
export function avitoButtonEnabled(configured: boolean, step: AvitoFlowStep): boolean {
  if (!configured) return false;
  return step === "idle" || step === "preview" || step === "done";
}

/** Подпись кнопки по состоянию флоу. */
export function avitoButtonLabel(step: AvitoFlowStep): string {
  switch (step) {
    case "dry-run":
      return "Проверяю XML…";
    case "publishing":
      return "Отправляю…";
    case "preview":
      return "Подтвердить отправку";
    case "done":
      return "Отправлено в Авито";
    default:
      return "Опубликовать на Авито";
  }
}

/* ---------- ЭТАП 10: публикация в свой MAX-канал через бота ---------- */

/** MAX-канал в мастере: показываем кнопку публикации MAX-ботом. */
export function isMaxChannel(channel: ChannelDTO | null): boolean {
  return channel !== null && channel.type === "MAX";
}

/** Подпись кнопки публикации в MAX (флоу с подтверждением 24 ч). */
export function maxPublishButtonLabel(opts: {
  publishing: boolean;
  confirm: boolean;
}): string {
  if (opts.publishing) return "Публикую…";
  return opts.confirm ? "Подтвердить публикацию" : "Опубликовать в MAX";
}

/** Привязка chat_id для MAX-канала из статуса (status.channels). */
export function maxChannelChatId(
  channelId: string,
  channels: { channelId: string; chatId: number | null }[] | undefined,
): number | null {
  return channels?.find((c) => c.channelId === channelId)?.chatId ?? null;
}
