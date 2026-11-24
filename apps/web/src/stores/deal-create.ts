/**
 * Мост «создать сделку» между экранами: кнопки в карточке лида и позиции
 * кладут предзаполнение сюда, экран «Сделки» подхватывает и открывает
 * форму создания с уже заполненным покупателем/позицией.
 */

import { create } from "zustand";

export interface PendingDealPrefill {
  leadId?: string;
  positionId?: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerRegion?: string;
}

interface DealCreateStore {
  pending: PendingDealPrefill | null;
  setPending: (p: PendingDealPrefill) => void;
  clear: () => void;
}

export const useDealCreateStore = create<DealCreateStore>((set) => ({
  pending: null,
  setPending: (p) => set({ pending: p }),
  clear: () => set({ pending: null }),
}));
