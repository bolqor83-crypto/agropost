/**
 * Inline-кнопки (callback_query): в MVP у бота нет inline-кнопок —
 * просто подтверждаем нажатие, чтобы «спиннер» не висел вечно.
 */

import type { TgCallbackQuery, TelegramDeps } from "../types.js";

export async function handleCallbackQuery(query: TgCallbackQuery, deps: TelegramDeps): Promise<void> {
  await deps.api.answerCallbackQuery(query.id).catch(() => undefined);
}
