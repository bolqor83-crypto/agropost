/**
 * ЭТАП 10 — обработка апдейтов MAX (handlers.ts по структуре ТЗ).
 *
 * Аналог Telegram-бота:
 * - bot_started — приветствие (аналог /start): как задать вопрос по товару;
 * - message_created (dialog) — входящее сообщение покупателя → Lead
 *   (source=MAX, externalId=user_id), Message с mid для дедупликации,
 *   авто-ack первому контакту, уведомление владельцу в Telegram-бот;
 * - сообщения владельца (MAX_USER_ID) — подсказка «управление в инбоксе»;
 * - message_created (chat/channel) — не лид: чужие чаты не обрабатываем;
 * - bot_added — бот добавлен в чат/канал: запоминаем chat_id (привязка
 *   для публикации) и уведомляем владельца в Telegram.
 *
 * Anti-ban: бот ничего не рассылает сам — только ответ на первый контакт.
 */

import { messageMid, messageText } from "./bot.js";
import { extractInterest } from "../telegram/interest.js";
import type { MaxDeps, MaxUpdate, MaxUser } from "./types.js";

const START_TEXT =
  "Здравствуйте! Это бот продавца семян АгроПост. Напишите, какая культура, " +
  "объём и город доставки нужны — ответим в течение дня. Полный каталог: {webUrl}";

const ACK_TEXT =
  "Спасибо за сообщение! Я передал его продавцу — ответим в течение дня. " +
  "Можно сразу написать: какая культура, объём и город доставки?";

const OWNER_REPLY = "Вы — владелец бота. Управление покупателями — в инбоксе приложения";

function fromLabel(from: MaxUser): string {
  return from.username
    ? `@${from.username}`
    : [from.first_name, from.last_name].filter(Boolean).join(" ") || `id ${from.user_id}`;
}

/** bot_started — пользователь запустил бота (аналог /start). */
export async function handleBotStarted(
  update: MaxUpdate,
  deps: MaxDeps,
): Promise<void> {
  const userId = update.bot_started?.user_id;
  if (userId === undefined) return;

  /* Владелец запустил бота — не спамим приветствием. */
  if (deps.cfg.ownerId !== null && userId === deps.cfg.ownerId) return;

  await deps.api
    .sendMessage({ userId }, START_TEXT.replace("{webUrl}", deps.cfg.webUrl))
    .catch(() => undefined);
}

/** Владелец пишет боту в MAX — управление, лид не создаём. */
export async function handleOwnerMaxMessage(deps: MaxDeps, userId: number): Promise<void> {
  const newLeads = await deps.db.countNewLeads();
  await deps.api
    .sendMessage(
      { userId },
      `${OWNER_REPLY}: ${deps.cfg.webUrl}/inbox\nНовых сообщений: ${newLeads}`,
    )
    .catch(() => undefined);
}

/** Входящее сообщение покупателя из личного чата MAX. */
export async function handleIncomingMaxMessage(
  update: MaxUpdate,
  deps: MaxDeps,
): Promise<void> {
  const message = update.message;
  if (!message) return;
  const from = message.sender;
  if (!from || from.is_bot) return;

  /* Только личные диалоги: в группах/каналах бот лидов не создаёт. */
  const chatType = message.recipient?.chat_type ?? "dialog";
  if (chatType !== "dialog") return;

  const text = messageText(message);
  if (!text) return; /* вложения без текста — молча */

  const externalId = String(from.user_id);

  /* Владелец пишет боту в MAX — управление, не лид. */
  if (deps.cfg.ownerId !== null && from.user_id === deps.cfg.ownerId) {
    await handleOwnerMaxMessage(deps, from.user_id);
    return;
  }

  /* Дедупликация: Long Polling может вернуть апдейт повторно. */
  const mid = messageMid(message);
  let lead = await deps.db.findLeadByExternal("MAX", externalId);
  if (lead && mid && (await deps.db.messageExists(lead.id, mid))) return;

  let isNew = false;
  if (!lead) {
    lead = await deps.db.createLead({
      source: "MAX",
      externalId,
      externalUsername: from.username ?? null,
      name: [from.first_name, from.last_name].filter(Boolean).join(" ") || null,
    });
    isNew = true;
  }

  if (mid) {
    await deps.db.createMessage({
      leadId: lead.id,
      direction: "INBOUND",
      text,
      messageId: mid,
    });
  } else {
    await deps.db.createMessage({ leadId: lead.id, direction: "INBOUND", text });
  }

  /* Интерес: культура из текста, если ещё не заполнено. */
  if (!lead.interest) {
    const interest = extractInterest(text, await deps.db.listCultureNames());
    if (interest) await deps.db.updateLead(lead.id, { interest });
  }

  /* @username мог смениться. */
  if (!isNew && lead.externalUsername !== (from.username ?? null)) {
    await deps.db.updateLead(lead.id, { externalUsername: from.username ?? null });
  }

  /* Первый контакт — вежливый авто-ack покупателю (не чаще — анти-бан). */
  if (isNew) {
    await deps.api.sendMessage({ userId: from.user_id }, ACK_TEXT).catch(() => undefined);
  }

  /* Уведомление владельцу — в Telegram-бот (тот же дайджест-нотификатор). */
  if (lead.status === "NEW" || lead.status === "IN_PROGRESS" || lead.status === "ANSWERED") {
    deps.notify.pushNewMessage({ leadId: lead.id, from: `MAX:${fromLabel(from)}`, text });
  }
}

/** bot_added — бота добавили в чат/канал: запоминаем chat_id. */
export async function handleBotAdded(
  update: MaxUpdate,
  deps: MaxDeps,
): Promise<void> {
  const chatId = update.bot_added?.chat_id;
  if (chatId === undefined) return;

  /* Название чата подтягиваем отдельным запросом (не критично). */
  const chat = await deps.api.getChat(chatId).catch(() => null);
  await deps.db.saveDiscoveredChat({
    chatId,
    title: chat?.title ?? null,
    type: chat?.type ?? update.bot_added?.chat_type ?? "chat",
    discoveredAt: new Date().toISOString(),
  });

  /* Уведомляем владельца в Telegram: ID теперь известен. */
  deps.notify.pushNewMessage({
    leadId: "max-bot-added",
    from: "MAX-бот",
    text: `Бот добавлен в чат «${chat?.title ?? chatId}» (ID ${chatId}) — его можно привязать к каналу в «Настройки → MAX»`,
  });
}

/** Роутер апдейтов MAX. */
export async function handleMaxUpdate(update: MaxUpdate, deps: MaxDeps): Promise<void> {
  const type = update.update_type ?? (update.message ? "message_created" : update.bot_started ? "bot_started" : "");
  switch (type) {
    case "message_created":
    case "message_edited":
      await handleIncomingMaxMessage(update, deps);
      return;
    case "bot_started":
      await handleBotStarted(update, deps);
      return;
    case "bot_added":
      await handleBotAdded(update, deps);
      return;
    default:
      /* bot_removed и прочее — не обрабатываем (шум Long Polling). */
      return;
  }
}
