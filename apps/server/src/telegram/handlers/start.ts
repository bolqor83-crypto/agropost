/**
 * /start — приветствие + инструкция (часть B ТЗ).
 * Deep link из объявления: t.me/{bot}?start=pos_{positionId} —
 * бот сразу называет позицию и привязывает вопрос к ней.
 */

import type { TgMessage, TelegramDeps } from "../types.js";

const STATUS_LABEL: Record<"IN_STOCK" | "ON_ORDER" | "OUT_OF_STOCK", string> = {
  IN_STOCK: "в наличии",
  ON_ORDER: "под заказ",
  OUT_OF_STOCK: "нет в наличии",
};

function rub(value: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ₽/кг`;
}

export async function handleStartCommand(msg: TgMessage, deps: TelegramDeps): Promise<void> {
  const from = msg.from;
  if (!from || msg.chat.type !== "private") {
    /* /start в группе/канале — молча игнорируем. */
    return;
  }

  /* Владелец: короткий статус вместо приветствия покупателя. */
  if (deps.cfg.ownerId !== null && from.id === deps.cfg.ownerId) {
    const newLeads = await deps.db.countNewLeads();
    await deps.api
      .sendMessage(
        deps.cfg.ownerId,
        `Бот АгроПоста работает. Новых сообщений: ${newLeads}.\nИнбокс: ${deps.cfg.webUrl}/inbox`,
      )
      .catch(() => undefined);
    return;
  }

  const payload = (msg.text ?? "").replace(/^\/start\s*/i, "").trim();
  const externalId = String(from.id);

  const lead =
    (await deps.db.findLeadByExternal("TELEGRAM_BOT", externalId)) ??
    (await deps.db.createLead({
      source: "TELEGRAM_BOT",
      externalId,
      externalUsername: from.username ?? null,
      name: [from.first_name, from.last_name].filter(Boolean).join(" ") || null,
    }));

  /* pos_{positionId} из deep link объявления. */
  let brief = null as Awaited<ReturnType<typeof deps.db.positionBrief>>;
  if (payload.startsWith("pos_")) {
    const positionId = payload.slice("pos_".length).trim();
    if (positionId) {
      brief = await deps.db.positionBrief(positionId);
      if (brief) {
        await deps.db.updateLead(lead.id, { positionId: brief.id });
      }
    }
  }

  const text = brief
    ? `Здравствуйте! Вы спрашиваете про: ${brief.name} — ${rub(brief.salePrice)}, ` +
      `${STATUS_LABEL[brief.status]}, остаток ${new Intl.NumberFormat("ru-RU").format(brief.volumeKg)} кг.\n` +
      "Отгрузка — Краснодарский край. Напишите ваш вопрос (объём, город доставки) — ответим в течение дня."
    : "Здравствуйте! Оптовая продажа сельхозкультур, отгрузка — Краснодарский край.\n" +
      "Напишите, что вас интересует: культура, объём и город доставки — ответим в течение дня.";

  await deps.api.sendMessage(externalId, text).catch(() => undefined);
}
