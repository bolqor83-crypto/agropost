/**
 * Домен сделок (этап 4) и лента активности.
 * Каналы/аккаунты/размещения (этап 2) и каталог (этап 1) живут
 * в shared/types — это контракт API, общий с сервером и Next-превью.
 */

import type { ChannelType } from "@shared/types";

export type { ChannelType };

export type DealStage = "talks" | "awaiting_payment" | "paid" | "shipping" | "done";

export interface Deal {
  id: string;
  positionId: string;
  buyer: string;
  bags: number;
  stage: DealStage;
  delivery: {
    mode: "pickup" | "carrier" | "driver";
    carrier?: string;
    costRub: number;
    /** доставку всегда оплачивает покупатель */
    paidByBuyer: true;
    track?: string;
  };
}

export interface ActivityItem {
  id: string;
  positionName: string;
  /** Имя канала (одно размещение) или null (сводка «в N каналов»). */
  channelName: string | null;
  channelType: ChannelType | null;
  /** Заполнен при channelName = null: во сколько каналов разместили. */
  channelsCount?: number;
  mode: "auto" | "semi";
  when: string;
}
