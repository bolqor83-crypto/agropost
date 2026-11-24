/**
 * Теги каналов и умный подбор (этап 2).
 *
 * Решение: фиксированный словарь в коде + zod-валидация, в БД — String[].
 * Новый тег — правка константы (без миграции), фильтры и подбор остаются
 * строгими, парсеру этапа 2.5 легко матчить входящие объявления по словарю.
 */

import type { ChannelDTO, ChannelTag, CultureType } from "./types";

/** Словарь тегов. Порядок = порядок чипов в UI. */
export const CHANNEL_TAGS = ["SEEDS", "NUT", "LIVESTOCK", "WHOLESALE", "GENERAL"] as const;

export const CHANNEL_TAG_LABEL: Record<ChannelTag, string> = {
  SEEDS: "семена",
  NUT: "орех",
  LIVESTOCK: "животноводство",
  WHOLESALE: "опт",
  GENERAL: "общий",
};

/** Тег вида товара по типу культуры позиции. */
export const CULTURE_TYPE_TO_TAG: Record<CultureType, ChannelTag> = {
  SEED: "SEEDS",
  NUT: "NUT",
};

/** Регионы гео-приоритета: поставщики — Краснодарский край. */
const LOCAL_REGIONS = ["ЮФО", "Краснодарский край", "Кубань"];

export function isLocalRegion(region: string): boolean {
  const r = region.toLowerCase();
  return LOCAL_REGIONS.some((local) => r.includes(local.toLowerCase()));
}

/**
 * Подбор каналов под позицию: тип позиции → тег → регион → охват.
 * 1. Канал должен иметь тег вида товара (SEEDS/NUT);
 * 2. Сортировка: свой регион выше, затем больший охват
 *    (averageReach, если не указан — subscribersCount).
 * Один алгоритм для Fastify (suggest-channels) и мок-API превью.
 */
export function rankChannels(
  channels: ChannelDTO[],
  cultureType: CultureType,
  limit = 5,
): ChannelDTO[] {
  const tag = CULTURE_TYPE_TO_TAG[cultureType];
  const reach = (c: ChannelDTO) => c.averageReach ?? c.subscribersCount ?? 0;
  return channels
    .filter((c) => c.tags.includes(tag))
    .sort((a, b) => {
      const la = isLocalRegion(a.region) ? 1 : 0;
      const lb = isLocalRegion(b.region) ? 1 : 0;
      if (la !== lb) return lb - la;
      return reach(b) - reach(a);
    })
    .slice(0, limit);
}

/* ---------- Этап 2.5: точка входа для подачи объявления ---------- */

/** Куда ведёт кнопка «Открыть канал» в мастере размещения. */
export interface SubmissionTarget {
  url: string;
  /** Подпись кнопки («Открыть @Taganrog_Predlozhka_bot»…). */
  label: string;
}

/** @username без собаки и со собакой — для подписи и deep link. */
function tgLink(username: string): string {
  return `https://t.me/${username.replace(/^@/, "").trim()}`;
}

/**
 * Точка входа подачи по способу из Channel.submissionMethod:
 * - BOT → «Открыть @Taganrog_Predlozhka_bot» (t.me deep link);
 * - ADMIN_CONTACT → «Написать @admn_013» (t.me deep link);
 * - SITE_FORM/CABINET → «Открыть страницу подачи» (Channel.url);
 * - NONE/пустые поля → «Открыть канал» (Channel.url).
 * Deep link t.me строим только для Telegram-каналов: у MAX-ботов
 * свой формат ссылок, там открываем сам канал (url).
 */
export function submissionTarget(channel: ChannelDTO): SubmissionTarget {
  const isTelegram =
    channel.type === "TELEGRAM_CHAT" || channel.type === "TELEGRAM_CHANNEL";
  if (
    channel.submissionMethod === "BOT" &&
    channel.submissionBotUsername?.trim()
  ) {
    return isTelegram
      ? {
          url: tgLink(channel.submissionBotUsername),
          label: `Открыть ${channel.submissionBotUsername.trim()}`,
        }
      : {
          url: channel.url,
          label: `Подача через ${channel.submissionBotUsername.trim()}`,
        };
  }
  if (
    channel.submissionMethod === "ADMIN_CONTACT" &&
    channel.adminContact?.trim()
  ) {
    return isTelegram
      ? {
          url: tgLink(channel.adminContact),
          label: `Написать ${channel.adminContact.trim()}`,
        }
      : {
          url: channel.url,
          label: `Написать ${channel.adminContact.trim()}`,
        };
  }
  if (channel.submissionMethod === "SITE_FORM" || channel.submissionMethod === "CABINET") {
    return { url: channel.url, label: "Открыть страницу подачи" };
  }
  return { url: channel.url, label: "Открыть канал" };
}
