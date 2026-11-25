/**
 * Умная кнопка «Назад» (полиш 26.11.2026).
 *
 * Задача: в установленном PWA нет ни кнопки, ни жеста «назад» браузера,
 * поэтому каждый вложенный экран обязан иметь явную кнопку возврата.
 *
 * Правило: если у текущей записи истории есть ключ (location.key ≠
 * "default"), пользователь пришёл изнутри приложения — честно шагаем
 * назад (navigate(-1)), сохраняя его путь. Если экран открыт напрямую
 * (ссылка, обновление страницы), истории приложения нет — идём на
 * запасной путь (например, «Ещё»).
 */

export type BackTarget = number | string;

/** Ключ записи, который реакт-роутер НЕ создаёт (прямой вход). */
export const DEFAULT_LOCATION_KEY = "default";

/**
 * Куда идти по «Назад»: -1 (шаг назад по истории) либо fallback-путь.
 *
 * @param locationKey ключ текущей записи истории (useLocation().key)
 * @param fallback    путь, если приложение открыто напрямую без истории
 */
export function resolveBackTarget(
  locationKey: string | undefined,
  fallback: string,
): BackTarget {
  return locationKey && locationKey !== DEFAULT_LOCATION_KEY ? -1 : fallback;
}
