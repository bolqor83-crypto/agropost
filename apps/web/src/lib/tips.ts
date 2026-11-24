/**
 * ЭТАП 7 — обучающие подсказки: ЧИСТАЯ логика показа (без React),
 * чтобы проверять тестами bun:test в lib/__tests__/tips.test.ts.
 *
 * Правила (из ТЗ этапа 7):
 * - приветственный баннер — только при ПУСТЫХ реквизитах, закрывается «Позже»;
 * - совет про гео-ротацию в мастере публикации — ОДИН раз (закрывается навсегда);
 * - подсказка «Отправка после полной оплаты» — только при создании ПЕРВОЙ сделки;
 * - «Скопировать инструкцию» — текст пошагового плана запуска из чек-листа.
 *
 * Хранение «закрытых» подсказок — localStorage (ключ agropost.tip.<id> = "1").
 * SSR/тесты: нет window → считаем, что подсказка не закрыта (не падаем).
 */

/** Поля, без которых документы не сформировать (как в ProfileScreen). */
export interface RequisitesLike {
  inn?: string | null;
  address?: string | null;
  bank?: string | null;
  bik?: string | null;
  account?: string | null;
}

/** Реквизиты пустые: нет хотя бы одного обязательного для документов поля. */
export function requisitesMissing(profile: RequisitesLike | null | undefined): boolean {
  if (!profile) return true;
  return Boolean(
    !profile.inn || !profile.address || !profile.bank || !profile.bik || !profile.account,
  );
}

/* ---------- localStorage (мягкие флаги «не показывать снова») ---------- */

export type TipId = "welcome" | "geo-rotation";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; /* приватный режим браузера — просто показываем подсказку */
  }
}

/** Подсказка уже закрыта пользователем («Позже» / «Понятно»). */
export function tipDismissed(id: TipId): boolean {
  return storage()?.getItem(`agropost.tip.${id}`) === "1";
}

/** Пользователь закрыл подсказку — больше не показываем на этом устройстве. */
export function dismissTip(id: TipId): void {
  storage()?.setItem(`agropost.tip.${id}`, "1");
}

/* ---------- Правила показа ---------- */

/** Баннер «Добро пожаловать»: реквизиты пустые И не закрыт вручную. */
export function shouldShowWelcomeTip(
  profile: RequisitesLike | null | undefined,
  dismissed: boolean,
): boolean {
  return requisitesMissing(profile) && !dismissed;
}

/** Совет про гео-ротацию: показываем один раз, пока не закрыт. */
export function shouldShowGeoRotationTip(dismissed: boolean): boolean {
  return !dismissed;
}

/** «Отправка после полной оплаты»: только при создании ПЕРВОЙ сделки. */
export function shouldShowFirstDealTip(existingDealsCount: number): boolean {
  return existingDealsCount === 0;
}

/* ---------- «Скопировать инструкцию» (план запуска в буфер) ---------- */

export interface LaunchPlanItem {
  id: string;
  label: string;
  hint?: string;
  done?: boolean;
  optional?: boolean;
}

export interface LaunchPlanData {
  ready?: number;
  total?: number;
  items: LaunchPlanItem[];
}

/** Текст пошагового плана запуска — чтобы отправить помощнику или сохранить. */
export function buildLaunchPlan(data: LaunchPlanData): string {
  const ready = data.ready ?? data.items.filter((i) => i.done).length;
  const total = data.total ?? data.items.length;
  const head = `АгроПост — план запуска (готово ${ready} из ${total})`;
  const done = data.items.filter((i) => i.done);
  const todo = data.items.filter((i) => !i.done);
  const lines: string[] = [head, ""];
  if (done.length > 0) {
    lines.push("Уже готово:");
    for (const item of done) lines.push(`✔ ${item.label}`);
    lines.push("");
  }
  if (todo.length > 0) {
    lines.push("Осталось сделать:");
    todo.forEach((item, i) => {
      const opt = item.optional ? " (опционально)" : "";
      lines.push(`${i + 1}. ${item.label}${opt}`);
      if (item.hint) lines.push(`   ${item.hint}`);
    });
  } else {
    lines.push("Всё готово — можно работать. Удачных продаж!");
  }
  return lines.join("\n");
}

/** Копирование текста в буфер: clipboard API, fallback — скрытая textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* переходим к fallback */
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
