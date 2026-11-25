/**
 * Тесты UI-хелперов экрана «Переменные»: статусы-чипы, подсказки,
 * плейсхолдеры с масками и формат записей истории изменений.
 */

import { describe, expect, test } from "bun:test";
import type { SecretItemDTO } from "@shared/types";
import {
  formatSecretChange,
  secretHint,
  secretPlaceholder,
  secretStatusChip,
  secretTestToast,
} from "../secrets-ui";

function item(patch: Partial<SecretItemDTO>): SecretItemDTO {
  return {
    key: "FEED_TOKEN",
    label: "Токен фидов",
    group: "feeds",
    configured: true,
    source: "app",
    mask: "••••9999",
    test: "feeds",
    restart: false,
    ...patch,
  };
}

describe("UI-хелперы экрана «Переменные»", () => {
  test("чип статуса: env / настроено с маской / не настроено", () => {
    expect(secretStatusChip(item({ source: "env" }))).toEqual({ label: "через env", tone: "outline" });
    expect(secretStatusChip(item({}))).toEqual({ label: "настроено ••••9999", tone: "green" });
    expect(secretStatusChip(item({ configured: false, source: "none", mask: null }))).toEqual({
      label: "не настроено",
      tone: "warm",
    });
  });

  test("плейсхолдер: маска сохранённого, env или пустое значение", () => {
    expect(secretPlaceholder(item({}))).toBe("••••9999");
    expect(secretPlaceholder(item({ source: "env" }))).toBe("задан в env");
    expect(secretPlaceholder(item({ configured: false, mask: null }))).toBe("строка значения");
    expect(secretPlaceholder(null)).toBe("строка значения");
  });

  test("подсказка: env блокирует, перезапуск или сразу", () => {
    expect(secretHint(item({ source: "env" }))).toContain("env");
    expect(secretHint(item({}))).toContain("сразу");
    expect(secretHint(item({ restart: true, key: "TELEGRAM_BOT_TOKEN" }))).toContain("перезапуска");
  });

  test("тост проверки подключения", () => {
    expect(secretTestToast(true)).toContain("прошла");
    expect(secretTestToast(false)).toContain("не прошла");
  });

  test("история изменений: имя, действие, маска — без сырых значений", () => {
    const line = formatSecretChange({
      action: "secret.set",
      field: "FEED_TOKEN",
      detail: "••••1234 → ••••9999",
      createdAt: new Date().toISOString(),
    });
    expect(line).toBe("FEED_TOKEN изменён (••••1234 → ••••9999)");
    const cleared = formatSecretChange({
      action: "secret.clear",
      field: "MAX_BOT_TOKEN",
      detail: "убрано (было ••••7890)",
      createdAt: new Date().toISOString(),
    });
    expect(cleared).toContain("убран");
  });
});
