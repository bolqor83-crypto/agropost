import { create } from "zustand";
import type { ChannelType } from "@shared/types";
import { INITIAL_ACTIVITY } from "../features/activity.mock";
import type { ActivityItem } from "../api/types";

/**
 * Поток «Разместить» (этап 2): позиция → каналы (умный подбор) →
 * черновики текста → сводка. Черновики и статусы живут в API
 * (Listing), здесь — только навигационное состояние.
 */

interface PublishState {
  step: 1 | 2 | 3 | 4;
  positionId: string | null;
  channelIds: string[];
  setStep: (step: 1 | 2 | 3 | 4) => void;
  choosePosition: (id: string) => void;
  toggleChannel: (id: string) => void;
  reset: () => void;
}

export const usePublishStore = create<PublishState>((set) => ({
  step: 1,
  positionId: null,
  channelIds: [],
  setStep: (step) => set({ step }),
  choosePosition: (id) => set({ positionId: id }),
  toggleChannel: (id) =>
    set((s) => ({
      channelIds: s.channelIds.includes(id)
        ? s.channelIds.filter((x) => x !== id)
        : [...s.channelIds, id],
    })),
  reset: () => set({ step: 1, positionId: null, channelIds: [] }),
}));

/**
 * Лента «Последние размещения» на Пульте.
 */

interface ActivityState {
  items: ActivityItem[];
  addItems: (
    rows: {
      positionName: string;
      channelName: string | null;
      channelType: ChannelType | null;
      channelsCount?: number;
      /** Города каналов с гео-ротацией (этап 2.1). */
      cities?: string[];
      mode: "auto" | "semi";
    }[],
  ) => void;
}

let activitySeq = 0;

export const useActivityStore = create<ActivityState>((set) => ({
  items: INITIAL_ACTIVITY,
  addItems: (rows) =>
    set((s) => ({
      items: [
        ...rows.map((r) => ({ ...r, id: `act-new-${++activitySeq}`, when: "только что" })),
        ...s.items,
      ],
    })),
}));

/**
 * Тосты: тихие, короткие, без действий.
 * ЭТАП 8: у тоста появился вид (info/success/error) и прогресс жизни
 * (в AppShell — .toast-progress, 2.4s = таймер ниже).
 */

export type ToastKind = "info" | "success" | "error";

interface ToastState {
  message: string | null;
  kind: ToastKind;
  show: (msg: string, kind?: ToastKind) => void;
  hide: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  kind: "info",
  show: (msg, kind = "info") => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ message: msg, kind });
    toastTimer = setTimeout(() => set({ message: null }), 2400);
  },
  hide: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ message: null });
  },
}));
