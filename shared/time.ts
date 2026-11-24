/**
 * Границы периодов и дней в часовом поясе Europe/Moscow (этап 5.1).
 *
 * Даты в БД — UTC. Дневная аналитика считается по московскому дню:
 * Moscow = UTC+3 без переходов (с 2014 года), поэтому смещение
 * фиксированное. Единый helper — и для аналитики, и для проверок.
 *
 * Все функции возвращают момент времени (мс от эпохи UTC).
 */

/** Москва: фиксированное UTC+3 (летнее время отменено с 2014). */
export const MOSCOW_TZ_OFFSET_MS = 3 * 3_600_000;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Момент московской полуночи для заданного времени (UTC-мс). */
export function dayStartMoscow(now: number): number {
  const shifted = now + MOSCOW_TZ_OFFSET_MS;
  const shiftedDayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return shiftedDayStart - MOSCOW_TZ_OFFSET_MS;
}

/** Полночь следующего московского дня (конец текущего). */
export function dayEndMoscow(now: number): number {
  return dayStartMoscow(now) + DAY_MS;
}

/** Понедельник 00:00 (Москва) текущей недели. */
export function weekStartMoscow(now: number): number {
  const dayStart = dayStartMoscow(now);
  /* MS-день недели: 0=вс. Сдвиг до понедельника: (dow + 6) % 7 дней назад. */
  const dow = new Date(dayStart).getUTCDay();
  const shift = ((dow + 6) % 7) * DAY_MS;
  return dayStart - shift;
}

/** Первое число 00:00 (Москва) текущего месяца. */
export function monthStartMoscow(now: number): number {
  const shifted = now + MOSCOW_TZ_OFFSET_MS;
  const d = new Date(shifted);
  const monthStartShifted = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return monthStartShifted - MOSCOW_TZ_OFFSET_MS;
}

/* ---------- Периоды аналитики (катящаяся-window семантика) ---------- */
/* Сам тип AnalyticsPeriod живёт в shared/types.ts (общий контракт DTO). */
import type { AnalyticsPeriod } from "./types.js";

/**
 * Начало отчётного периода (UTC-мс; null — «всё время»).
 * Неделя/месяц — катящиеся окна: 7 и 31 день назад. Для календарных
 * границ (начало недели/месяца) есть weekStartMoscow/monthStartMoscow.
 */
export function periodStartMs(period: AnalyticsPeriod, now: number): number | null {
  if (period === "week") return now - 7 * DAY_MS;
  if (period === "month") return now - 31 * DAY_MS;
  return null;
}

/** periodStartMs → Date (для Prisma-фильтров). */
export function periodStartDate(period: AnalyticsPeriod, now: number): Date | null {
  const ms = periodStartMs(period, now);
  return ms === null ? null : new Date(ms);
}

/** «Сегодня по Москве» для счётчиков: московская полночь как Date. */
export function todayStartMoscowDate(now: number): Date {
  return new Date(dayStartMoscow(now));
}

void HOUR_MS;
