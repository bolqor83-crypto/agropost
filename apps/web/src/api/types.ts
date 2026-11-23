/**
 * Домен этапов 0/2/4: каналы, сделки, лента активности.
 * Поставщики, культуры и позиции (этап 1) живут в shared/types —
 * это контракт API, общий с сервером и Next-превью.
 */

export type ChannelType = "telegram" | "avito" | "agroserver" | "max" | "yula";

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  region: string;
  tags: string[];
  audience: number | null;
  /** свой канал (пользователь — админ) → автопостинг через бота */
  owned: boolean;
  accountId?: string;
}

export type DealStage =
  | "talks"
  | "awaiting_payment"
  | "paid"
  | "shipping"
  | "done";

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
  channelName: string;
  channelType: ChannelType;
  mode: "auto" | "semi";
  when: string;
}
