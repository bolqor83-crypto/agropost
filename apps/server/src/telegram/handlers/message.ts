/**
 * Входящее сообщение покупателя (часть B ТЗ):
 * лид по externalId (или по reply-привязке) → Message → авто-ack
 * первому контакту → уведомление владельцу (с батчингом).
 * Сообщения от владельца — команды управления, лид не создаётся.
 * Группы не обрабатываем: только личные чаты.
 */

import type { TgMessage, TgUser, TelegramDeps } from "../types.js";
import { extractInterest } from "../interest.js";

const ACK_TEXT =
  "Спасибо за сообщение! Я передал его продавцу — ответим в течение дня. " +
  "Можно сразу написать: какая культура, объём и город доставки?";

const OWNER_REPLY = "Вы — владелец бота. Управление покупателями — в инбоксе приложения";

function fromLabel(from: TgUser): string {
  return from.username
    ? `@${from.username}`
    : [from.first_name, from.last_name].filter(Boolean).join(" ") || `id ${from.id}`;
}

/** Сообщение от владельца: управление, лид не создаём. Подсказываем вход. */
export async function handleOwnerMessage(msg: TgMessage, deps: TelegramDeps): Promise<void> {
  const from = msg.from;
  if (!from || deps.cfg.ownerId === null) return;
  const newLeads = await deps.db.countNewLeads();
  await deps.api
    .sendMessage(
      deps.cfg.ownerId,
      `${OWNER_REPLY}: ${deps.cfg.webUrl}/inbox\nНовых сообщений: ${newLeads}`,
    )
    .catch(() => undefined);
}

/** Входящее сообщение покупателя. */
export async function handleIncomingMessage(msg: TgMessage, deps: TelegramDeps): Promise<void> {
  const from = msg.from;
  if (!from || from.is_bot) return;

  /* Владелец пишет боту — это управление, не лид. */
  if (deps.cfg.ownerId !== null && from.id === deps.cfg.ownerId) {
    await handleOwnerMessage(msg, deps);
    return;
  }

  /* Только личные чаты: в группах бот не создаёт лидов. */
  if (msg.chat.type !== "private") return;

  const text = (msg.text ?? "").trim();
  if (!text) return; /* фото/стикеры без текста — молча */

  const externalId = String(from.id);

  /* Привязка к лиду: ответ на наше сообщение → тот же лид. */
  const replyTo = msg.reply_to_message?.message_id;
  let lead = replyTo ? await deps.db.findLeadByTelegramMessageId(String(replyTo)) : null;
  if (!lead) {
    lead = await deps.db.findLeadByExternal("TELEGRAM_BOT", externalId);
  }

  let isNew = false;
  if (!lead) {
    lead = await deps.db.createLead({
      source: "TELEGRAM_BOT",
      externalId,
      externalUsername: from.username ?? null,
      name: [from.first_name, from.last_name].filter(Boolean).join(" ") || null,
    });
    isNew = true;
  }

  /* Дедупликация: Telegram ретраит webhook. */
  const telegramMessageId = String(msg.message_id);
  if (await deps.db.messageExists(lead.id, telegramMessageId)) return;

  await deps.db.createMessage({
    leadId: lead.id,
    direction: "INBOUND",
    text,
    telegramMessageId,
  });

  /* Интерес: культура из текста, если ещё не заполнено. */
  if (!lead.interest) {
    const interest = extractInterest(text, await deps.db.listCultureNames());
    if (interest) await deps.db.updateLead(lead.id, { interest });
  }
  /* @username мог смениться. */
  if (!isNew && lead.externalUsername !== (from.username ?? null)) {
    await deps.db.updateLead(lead.id, { externalUsername: from.username ?? null });
  }

  /* Первый контакт — вежливый авто-ack покупателю. */
  if (isNew) {
    await deps.api.sendMessage(externalId, ACK_TEXT).catch(() => undefined);
  }

  /* Уведомление владельцу: не для спама и закрытых. */
  if (lead.status === "NEW" || lead.status === "IN_PROGRESS" || lead.status === "ANSWERED") {
    deps.notify.pushNewMessage({ leadId: lead.id, from: fromLabel(from), text });
  }
}
