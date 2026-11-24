/**
 * /start — приветствие + инструкция (часть B ТЗ).
 * Deep link из объявления (этап 5.1): t.me/{bot}?start=lst_{listingId} —
 * бот называет позицию, привязывает вопрос к ней и ЗАПИСЫВАЕТ
 * достоверный источник: канал конкретного объявления.
 *
 * Атрибуция: first/last touch на Lead + история касаний (LeadTouch).
 * Первый достоверный источник становится First Touch и не перезаписывается;
 * каждый новый переход обновляет Last Touch и дописывает историю.
 *
 * Совместимость: старые ссылки pos_{positionId} продолжают работать
 * (позиция подставляется в приветствие), но источник НЕ приписывается —
 * по одной позиции в разных каналах канал неизвестен (не выдумываем).
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

/** Записать касание + обновить first/last touch лида. */
async function recordTouch(
  leadId: string,
  touch: { listingId: string; channelId: string; positionId: string },
  deps: TelegramDeps,
  isFreshLead: boolean,
): Promise<void> {
  await deps.db.recordLeadTouch(leadId, touch.listingId, touch.channelId);
  const patch = {
    positionId: touch.positionId,
    /* First Touch фиксируется только для нового лида. */
    ...(isFreshLead ? { firstListingId: touch.listingId, firstChannelId: touch.channelId } : {}),
    lastListingId: touch.listingId,
    lastChannelId: touch.channelId,
  };
  await deps.db.updateLead(leadId, patch);
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

  const existing =
    (await deps.db.findLeadByExternal("TELEGRAM_BOT", externalId)) ?? null;
  const isFreshLead = existing === null;
  const lead =
    existing ??
    (await deps.db.createLead({
      source: "TELEGRAM_BOT",
      externalId,
      externalUsername: from.username ?? null,
      name: [from.first_name, from.last_name].filter(Boolean).join(" ") || null,
    }));

  let brief = null as Awaited<ReturnType<typeof deps.db.positionBrief>>;

  /* lst_{listingId} — новая аттрибуция: объявление → канал. */
  if (payload.startsWith("lst_")) {
    const listingId = payload.slice("lst_".length).trim();
    if (listingId) {
      const touch = await deps.db.listingTouch(listingId);
      if (touch) {
        await recordTouch(lead.id, touch, deps, isFreshLead);
        brief = await deps.db.positionBrief(touch.positionId);
      }
    }
  } else if (payload.startsWith("pos_")) {
    /* Старый формат: позиция известна, канал — НЕТ (позиция может
       публиковаться в разных каналах). Источник не выдумываем. */
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
