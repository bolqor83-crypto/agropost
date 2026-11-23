/**
 * Форматирование и подписи, которых нет в shared
 * (каналы и сделки — домены этапов 0/2/4, в shared не переносятся).
 */

import type { ChannelType, DealStage } from "../api/types";

const rubFmt = new Intl.NumberFormat("ru-RU");

export function fmtRub(n: number): string {
  return `${rubFmt.format(n)} ₽`;
}

export function fmtNum(n: number): string {
  return rubFmt.format(n);
}

export const CHANNEL_TYPE_LABEL: Record<ChannelType, string> = {
  telegram: "Telegram",
  avito: "Авито",
  agroserver: "Агросервер",
  max: "Max",
  yula: "Юла",
};

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
