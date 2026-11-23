import { create } from "zustand";
import type { CultureTemplateDTO, PositionDTO, SupplierDTO, UserDTO } from "@shared/types";
import * as api from "../api/client";

/**
 * Каталог этапа 1: поставщики, шаблоны культур, позиции, профиль.
 * Один источник для Пульта, «Разместить», «Сделок» и мастера позиции.
 * Экран «Позиции» при фильтрах/поиске ходит в API напрямую,
 * а после мутаций обновляет кэш через load(true).
 */

interface CatalogState {
  suppliers: SupplierDTO[];
  cultures: CultureTemplateDTO[];
  positions: PositionDTO[];
  user: UserDTO | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

export const useCatalog = create<CatalogState>((set, get) => ({
  suppliers: [],
  cultures: [],
  positions: [],
  user: null,
  loading: false,
  loaded: false,
  error: null,

  load: async (force = false) => {
    const { loading, loaded } = get();
    if (loading) return;
    if (loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const [suppliers, cultures, positions, user] = await Promise.all([
        api.listSuppliers(),
        api.listCultures(),
        api.listPositions(),
        api.getUser(),
      ]);
      set({ suppliers, cultures, positions, user, loading: false, loaded: true });
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : "Не удалось загрузить каталог",
      });
    }
  },
}));

/** Ставка налога для расчёта маржи (профиль ещё не заполнен — 6%). */
export function taxRateOf(user: UserDTO | null): number {
  return user?.taxRate ?? 0.06;
}
