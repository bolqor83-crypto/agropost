/**
 * ЭТАП 6 — абстракция файлового хранилища.
 *
 * Все сохранения файлов (PDF документов, фото рекламаций, медиа позиций)
 * идут через единый интерфейс Storage. Реализация выбирается в factory.ts
 * по env-переменным:
 *   - base64: файл живёт в БД как data-URL (текущий MVP, ничего не требует);
 *   - r2:     Cloudflare R2 (S3-совместимый), публичный URL в БД.
 *
 * Переключение — без правок кода: задать 5 переменных в env (см. .env.example
 * и README «Как настроить R2»). R2 не настроен → base64, приложение работает.
 */

/** Режим хранилища: base64 (в БД) или r2 (Cloudflare R2). */
export type StorageMode = "base64" | "r2";

/** Результат upload: url для БД/клиента + ключ объекта (для r2; null у base64). */
export interface StoredFile {
  /** data-URL (base64) или https://… (r2). */
  url: string;
  /** Ключ объекта в R2; null — когда файл лежит в самой строке БД. */
  key: string | null;
}

export interface Storage {
  readonly mode: StorageMode;
  /** Внешнее хранилище настроено (r2 — true; base64 — false). */
  configured(): boolean;
  /** Сохранить файл. bytes — бинарное содержимое; key — логический путь. */
  upload(key: string, contentType: string, bytes: Buffer): Promise<StoredFile>;
  /** Удалить файл по url (для r2 — DeleteObject; base64 — no-op: файл в строке). */
  delete(url: string): Promise<void>;
}

/** Разобрать data-URL: { mime, bytes } | null (не data-URL или битая base64-часть). */
export function parseDataUrl(value: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([a-z0-9/+.-]+);base64,(.+)$/is.exec(value.trim());
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  /* Buffer.from не бросает на мусоре — сверяем обратную перекодировку. */
  const back = bytes.toString("base64");
  if (!back || back.length !== match[2].length) return null;
  return { mime: match[1].toLowerCase(), bytes };
}
