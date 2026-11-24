/**
 * Очистка клиентского состояния при выходе (этап 5.1).
 *
 * PWA-приватность: приватных API-ответов в кеш Service Worker нет
 * (SW кеширует только статическую оболочку, runtime-caching /api
 * не настроен — см. vite.config.ts). Остаток чувствительного
 * состояния — in-memory сторы: чистим их при logout/истечении сессии.
 */

import { useCatalog } from "../stores/catalog";
import { useChannels } from "../stores/channels";
import { useDealCreateStore } from "../stores/deal-create";
import { useActivityStore, usePublishStore, useToastStore } from "../stores/publish";

/** Сброс всех zustand-сторов до исходного состояния. */
export function resetAllStores(): void {
  useCatalog.setState({
    suppliers: [],
    cultures: [],
    positions: [],
    user: null,
    loading: false,
    loaded: false,
    error: null,
  });
  useChannels.setState({
    channels: [],
    accounts: [],
    loading: false,
    loaded: false,
    error: null,
  });
  useDealCreateStore.getState().clear();
  usePublishStore.getState().reset();
  useActivityStore.setState({ items: [] });
  useToastStore.getState().hide();
}
