/**
 * ЭТАП «СЕКРЕТЫ» — UI-хелперы для полей переменных окружения.
 *
 * Чистые функции (без React) — тестируются bun test, компонент
 * SecretField и экраны настроек используют их для подписей и подсказок.
 */

import type { SecretItemDTO } from "@shared/types";

/** Человекочитаемый статус поля: для чипа рядом с названием. */
export function secretStatusChip(item: SecretItemDTO): { label: string; tone: "green" | "warm" | "outline" } {
  if (item.source === "env") return { label: "через env", tone: "outline" };
  if (item.configured) return { label: `настроено ${item.mask ?? ""}`.trim(), tone: "green" };
  return { label: "не настроено", tone: "warm" };
}

/** Placeholder поля ввода: маска, если значение задано. */
export function secretPlaceholder(item: SecretItemDTO | null): string {
  if (!item) return "строка значения";
  if (item.source === "env") return "задан в env";
  return item.configured && item.mask ? item.mask : "строка значения";
}

/** Подсказка под полем: что делать и когда вступает в силу. */
export function secretHint(item: SecretItemDTO): string {
  if (item.source === "env") return "задан переменной окружения (env) — правка здесь недоступна";
  if (item.restart) {
    return item.configured
      ? "сохранено зашифрованным в базе; новые значения — после перезапуска API"
      : "сохраняется зашифрованным в базе; вступает в силу после перезапуска API";
  }
  return item.configured
    ? "сохранено зашифрованным в базе; применяется сразу"
    : "сохраняется зашифрованным в базе (AES-256-GCM), применяется сразу";
}

/** Итог проверки подключения: короткая строка для тоста. */
export function secretTestToast(pass: boolean): string {
  return pass ? "Проверка прошла — подключение работает" : "Проверка не прошла — см. детали на экране";
}

/** Форматирование записи истории изменений. */
export function formatSecretChange(change: {
  action: string;
  field: string;
  detail: string | null;
  createdAt: string;
}): string {
  const what = change.action === "secret.set" ? "изменён" : "убран";
  const detail = change.detail ? ` (${change.detail})` : "";
  return `${change.field} ${what}${detail}`;
}
