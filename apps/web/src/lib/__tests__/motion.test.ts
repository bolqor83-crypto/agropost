/**
 * Тесты движения (ЭТАП 8): чистая логика lib/motion —
 * easing, prefers-reduced-motion, длительность count-up,
 * деградация View Transitions (нет document → мгновенно).
 * Запуск из корня репозитория: bun test apps/web/src/lib/__tests__/motion.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  countUpValue,
  easeOutCubic,
  numberDurationMs,
  prefersReducedMotionGiven,
  withViewTransition,
} from "../motion.js";

describe("easeOutCubic", () => {
  test("границы: 0 → 0, 1 → 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  test("вне диапазона — клампится (нет NaN и скачков)", () => {
    expect(easeOutCubic(-5)).toBe(0);
    expect(easeOutCubic(5)).toBe(1);
  });

  test("монотонный рост, вторая половина медленнее первой", () => {
    const d1 = easeOutCubic(0.5) - easeOutCubic(0.25);
    const d2 = easeOutCubic(1) - easeOutCubic(0.75);
    expect(d1).toBeGreaterThan(0);
    expect(d2).toBeGreaterThan(0);
    expect(d1).toBeGreaterThan(d2);
  });
});

describe("prefersReducedMotionGiven", () => {
  test("null/undefined/не совпало → false", () => {
    expect(prefersReducedMotionGiven(null)).toBe(false);
    expect(prefersReducedMotionGiven(undefined)).toBe(false);
    expect(prefersReducedMotionGiven({ matches: false })).toBe(false);
  });

  test("matches: true → true", () => {
    expect(prefersReducedMotionGiven({ matches: true })).toBe(true);
  });
});

describe("numberDurationMs (count-up чисел)", () => {
  test("обычный пользователь — 600ms по умолчанию", () => {
    expect(numberDurationMs(false)).toBe(600);
    expect(numberDurationMs(false, 400)).toBe(400);
  });

  test("prefers-reduced-motion → мгновенно (0ms)", () => {
    expect(numberDurationMs(true)).toBe(0);
    expect(numberDurationMs(true, 400)).toBe(0);
  });
});

describe("countUpValue", () => {
  test("интерполяция from → to", () => {
    expect(countUpValue(0, 100, 0)).toBe(0);
    expect(countUpValue(0, 100, 1)).toBe(100);
    expect(countUpValue(100, 200, 0.5)).toBe(150);
  });

  test("переход между старым и новым значением", () => {
    /* маржа изменилась 12 500 → 18 000: на середине — 15 250 */
    expect(countUpValue(12500, 18000, 0.5)).toBe(15250);
  });
});

describe("withViewTransition (деградация)", () => {
  test("нет document (SSR/тесты) — update вызывается, не падает", async () => {
    let called = 0;
    await withViewTransition(() => {
      called += 1;
    });
    expect(called).toBe(1);
  });

  test("update может быть async — дожидаемся его", async () => {
    let done = 0;
    await withViewTransition(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done += 1;
    });
    expect(done).toBe(1);
  });

  test("документ ещё грузится (readyState ≠ complete) — без анимации, сразу update", async () => {
    /* Регрессия «Transition was aborted … DOM update timed out»: первый
       переход после загрузки (редирект с /login) не должен попадать в
       4-секундный лимит колбэка startViewTransition. */
    let started = 0;
    let called = 0;
    const realDoc = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        readyState: "loading",
        startViewTransition: () => {
          started += 1;
          throw new Error("не должен вызываться при незагруженном документе");
        },
      },
    });
    try {
      await withViewTransition(() => {
        called += 1;
      });
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: realDoc,
      });
    }
    expect(started).toBe(0);
    expect(called).toBe(1);
  });
});
