/**
 * Тесты AI-черновика ответа лиду (часть C ТЗ): с позицией — вызов
 * /api/ai/reply с историей; без позиции и без сообщений — честный
 * fallback-шаблон с meta.provider = "fallback".
 */

import { describe, expect, test } from "bun:test";
import { composeLeadDraft } from "../reply.js";
import { MemoryDb } from "./fixtures.js";
import type { AiMeta, AiReplyMessage } from "@shared/ai";

const META: AiMeta = { model: "glm-5.3-flash", provider: "zai", latencyMs: 900, status: "ok" };

function fakeGenerateReply(calls: unknown[][]) {
  return async (input: {
    positionId: string;
    incomingMessage: string;
    history?: AiReplyMessage[];
  }) => {
    calls.push([input]);
    return {
      data: { reply: "Здравствуйте! Пшеница 3 класс — 15,5 ₽/кг, отгрузка со склада.", includes: ["цена", "склад"] },
      warnings: [],
      meta: META,
    };
  };
}

describe("composeLeadDraft", () => {
  test("с позицией: история переписки уходит в generateReply", async () => {
    const db = new MemoryDb();
    const lead = db.seedLead({ externalId: "1001", positionId: "pos-1" });
    await db.seedMessage({ leadId: lead.id, direction: "INBOUND", text: "Есть пшеница 3 класс?" });
    await db.seedMessage({ leadId: lead.id, direction: "OUTBOUND", text: "Да, есть." });
    await db.seedMessage({ leadId: lead.id, direction: "INBOUND", text: "А цена какая?" });

    const calls: unknown[][] = [];
    const result = await composeLeadDraft(lead.id, { db, generateReply: fakeGenerateReply(calls) });

    expect(result.draft).toContain("15,5 ₽/кг");
    expect(result.includes).toEqual(["цена", "склад"]);
    expect(result.meta.provider).toBe("zai");

    const input = calls[0][0] as { positionId: string; incomingMessage: string; history?: AiReplyMessage[] };
    expect(input.positionId).toBe("pos-1");
    expect(input.incomingMessage).toBe("А цена какая?");
    /* INBOUND → buyer, OUTBOUND → seller. */
    expect(input.history?.map((h) => h.role)).toEqual(["buyer", "seller", "buyer"]);
  });

  test("без позиции: fallback-шаблон, честный meta", async () => {
    const db = new MemoryDb();
    const lead = db.seedLead({ externalId: "1002", positionId: null });
    await db.seedMessage({ leadId: lead.id, direction: "INBOUND", text: "Сколько стоит доставка?" });

    const calls: unknown[][] = [];
    const result = await composeLeadDraft(lead.id, { db, generateReply: fakeGenerateReply(calls) });

    expect(calls.length).toBe(0);
    expect(result.meta.provider).toBe("fallback");
    expect(result.draft).toContain("Здравствуйте");
    expect(result.warnings.length).toBe(1);
  });

  test("без входящих сообщений: черновик-приветствие", async () => {
    const db = new MemoryDb();
    const lead = db.seedLead({ externalId: "1003", positionId: "pos-1" });

    const calls: unknown[][] = [];
    const result = await composeLeadDraft(lead.id, { db, generateReply: fakeGenerateReply(calls) });

    expect(calls.length).toBe(0);
    expect(result.draft).toContain("Чем можем помочь");
    expect(result.meta.provider).toBe("fallback");
  });

  test("лид не найден → ошибка", async () => {
    const db = new MemoryDb();
    let err: unknown = null;
    try {
      await composeLeadDraft("missing", { db, generateReply: fakeGenerateReply([]) });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toBe("LEAD_NOT_FOUND");
  });
});
