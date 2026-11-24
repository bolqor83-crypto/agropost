import { create } from "zustand";
import type { AccountDTO, ChannelDTO } from "@shared/types";
import * as api from "../api/client";

/**
 * Каталог этапа 2: каналы и аккаунты. Один источник для «Каналов»,
 * «Аккаунтов» и потока «Разместить». Экран «Каналы» фильтрует и ищет
 * локально по загруженному списку; после мутаций — load(true).
 */

interface ChannelsState {
  channels: ChannelDTO[];
  accounts: AccountDTO[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

export const useChannels = create<ChannelsState>((set, get) => ({
  channels: [],
  accounts: [],
  loading: false,
  loaded: false,
  error: null,

  load: async (force = false) => {
    const { loading, loaded } = get();
    if (loading) return;
    if (loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const [channels, accounts] = await Promise.all([api.listChannels(), api.listAccounts()]);
      set({ channels, accounts, loading: false, loaded: true });
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : "Не удалось загрузить каналы",
      });
    }
  },
}));
