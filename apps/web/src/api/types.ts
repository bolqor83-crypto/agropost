/**
 * Лента активности Пульта. Каналы/аккаунты/размещения (этап 2) и каталог
 * (этап 1) живут в shared/types — это контракт API, общий с сервером и
 * превью. Сделки (этап 4) — тоже в shared/types (DealDTO и друзья).
 */

import type { ChannelType } from "@shared/types";

export type { ChannelType };

export interface ActivityItem {
  id: string;
  positionName: string;
  /** Имя канала (одно размещение) или null (сводка «в N каналов»). */
  channelName: string | null;
  channelType: ChannelType | null;
  /** Заполнен при channelName = null: во сколько каналов разместили. */
  channelsCount?: number;
  /** Города размещённых каналов (гео-ротация, этап 2.1). */
  cities?: string[];
  mode: "auto" | "semi";
  when: string;
}
