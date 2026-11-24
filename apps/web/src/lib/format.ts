/**
 * Форматирование и подписи, которых нет в shared
 * (сделки — домен этапа 4; подписи каналов — в shared/labels).
 */

import { CHANNEL_TYPE_LABEL as SHARED_CHANNEL_TYPE_LABEL } from "@shared/labels";
import type { DealStage } from "../api/types";

const rubFmt = new Intl.NumberFormat("ru-RU");

export function fmtRub(n: number): string {
  return `${rubFmt.format(n)} ₽`;
}

export function fmtNum(n: number): string {
  return rubFmt.format(n);
}

export const CHANNEL_TYPE_LABEL = SHARED_CHANNEL_TYPE_LABEL;

export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  talks: "Переговоры",
  awaiting_payment: "Ждём оплату",
  paid: "К отгрузке",
  shipping: "В доставке",
  done: "Завершена",
};

export const DEAL_STAGE_ORDER: DealStage[] = [
  "talks",
  "awaiting_payment",
  "paid",
  "shipping",
  "done",
];
