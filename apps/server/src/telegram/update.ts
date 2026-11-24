/**
 * Роутер апдейтов: message → хендлеры, callback_query → answer.
 * Любая ошибка глушится наверху (webhook всегда отвечает 200,
 * иначе Telegram будет бесконечно ретраить).
 */

import type { TelegramDeps, TgUpdate } from "./types.js";
import { handleIncomingMessage } from "./handlers/message.js";
import { handleStartCommand } from "./handlers/start.js";
import { handleCallbackQuery } from "./handlers/callback.js";

export async function handleTelegramUpdate(update: TgUpdate, deps: TelegramDeps): Promise<void> {
  const msg = update.message;
  if (msg) {
    const text = (msg.text ?? "").trim();
    if (/^\/start\b/i.test(text)) {
      await handleStartCommand(msg, deps);
      return;
    }
    if (text.startsWith("/")) {
      /* Прочие команды покупателя (/stop и т.п.) — молча. */
      return;
    }
    await handleIncomingMessage(msg, deps);
    return;
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, deps);
  }
}
