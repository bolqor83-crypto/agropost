/**
 * AI-черновик ответа покупателю в инбоксе (часть C ТЗ):
 * вызываем готовый use case /api/ai/reply (этап 3.0), подавая историю
 * переписки лида. AI-модуль не меняем — только потребляем.
 */

import type { AiMeta, AiReplyMessage } from "@shared/ai";
import type { MessageRow, TelegramDb } from "./types.js";

export interface LeadDraft {
  draft: string;
  includes: string[];
  warnings: string[];
  meta: AiMeta;
}

type GenerateReplyFn = (input: {
  positionId: string;
  incomingMessage: string;
  history?: AiReplyMessage[];
}) => Promise<{ data: { reply: string; includes: string[] }; warnings: string[]; meta: AiMeta }>;

/** Черновик без позиции: вежливый шаблон, честный meta=fallback. */
function templateDraft(text: string): string {
  const lower = text.toLowerCase();
  if (/цена|стоит|сколько|прайс/.test(lower)) {
    return "Здравствуйте! Цену и условия по интересующей вас культуре уточним в течение дня — подскажите объём и город доставки, посчитаем точно.";
  }
  if (/достав|логист|транс/.test(lower)) {
    return "Здравствуйте! Доставку считаем по городу и объёму — подскажите, куда и сколько килограмм нужно, предложим варианты перевозчиков.";
  }
  if (/налич|остатк|есть ли/.test(lower)) {
    return "Здравствуйте! Проверим остатки и вернёмся с подтверждением в течение дня. Какой объём вас интересует?";
  }
  return "Здравствуйте! Спасибо за обращение — ответим по вашему вопросу в течение дня.";
}

export async function composeLeadDraft(
  leadId: string,
  deps: { db: Pick<TelegramDb, "findLeadById" | "listMessages">; generateReply: GenerateReplyFn },
): Promise<LeadDraft> {
  const lead = await deps.db.findLeadById(leadId);
  if (!lead) throw new Error("LEAD_NOT_FOUND");

  const messages: MessageRow[] = await deps.db.listMessages(lead.id);
  const lastInbound = [...messages].reverse().find((m) => m.direction === "INBOUND");
  if (!lastInbound) {
    return {
      draft: "Здравствуйте! Чем можем помочь по вашему вопросу?",
      includes: [],
      warnings: ["От покупателя пока нет сообщений — черновик-приветствие."],
      meta: { model: "template", provider: "fallback", latencyMs: 0, status: "fallback" },
    };
  }

  if (!lead.positionId) {
    return {
      draft: templateDraft(lastInbound.text),
      includes: [],
      warnings: [
        "Лид без позиции: AI-черновик недоступен. Укажите позицию в карточке лида — и «Черновик AI» соберёт ответ с ценой и условиями.",
      ],
      meta: { model: "template", provider: "fallback", latencyMs: 0, status: "fallback" },
    };
  }

  const history: AiReplyMessage[] = messages.slice(-10).map((m) => ({
    role: m.direction === "INBOUND" ? "buyer" : "seller",
    text: m.text,
  }));

  const result = await deps.generateReply({
    positionId: lead.positionId,
    incomingMessage: lastInbound.text,
    history,
  });

  return {
    draft: result.data.reply,
    includes: result.data.includes,
    warnings: result.warnings,
    meta: result.meta,
  };
}
