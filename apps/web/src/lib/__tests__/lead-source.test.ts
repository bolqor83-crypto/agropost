/**
 * ЭТАП 10 — тесты бейджей источников лидов (lib/lead-source).
 */

import { describe, expect, test } from "bun:test";
import { leadSourceBadge } from "../lead-source";
import type { LeadSource } from "@shared/types";

describe("leadSourceBadge: инбокс показывает источник", () => {
  test("TELEGRAM_BOT — умолчание, бейдж скрыт", () => {
    const badge = leadSourceBadge("TELEGRAM_BOT" as LeadSource);
    expect(badge.hidden).toBe(true);
    expect(badge.label).toBe("TG-бот");
  });

  test("TELEGRAM_CHAT (userbot) — тёплый «TG-чат»", () => {
    const badge = leadSourceBadge("TELEGRAM_CHAT" as LeadSource);
    expect(badge.hidden).toBe(false);
    expect(badge.label).toBe("TG-чат");
    expect(badge.tone).toBe("warm");
  });

  test("MAX — зелёный «MAX»", () => {
    const badge = leadSourceBadge("MAX" as LeadSource);
    expect(badge.hidden).toBe(false);
    expect(badge.label).toBe("MAX");
    expect(badge.tone).toBe("green");
  });

  test("AVITO и MANUAL — видимые outline-бейджи", () => {
    expect(leadSourceBadge("AVITO" as LeadSource).label).toBe("Авито");
    expect(leadSourceBadge("MANUAL" as LeadSource).label).toBe("Вручную");
  });
});
