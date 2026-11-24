/**
 * Гео-ротация каналов (этап 2.1).
 *
 * Проблема: ежедневный постинг в одни и те же каналы — спам-сигнал
 * и путь к бану аккаунтов. Решение: ротация по городам внутри региона
 * (Пн — Ростов, Вт — Таганрог, Ср — Шахты…). Каждый канал видит
 * объявление раз в 1–2 недели, покрытие региона — полное.
 *
 * Порог COOLDOWN_DAYS = 3 захардкожен (без настройки в UI) — как
 * pricing/attributes, модуль общий для Fastify, apps/web и Next-превью.
 *
 * Ключевые решения:
 * - cooldown считается ПО КАНАЛУ по последней публикации любого объявления
 *   (банят канал за частоту постинга автора, а не за конкретный товар);
 * - «никогда не размещали» (daysSince = null) — самая желанная площадка:
 *   свежая аудитория, сортируется выше любых «7 дней назад»;
 * - в ротацию (виджет и recommendedCity) входят каналы с тегом товара ИЛИ
 *   GENERAL (барахолка «куплю-продам» принимает любой товар);
 * - в сам список подборки — только строгие совпадения тега (этап 2).
 */

import { CULTURE_TYPE_TO_TAG, isLocalRegion } from "./channels";
import type {
  ChannelDTO,
  CultureType,
  ListingDTO,
  RotationCityDTO,
  RotationDTO,
} from "./types";

/** Cooldown между размещениями в один канал, дней. Хардкод — настройки в UI нет. */
export const COOLDOWN_DAYS = 3;

const DAY_MS = 86_400_000;

/** Целых дней с даты; null — «никогда». Отрицательное (будущее) — 0. */
export function daysSince(date: Date | string | null): number | null {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}

/** Канал/размещение в cooldown: последний пост был меньше COOLDOWN_DAYS назад. */
export function isCoolingDown(listing: { publishedAt: Date | string | null }): boolean {
  const days = daysSince(listing.publishedAt);
  return days !== null && days < COOLDOWN_DAYS;
}

/** Сколько дней ждать до конца cooldown (0 — доступен; «никогда» — 0). */
export function cooldownDaysLeft(days: number | null): number {
  if (days === null) return 0;
  return Math.max(0, COOLDOWN_DAYS - days);
}

/** Минимальная форма размещения для расчётов (DTO и строки Prisma подходят). */
export interface ListingLike {
  channelId: string;
  publishedAt: Date | string | null;
}

/** Последняя публикация по каналам: Map<channelId, publishedAt>. */
export function lastPublishedMap(listings: ListingLike[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const l of listings) {
    if (!l.publishedAt) continue; /* черновики в cooldown не участвуют */
    const at = new Date(l.publishedAt).toISOString();
    const prev = map.get(l.channelId);
    if (prev === undefined || prev === null || at > prev) map.set(l.channelId, at);
  }
  return map;
}

/* ---------- Группировка по региону и городам (виджет ротации) ---------- */

export interface RotationGroup {
  region: string;
  cities: RotationCityDTO[];
}

/**
 * Группирует каналы с городом по регионам. Возвращает группу на регион;
 * города внутри — по убыванию daysSince (никогда — первым).
 * Спецификация звала один объект — массив покрывает случай
 * «городов несколько регионов», API берёт самую крупную группу.
 */
export function rotationGroup(
  channels: Pick<ChannelDTO, "id" | "region" | "city" | "averageReach" | "subscribersCount">[],
  listings: ListingLike[],
): RotationGroup[] {
  const last = lastPublishedMap(listings);
  const byRegion = new Map<string, Map<string, { lastAt: string | null; reach: number }>>();

  for (const ch of channels) {
    if (!ch.city) continue;
    const cities = byRegion.get(ch.region) ?? new Map();
    byRegion.set(ch.region, cities);
    const cell = cities.get(ch.city) ?? { lastAt: null as string | null, reach: 0 };
    const reach = ch.averageReach ?? ch.subscribersCount ?? 0;
    cell.reach = Math.max(cell.reach, reach);
    const at = last.get(ch.id) ?? null;
    if (at !== null && (cell.lastAt === null || at > cell.lastAt)) cell.lastAt = at;
    cities.set(ch.city, cell);
  }

  const groups: RotationGroup[] = [];
  for (const [region, cities] of byRegion) {
    const list: (RotationCityDTO & { reach: number })[] = [];
    for (const [city, cell] of cities) {
      const days = daysSince(cell.lastAt);
      list.push({
        city,
        lastPublishedAt: cell.lastAt,
        daysSince: days,
        available: !isCoolingDown({ publishedAt: cell.lastAt }),
        cooldownDaysLeft: cooldownDaysLeft(days),
        reach: cell.reach,
      });
    }
    list.sort((a, b) => {
      const da = a.daysSince ?? Number.POSITIVE_INFINITY;
      const db = b.daysSince ?? Number.POSITIVE_INFINITY;
      if (da !== db) return db - da;
      if (a.reach !== b.reach) return b.reach - a.reach;
      return a.city.localeCompare(b.city, "ru");
    });
    groups.push({ region, cities: list.map(({ reach, ...city }) => city) });
  }
  return groups;
}

/** Город для сегодняшнего размещения: доступный, «отдохнувший» дольше всех. */
export function recommendedCity(group: RotationGroup): string | null {
  const available = group.cities.filter((c) => c.available);
  if (available.length === 0) return null;
  /* Города уже отсортированы rotationGroup: никогда/давно — выше. */
  return available[0]?.city ?? null;
}

/**
 * Виджет ротации для ответа suggest-channels: крупнейшая группа региона
 * (≥2 городов), только по каналам с тегом товара ИЛИ GENERAL.
 * undefined — ротации нет (городов меньше двух).
 */
export function buildRotation(
  channels: ChannelDTO[],
  listings: ListingLike[],
  cultureType: CultureType,
): RotationDTO | undefined {
  const tag = CULTURE_TYPE_TO_TAG[cultureType];
  const relevant = channels.filter(
    (c) => c.city && (c.tags.includes(tag) || c.tags.includes("GENERAL")),
  );
  const groups = rotationGroup(relevant, listings).sort(
    (a, b) => b.cities.length - a.cities.length,
  );
  const group = groups[0];
  if (!group || group.cities.length < 2) return undefined;
  return { region: group.region, cities: group.cities, recommendedCity: recommendedCity(group) };
}

/* ---------- Ранжирование подборки с учётом ротации ---------- */

const reachOf = (c: ChannelDTO) => c.averageReach ?? c.subscribersCount ?? 0;

/**
 * Подборка каналов под позицию с ротацией: фильтр по тегу товара
 * (как в этапе 2), сортировка — свой регион, затем «не публиковали /
 * давно публиковали» (каналы в cooldown уходят вниз, но остаются
 * в выдаче с бейджем), затем активность и охват.
 */
export function rankForRotation(
  channels: ChannelDTO[],
  listings: ListingLike[],
  cultureType: CultureType,
  limit = 5,
): ChannelDTO[] {
  const tag = CULTURE_TYPE_TO_TAG[cultureType];
  const last = lastPublishedMap(listings);
  return channels
    .filter((c) => c.tags.includes(tag))
    .sort((a, b) => {
      const la = isLocalRegion(a.region) ? 1 : 0;
      const lb = isLocalRegion(b.region) ? 1 : 0;
      if (la !== lb) return lb - la;
      const da = daysSince(last.get(a.id) ?? null) ?? Number.POSITIVE_INFINITY;
      const db = daysSince(last.get(b.id) ?? null) ?? Number.POSITIVE_INFINITY;
      const ca = da < COOLDOWN_DAYS ? 1 : 0;
      const cb = db < COOLDOWN_DAYS ? 1 : 0;
      if (ca !== cb) return ca - cb;
      if (da !== db) return db - da;
      const aa = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const ab = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      if (aa !== ab) return ab - aa;
      return reachOf(b) - reachOf(a);
    })
    .slice(0, limit);
}

/** Каналы подборки + их состояние ротации (cooldown/daysSince). */
export function withRotationInfo(
  channels: ChannelDTO[],
  listings: ListingLike[],
): (ChannelDTO & { cooldown: boolean; daysSince: number | null })[] {
  const last = lastPublishedMap(listings);
  return channels.map((c) => {
    const days = daysSince(last.get(c.id) ?? null);
    return { ...c, cooldown: days !== null && days < COOLDOWN_DAYS, daysSince: days };
  });
}

/** Сводка по листингам канала: когда и сколько раз размещали (карточка канала). */
export function channelHistory(
  channelId: string,
  listings: (ListingDTO | { channelId: string; publishedAt: string | null; publishedCount: number })[],
): { lastPublishedAt: string | null; timesPublished: number } {
  let lastAt: string | null = null;
  let times = 0;
  for (const l of listings) {
    if (l.channelId !== channelId) continue;
    times += l.publishedCount ?? 0;
    if (l.publishedAt) {
      const at = new Date(l.publishedAt).toISOString();
      if (lastAt === null || at > lastAt) lastAt = at;
    }
  }
  return { lastPublishedAt: lastAt, timesPublished: times };
}
