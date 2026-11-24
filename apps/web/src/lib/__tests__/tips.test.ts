/**
 * Тесты обучающих подсказок (ЭТАП 7): подсказки показываются ТОЛЬКО
 * по условию — приветственный баннер при пустых реквизитах (и гаснет
 * после «Позже»), совет про гео-ротацию — один раз, подсказка «Отправка
 * после полной оплаты» — только при создании первой сделки.
 * Запуск из корня репозитория: bun test apps/web/src/lib/__tests__/tips.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  buildLaunchPlan,
  dismissTip,
  requisitesMissing,
  shouldShowFirstDealTip,
  shouldShowGeoRotationTip,
  shouldShowWelcomeTip,
  tipDismissed,
} from "../tips.js";

const FULL = { inn: "123", address: "ст. Павловская", bank: "АО «Банк»", bik: "040000000", account: "40802…" };
const EMPTY = { inn: null, address: null, bank: null, bik: null, account: null };

describe("приветственный баннер (этап 7)", () => {
  test("показывается ТОЛЬКО при пустых реквизитах", () => {
    expect(shouldShowWelcomeTip(EMPTY, false)).toBe(true);
    expect(shouldShowWelcomeTip(null, false)).toBe(true);
    expect(shouldShowWelcomeTip(FULL, false)).toBe(false);
  });

  test("частично заполненные реквизиты — баннер остаётся", () => {
    expect(shouldShowWelcomeTip({ ...FULL, bik: null }, false)).toBe(true);
    expect(requisitesMissing({ ...FULL, account: "" })).toBe(true);
    expect(requisitesMissing(FULL)).toBe(false);
  });

  test("после «Позже» (dismiss) баннер больше не показывается", () => {
    expect(shouldShowWelcomeTip(EMPTY, true)).toBe(false);
    expect(shouldShowWelcomeTip(FULL, true)).toBe(false);
  });
});

describe("совет про гео-ротацию (этап 7)", () => {
  test("показывается один раз, пока не закрыт", () => {
    expect(shouldShowGeoRotationTip(false)).toBe(true);
    expect(shouldShowGeoRotationTip(true)).toBe(false);
  });
});

describe("подсказка «Отправка после полной оплаты» (этап 7)", () => {
  test("только при создании ПЕРВОЙ сделки (0 сделок)", () => {
    expect(shouldShowFirstDealTip(0)).toBe(true);
    expect(shouldShowFirstDealTip(1)).toBe(false);
    expect(shouldShowFirstDealTip(42)).toBe(false);
  });
});

describe("«Скопировать инструкцию» — план запуска (этап 7)", () => {
  test("готовое идёт с ✔, неготовое — нумерованный шаг с подсказкой", () => {
    const text = buildLaunchPlan({
      ready: 1,
      total: 3,
      items: [
        { id: "requisites", label: "Реквизиты заполнены", done: true },
        { id: "supplier", label: "Поставщик добавлен", hint: "«Ещё» → «Поставщики»" },
        { id: "r2", label: "R2 настроен (для фото)", optional: true },
      ],
    });
    expect(text).toContain("АгроПост — план запуска (готово 1 из 3)");
    expect(text).toContain("✔ Реквизиты заполнены");
    expect(text).toContain("1. Поставщик добавлен");
    expect(text).toContain("«Ещё» → «Поставщики»");
    expect(text).toContain("2. R2 настроен (для фото) (опционально)");
    expect(text).not.toContain("✔ Поставщик");
  });

  test("полный чек-лист — честное «Всё готово» без шагов", () => {
    const text = buildLaunchPlan({
      ready: 2,
      total: 2,
      items: [
        { id: "a", label: "Первый", done: true },
        { id: "b", label: "Второй", done: true },
      ],
    });
    expect(text).toContain("Всё готово");
    expect(text).not.toMatch(/^\d+\. /m);
  });
});

describe("флаги localStorage (этап 7)", () => {
  test("вне браузера (нет window) подсказка НЕ считается закрытой и не падает", () => {
    /* bun:test — window нет; dismiss молча игнорируется */
    dismissTip("welcome");
    expect(tipDismissed("welcome")).toBe(false);
    expect(tipDismissed("geo-rotation")).toBe(false);
  });
});
