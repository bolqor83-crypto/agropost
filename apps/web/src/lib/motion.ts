/**
 * ЭТАП 8 — логика движения (чистая, тестируется bun:test в
 * lib/__tests__/motion.test.ts): easing, prefers-reduced-motion,
 * длительность count-up и обёртка View Transitions API.
 *
 * Всё здесь SSR-безопасно: нет document/window — мгновенные значения.
 */

/** Пользователь просил «уменьшить движение»? (media injected — для тестов) */
export function prefersReducedMotionGiven(
  mq: { matches: boolean } | null | undefined,
): boolean {
  return mq?.matches === true;
}

/** prefers-reduced-motion в браузере (вне браузера — false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return prefersReducedMotionGiven(window.matchMedia("(prefers-reduced-motion: reduce)"));
}

/** ease-out cubic: быстрый старт → мягкая остановка (count-up чисел). */
export function easeOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

/** Длительность count-up: при reduced-motion — мгновенно (0 мс). */
export function numberDurationMs(reducedMotion: boolean, durationMs = 600): number {
  return reducedMotion ? 0 : durationMs;
}

/** Промежуточное значение count-up от from к to. */
export function countUpValue(from: number, to: number, easedT: number): number {
  return from + (to - from) * easedT;
}

type DocWithVT = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

/**
 * View Transitions API: обернуть смену состояния (навигацию).
 * — нет API (Safari/Firefox без флага) → мгновенно, без анимации;
 * — prefers-reduced-motion → мгновенно (CSS-псевдоэлементы отключены
 *   и CSS-правилами, здесь — двойная защита);
 * — иначе: API само снимет «старый» и «новый» кадр и проиграет
 *   кросс-фейд из globals.css (::view-transition-old/new(root)).
 * Внутри колбэка ждём кадр — React успевает отрисовать новый экран.
 */
export async function withViewTransition(update: () => void | Promise<void>): Promise<void> {
  const doc = typeof document === "undefined" ? null : (document as DocWithVT);
  if (!doc || typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
    await update();
    return;
  }
  await doc
    .startViewTransition(async () => {
      await update();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    })
    .finished.catch(() => {
      /* переход отменён (быстрая повторная навигация) — не падаем */
    });
}
