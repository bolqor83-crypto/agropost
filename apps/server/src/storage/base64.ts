/**
 * ЭТАП 6 — реализация Storage по умолчанию: файлы в самой базе как data-URL.
 * Ничего не требует, работает всегда (в т.ч. без настроенного R2).
 * Минус — честно задокументирован: БД тяжелеет, отдача медленная.
 */

import type { Storage, StoredFile } from "./types.js";

export function createBase64Storage(): Storage {
  return {
    mode: "base64" as const,
    configured: () => false,
    async upload(key: string, contentType: string, bytes: Buffer): Promise<StoredFile> {
      void key; /* путь не нужен: файл живёт прямо в строке БД */
      return { url: `data:${contentType};base64,${bytes.toString("base64")}`, key: null };
    },
    async delete() {
      /* no-op: файл — часть строки БД, удаляется вместе со строкой. */
    },
  };
}
