/**
 * Публикация объявления в свой канал через бота (часть D ТЗ, этап 3.2).
 * Чужие чаты не трогаем: только каналы, где наш бот — администратор
 * (getChatMember: administrator/creator). Анти-бан: не чаще одной
 * публикации в канал за 24 часа (обходится ручным подтверждением),
 * пауза 2,5 с между публикациями, предупреждение при аудитории < 1000.
 */

import { ApiError, badRequest, conflict, notFound } from "../errors.js";
import type { TelegramDeps } from "./types.js";

const MIN_PUBLISH_SPACING_MS = 2500;
const SMALL_AUDIENCE = 1000;

/** Модульная память: пауза между публикациями в разные каналы. */
let lastPublishAt = 0;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** @username канала из его ссылки (t.me/name, t.me/s/name, @name). */
export function channelUsernameFromUrl(url: string): string | null {
  const match = url.match(/(?:t\.me\/(?:s\/)?|^@)([A-Za-z0-9_]{4,})/i);
  const username = match?.[1] ?? null;
  return username ? `@${username}` : null;
}

function tgInternalLink(chatId: number, messageId: number): string {
  const internal = String(chatId).replace(/^-100/, "");
  return `https://t.me/c/${internal}/${messageId}`;
}

const STATUS_ERROR_HINT = "бот не администратор канала";

export interface PublishViaBotResult {
  listingId: string;
  url: string | null;
  publishedAt: string;
  warning?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishListingViaBot(
  input: { listingId: string; confirm?: boolean },
  deps: TelegramDeps,
): Promise<PublishViaBotResult> {
  const data = await deps.db.listingWithChannel(input.listingId);
  if (!data) throw notFound("Размещение не найдено");
  const { listing, channel } = data;

  /* Адрес канала: BotConfig (уже проверяли) либо @username из ссылки. */
  const botConfig = await deps.db.findBotConfigByChannelId(channel.id);
  const username = channelUsernameFromUrl(channel.url);
  const target: string | null = botConfig?.telegramChatId ?? username;
  if (!target) {
    throw badRequest(
      "Не удалось определить адрес канала в Telegram — проверьте ссылку канала (t.me/…)",
    );
  }

  let chat;
  try {
    chat = await deps.api.getChat(target);
  } catch {
    throw new ApiError(
      400,
      "CHAT_NOT_FOUND",
      `Канал ${username ?? channel.name} недоступен боту: возможно, ссылка неверна или канал приватный.`,
    );
  }

  /* Бот должен быть администратором. */
  const me = await deps.botInfo();
  if (!me) {
    throw new ApiError(503, "TELEGRAM_NOT_CONFIGURED", "Бот не настроен: задайте TELEGRAM_BOT_TOKEN");
  }
  let member: { status: string };
  try {
    member = await deps.api.getChatMember(chat.id, me.id);
  } catch {
    throw new ApiError(
      403,
      "BOT_NOT_ADMIN",
      `Не удалось проверить права бота в ${username ?? channel.name}. ${STATUS_ERROR_HINT}.`,
    );
  }
  if (member.status !== "administrator" && member.status !== "creator") {
    deps.notify.publishError(channel.name, STATUS_ERROR_HINT);
    throw new ApiError(
      403,
      "BOT_NOT_ADMIN",
      `Бот не администратор в канале ${username ?? channel.name}. Добавьте его админом (право публикации сообщений) — или откройте канал и вставьте текст вручную.`,
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

  /* Малая аудитория — предупреждение, но публикуем. */
  let warning: string | undefined;
  const subs = await deps.api.getChatMemberCount(chat.id).catch(() => null);
  if (subs !== null && subs < SMALL_AUDIENCE) {
    warning = `Малая аудитория: ${subs} подписчиков — возможно, лучше вручную.`;
  }

  /* Текст объявления + вопрос продавцу через бота (white-label). */
  const deepLink = `https://t.me/${me.username}?start=pos_${listing.positionId}`;
  const fullText = `${escapeHtml(listing.text)}\n\n📩 Задать вопрос продавцу: ${deepLink}`;
  const firstBreak = fullText.indexOf("\n");
  const html =
    firstBreak > 0 ? `<b>${fullText.slice(0, firstBreak)}</b>${fullText.slice(firstBreak)}` : fullText;

  let sent;
  try {
    sent = await deps.api.sendMessage(chat.id, html, { parseMode: "HTML" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "неизвестная ошибка";
    deps.notify.publishError(channel.name, reason);
    throw new ApiError(502, "SEND_FAILED", `Telegram не принял сообщение: ${reason}`);
  }

  const url = chat.username
    ? `https://t.me/${chat.username}/${sent.message_id}`
    : tgInternalLink(chat.id, sent.message_id);

  await deps.db.markListingPublished(listing.id, url);
  await deps.db.upsertBotConfig(channel.id, String(chat.id));
  if (channel.accountId) await deps.db.bumpAccountUsedToday(channel.accountId);

  return {
    listingId: listing.id,
    url,
    publishedAt: new Date().toISOString(),
    warning,
  };
}
