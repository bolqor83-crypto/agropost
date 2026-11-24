/**
 * ЭТАП 10 — публикация объявления в свой MAX-канал через бота (publish.ts).
 *
 * Чужие чаты не трогаем: только каналы, где наш бот — администратор
 * (GET /chats/{chatId}/bot-membership: is_admin/is_owner). Анти-бан:
 * не чаще одной публикации в канал за 24 часа (обходится подтверждением),
 * пауза 2,5 с между публикациями.
 *
 * chat_id канала в MAX узнаётся только из апдейта bot_added (официальная
 * документация) — он сохраняется в AppSetting "maxDiscovered" и приводится
 * к каналу каталога (AppSetting "maxChats"); при отсутствии привязки
 * chat_id можно передать прямо в запросе публикации.
 */

import { ApiError, badRequest, conflict, notFound } from "../errors.js";
import type { MaxDeps } from "./types.js";

const MIN_PUBLISH_SPACING_MS = 2500;

/** Модульная память: пауза между публикациями в разные каналы. */
let lastPublishAt = 0;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const NOT_ADMIN_HINT = "бот не администратор канала";

export interface PublishViaMaxResult {
  listingId: string;
  chatId: number;
  url: string | null;
  publishedAt: string;
  warning?: string;
}

export interface PublishViaMaxInput {
  listingId: string;
  /** chat_id канала в MAX (если привязки ещё нет — сохранится). */
  chatId?: number;
  confirm?: boolean;
}

export async function publishListingViaMaxBot(
  input: PublishViaMaxInput,
  deps: MaxDeps,
): Promise<PublishViaMaxResult> {
  const data = await deps.db.listingWithChannel(input.listingId);
  if (!data) throw notFound("Размещение не найдено");
  const { listing, channel } = data;

  /* Адрес канала: сохранённая привязка либо chat_id из запроса. */
  const binding = (await deps.db.listChatBindings()).find((b) => b.channelId === channel.id);
  const chatId = binding?.chatId ?? input.chatId;
  if (chatId === undefined) {
    throw badRequest(
      "Не привязан ID канала в MAX (chat_id): добавьте бота в канал — ID придёт автоматически " +
        "(Настройки → MAX), либо укажите числовой ID при публикации.",
    );
  }

  /* Бот должен быть администратором канала. */
  let membership;
  try {
    membership = await deps.api.getBotMembership(chatId);
  } catch {
    throw new ApiError(
      403,
      "MAX_CHAT_NOT_FOUND",
      `Канал ${channel.name} недоступен боту: проверьте chat_id и что бот добавлен в канал.`,
    );
  }
  if (!membership.isAdmin) {
    deps.notify.publishError(channel.name, NOT_ADMIN_HINT);
    throw new ApiError(
      403,
      "BOT_NOT_ADMIN",
      `Бот не администратор в канале ${channel.name}. Назначьте его админом (право write) — ` +
        `или откройте канал и вставьте текст вручную.`,
    );
  }

  /* Анти-бан: не более одной публикации в канал за 24 часа. */
  if (!input.confirm && (await deps.db.publishedInChannelWithin24h(channel.id))) {
    throw conflict(
      "В этом канале уже была публикация за последние 24 часа. Повторить можно только с подтверждением.",
    );
  }

  /* Пауза между публикациями в разные каналы (2–3 с). */
  const wait = MIN_PUBLISH_SPACING_MS - (Date.now() - lastPublishAt);
  if (wait > 0) await sleep(wait);
  lastPublishAt = Date.now();

  /* Текст объявления + вопрос продавцу через бота (white-label).
     Диплинк https://max.ru/<bot>?start=lst_<listingId>: входящий лид
     аттрибутируется объявлению (как в Telegram-боте). */
  const bot = await deps.botInfo();
  const deepLink = bot?.username
    ? `https://max.ru/${bot.username}?start=lst_${listing.id}`
    : `${deps.cfg.webUrl}/inbox`;
  const fullText = `${escapeHtml(listing.text)}\n\n📩 Задать вопрос продавцу: ${deepLink}`;
  const firstBreak = fullText.indexOf("\n");
  const html =
    firstBreak > 0 ? `<b>${fullText.slice(0, firstBreak)}</b>${fullText.slice(firstBreak)}` : fullText;

  let sent;
  try {
    sent = await deps.api.sendMessage({ chatId }, html, { format: "html" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "неизвестная ошибка";
    deps.notify.publishError(channel.name, reason);
    throw new ApiError(502, "SEND_FAILED", `MAX не принял сообщение: ${reason}`);
  }

  await deps.db.markListingPublished(listing.id, sent.url);
  await deps.db.saveChatBinding(channel.id, chatId);
  if (channel.accountId) await deps.db.bumpAccountUsedToday(channel.accountId);

  return {
    listingId: listing.id,
    chatId,
    url: sent.url,
    publishedAt: new Date().toISOString(),
  };
}
