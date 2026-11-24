/**
 * Тонкий клиент Bot API поверх grammY (транспорт по ТЗ этапа 3.2).
 * Вся логика модуля зависит только от интерфейса TgApi — в тестах
 * он подменяется фейком без живого бота.
 */

import type { Bot } from "grammy";
import type { TgApi, TgSendOptions } from "./types.js";

export function createTgApi(bot: Bot): TgApi {
  return {
    async getMe() {
      const me = await bot.api.getMe();
      return { id: me.id, username: me.username, first_name: me.first_name };
    },
    async sendMessage(chatId, text, opts?: TgSendOptions) {
      const result = await bot.api.sendMessage(chatId, text, {
        parse_mode: opts?.parseMode,
        reply_markup: opts?.replyMarkup
          ? { inline_keyboard: opts.replyMarkup.map((row) => row.map((b) => ({ text: b.text, url: b.url }))) }
          : undefined,
      });
      return { message_id: result.message_id };
    },
    async getChat(chatId) {
      const chat = await bot.api.getChat(chatId);
      return {
        id: chat.id,
        type: chat.type,
        username: chat.username,
        title: chat.title,
      };
    },
    async getChatMember(chatId, userId) {
      const member = await bot.api.getChatMember(chatId, userId);
      return { status: member.status };
    },
    async getChatMemberCount(chatId) {
      return await bot.api.getChatMemberCount(chatId);
    },
    async setWebhook(url, secret) {
      await bot.api.setWebhook(url, {
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });
      return true as const;
    },
    async getWebhookInfo() {
      const info = await bot.api.getWebhookInfo();
      return {
        url: info.url,
        pending_update_count: info.pending_update_count,
        last_error_message: info.last_error_message ?? undefined,
      };
    },
    async answerCallbackQuery(queryId) {
      await bot.api.answerCallbackQuery(queryId);
      return true as const;
    },
  };
}
