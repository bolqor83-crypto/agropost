/**
 * ЭТАП 9 — тесты бейджей автоматизации и кнопки Авито (lib/automation).
 */

import { describe, expect, test } from "bun:test";
import {
  automationBadge,
  avitoButtonEnabled,
  avitoButtonLabel,
  isAvitoChannel,
  type AvitoFlowStep,
} from "../automation";
import type { ChannelDTO } from "@shared/types";

const channel = (type: ChannelDTO["type"]): ChannelDTO =>
  ({
    id: "ch-test",
    name: "Тест",
    type,
    url: "https://example.com",
    region: "Федеральный",
    city: null,
    tags: ["GENERAL"],
    subscribersCount: null,
    averageReach: null,
    lastActivityAt: null,
    accountId: null,
    notes: null,
    submissionMethod: "CABINET",
    submissionBotUsername: null,
    adminContact: null,
    frequencyLimit: null,
    confirmationStatus: "CONFIRMED",
    mirrorOf: null,
    audienceType: null,
    automationLevel: "AUTO",
    listingCount: 0,
    createdAt: "2026-11-25T10:00:00Z",
    updatedAt: "2026-11-25T10:00:00Z",
  }) as ChannelDTO;

describe("бейджи автоматизации (этап 9)", () => {
  test("AUTO → «Авто» зелёный", () => {
    expect(automationBadge("AUTO")).toEqual({ label: "Авто", tone: "green" });
  });

  test("SEMI → «Полуавто» тёплый", () => {
    expect(automationBadge("SEMI")).toEqual({ label: "Полуавто", tone: "warm" });
  });

  test("MANUAL → «Ручной» красный", () => {
    expect(automationBadge("MANUAL")).toEqual({ label: "Ручной", tone: "danger" });
  });

  test("null/undefined/мусор → SEMI (чужой канал по умолчанию)", () => {
    expect(automationBadge(null).label).toBe("Полуавто");
    expect(automationBadge(undefined).tone).toBe("warm");
    expect(automationBadge("NOPE" as never).label).toBe("Полуавто");
  });
});

describe("кнопка «Опубликовать на Авито» (этап 9)", () => {
  test("кнопка только для канала типа AVITO", () => {
    expect(isAvitoChannel(channel("AVITO"))).toBe(true);
    expect(isAvitoChannel(channel("TELEGRAM_CHAT"))).toBe(false);
    expect(isAvitoChannel(null)).toBe(false);
  });

  test("без настроенных ключей кнопка недоступна", () => {
    expect(avitoButtonEnabled(false, "idle")).toBe(false);
    expect(avitoButtonEnabled(true, "idle")).toBe(true);
  });

  test("во время dry-run/publishing кнопка заблокирована", () => {
    expect(avitoButtonEnabled(true, "dry-run")).toBe(false);
    expect(avitoButtonEnabled(true, "publishing")).toBe(false);
    expect(avitoButtonEnabled(true, "preview")).toBe(true);
  });

  test("подписи по состояниям флоу", () => {
    expect(avitoButtonLabel("idle" as AvitoFlowStep)).toBe("Опубликовать на Авито");
    expect(avitoButtonLabel("dry-run" as AvitoFlowStep)).toBe("Проверяю XML…");
    expect(avitoButtonLabel("preview" as AvitoFlowStep)).toBe("Подтвердить отправку");
    expect(avitoButtonLabel("publishing" as AvitoFlowStep)).toBe("Отправляю…");
    expect(avitoButtonLabel("done" as AvitoFlowStep)).toBe("Отправлено в Авито");
  });
});
