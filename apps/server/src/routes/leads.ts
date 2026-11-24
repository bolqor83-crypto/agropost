/**
 * /api/leads — инбокс (часть C ТЗ, этап 3.2).
 * Список с фильтрами, карточка с историей, статусы/заметки,
 * ответ покупателю: черновик AI или отправка текста ботом.
 */

import type { FastifyInstance } from "fastify";
import { ApiError, badRequest, notFound } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import { leadReplySchema, leadSourceSchema, leadStatusSchema, leadUpdateSchema } from "../validation.js";
import { prisma } from "../prisma.js";
import { composeLeadDraft } from "../telegram/reply.js";
import { generateReply } from "../ai/service.js";
import type { LeadDTO, LeadDetailDTO, LeadDraftDTO } from "@shared/types";
import { prismaTelegramDb } from "../telegram/db.js";
import { getTelegram } from "../telegram/index.js";

type PrismaLead = {
  id: string;
  source: string;
  externalId: string | null;
  externalUsername: string | null;
  name: string | null;
  phone: string | null;
  region: string | null;
  interest: string | null;
  status: string;
  positionId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: {
    id: string;
    direction: string;
    text: string;
    sentAt: Date;
    aiGenerated: boolean;
    aiCallId: string | null;
    telegramMessageId: string | null;
  }[];
};

function toLeadDTO(row: PrismaLead): LeadDTO {
  const last = row.messages?.[0];
  return {
    id: row.id,
    source: row.source as LeadDTO["source"],
    externalId: row.externalId,
    externalUsername: row.externalUsername,
    name: row.name,
    phone: row.phone,
    region: row.region,
    interest: row.interest,
    status: row.status as LeadDTO["status"],
    positionId: row.positionId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessage: last
      ? {
          text: last.text,
          direction: last.direction as "INBOUND" | "OUTBOUND",
          sentAt: last.sentAt.toISOString(),
        }
      : null,
  };
}

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  /* Список с фильтрами: status, source, q (поиск по полям лида). */
  app.get("/api/leads", async (req) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const status = query.status ? parseOrThrow(leadStatusSchema, query.status) : undefined;
    const source = query.source ? parseOrThrow(leadSourceSchema, query.source) : undefined;
    const q = query.q?.trim() ?? "";

    const rows = await prisma.lead.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(source ? { source } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { externalUsername: { contains: q.replace(/^@/, ""), mode: "insensitive" } },
                { interest: { contains: q, mode: "insensitive" } },
                { notes: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return { ok: true, items: rows.map(toLeadDTO) };
  });

  /* Карточка лида с полной историей. */
  app.get("/api/leads/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const row = await prisma.lead.findUnique({
      where: { id },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    });
    if (!row) throw notFound("Лид не найден");
    const base = toLeadDTO(row as PrismaLead);
    const detail: LeadDetailDTO = {
      ...base,
      messages: (row as PrismaLead).messages!.map((m) => ({
        id: m.id,
        direction: m.direction as "INBOUND" | "OUTBOUND",
        text: m.text,
        sentAt: m.sentAt.toISOString(),
        aiGenerated: m.aiGenerated,
        aiCallId: m.aiCallId,
      })),
    };
    return { ok: true, ...detail };
  });

  /* Статус, заметки, интерес, позиция. */
  app.patch("/api/leads/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const patch = parseOrThrow(leadUpdateSchema, req.body ?? {});
    if (patch.positionId) {
      const exists = await prisma.supplierPosition.findUnique({
        where: { id: patch.positionId },
        select: { id: true },
      });
      if (!exists) throw badRequest("Позиция не найдена");
    }
    const row = await prisma.lead.update({
      where: { id },
      data: patch,
      include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
    });
    return { ok: true, ...toLeadDTO(row as PrismaLead) };
  });

  /* Ответ покупателю: черновик AI (useAi) или отправка текста ботом. */
  app.post("/api/leads/:id/reply", async (req) => {
    const id = (req.params as { id: string }).id;
    const input = parseOrThrow(leadReplySchema, req.body);

    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw notFound("Лид не найден");

    /* Режим 1: черновик AI — не отправляем, отдаём в UI на правку. */
    if (input.useAi && !input.text) {
      const draft = await composeLeadDraft(id, {
        db: prismaTelegramDb,
        generateReply,
      });
      const response: LeadDraftDTO = { ok: true, ...draft };
      return response;
    }

    /* Режим 2: отправка готового текста через бота (Telegram или MAX). */
    const text = input.text!;
    if (lead.source !== "TELEGRAM_BOT" && lead.source !== "TELEGRAM_CHAT" && lead.source !== "MAX") {
      throw new ApiError(
        400,
        "UNSUPPORTED_SOURCE",
        "Отправка через бота доступна только для Telegram- и MAX-лидов",
      );
    }
    if (!lead.externalId) {
      throw badRequest("У лида нет контакта для ответа (externalId)");
    }

    /* ЭТАП 10: лид из MAX — отвечаем через MAX-бота (user_id). */
    if (lead.source === "MAX") {
      const { resolveMaxDeps } = await import("../max/runtime.js");
      const maxDeps = await resolveMaxDeps();
      if (!maxDeps) {
        throw new ApiError(503, "MAX_NOT_CONFIGURED", "MAX-бот не настроен: задайте MAX_BOT_TOKEN или введите токен в «Настройки → MAX»");
      }
      const userId = Number(lead.externalId);
      if (!Number.isFinite(userId)) {
        throw badRequest("У лида некорректный MAX user_id (externalId)");
      }
      let sent;
      try {
        sent = await maxDeps.api.sendMessage({ userId }, text);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "неизвестная ошибка";
        throw new ApiError(502, "SEND_FAILED", `MAX не отправил сообщение: ${reason}`);
      }
      const message = await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: "OUTBOUND",
          text,
          telegramMessageId: sent.mid ?? null,
          aiGenerated: Boolean(input.aiCallId),
          aiCallId: input.aiCallId ?? null,
        },
      });
      if (lead.status !== "SPAM" && lead.status !== "CLOSED") {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "ANSWERED" } });
      }
      return {
        ok: true,
        message: {
          id: message.id,
          direction: "OUTBOUND" as const,
          text: message.text,
          sentAt: message.sentAt.toISOString(),
          aiGenerated: message.aiGenerated,
          aiCallId: message.aiCallId,
        },
      };
    }

    const telegram = getTelegram();
    if (!telegram.api) {
      throw new ApiError(503, "TELEGRAM_NOT_CONFIGURED", "Бот не настроен: задайте TELEGRAM_BOT_TOKEN");
    }

    let messageId: number;
    try {
      const sent = await telegram.api.sendMessage(lead.externalId, text);
      messageId = sent.message_id;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "неизвестная ошибка";
      throw new ApiError(502, "SEND_FAILED", `Telegram не отправил сообщение: ${reason}`);
    }

    const message = await prisma.message.create({
      data: {
        leadId: lead.id,
        direction: "OUTBOUND",
        text,
        telegramMessageId: String(messageId),
        aiGenerated: Boolean(input.aiCallId),
        aiCallId: input.aiCallId ?? null,
      },
    });

    /* Лид отвечает на сообщение — статус ANSWERED (спам и закрытые не трогаем). */
    if (lead.status !== "SPAM" && lead.status !== "CLOSED") {
      await prisma.lead.update({ where: { id: lead.id }, data: { status: "ANSWERED" } });
    }

    return {
      ok: true,
      message: {
        id: message.id,
        direction: "OUTBOUND" as const,
        text: message.text,
        sentAt: message.sentAt.toISOString(),
        aiGenerated: message.aiGenerated,
        aiCallId: message.aiCallId,
      },
    };
  });
}
