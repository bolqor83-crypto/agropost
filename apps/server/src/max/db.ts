/**
 * ЭТАП 10 — Prisma-реализация MaxDb.
 *
 * Лиды пишем той же схемой, что Telegram-модуль (source=MAX,
 * externalId = user_id покупателя в MAX, Message.telegramMessageId
 * хранит mid MAX для дедупликации ретраев Long Polling).
 *
 * Привязки «MAX-канал → chat_id» и обнаруженные чаты лежат в AppSetting
 * (JSONB): ключи "maxChats" и "maxDiscovered" — схемой владеет Prisma,
 * дополнительных таблиц не заводим.
 */

import { prisma } from "../prisma.js";
import type { Prisma } from "@prisma/client";
import type {
  MaxChatBinding,
  MaxChannelRow,
  MaxDb,
  MaxDiscoveredChat,
  LeadSourceValue,
  LeadStatusValue,
  MaxLeadRow,
  MaxMessageRow,
} from "./types.js";

type BindingValue = Record<string, unknown>;

function toLeadRow(row: {
  id: string;
  source: string;
  externalId: string | null;
  externalUsername: string | null;
  name: string | null;
  interest: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): MaxLeadRow {
  return {
    id: row.id,
    source: row.source as LeadSourceValue,
    externalId: row.externalId,
    externalUsername: row.externalUsername,
    name: row.name,
    interest: row.interest,
    status: row.status as LeadStatusValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function readSetting(key: string): Promise<BindingValue | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return null;
  const value = row.value as BindingValue | null;
  return value && typeof value === "object" ? value : null;
}

async function writeSetting(key: string, value: BindingValue): Promise<void> {
  const asJson = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: asJson },
    update: { value: asJson },
  });
}

export const prismaMaxDb: MaxDb = {
  async findLeadByExternal(source, externalId) {
    const row = await prisma.lead.findUnique({
      where: { source_externalId: { source, externalId } },
    });
    return row ? toLeadRow(row) : null;
  },

  async createLead(data) {
    const row = await prisma.lead.create({
      data: {
        source: data.source,
        externalId: data.externalId,
        externalUsername: data.externalUsername ?? null,
        name: data.name ?? null,
      },
    });
    return toLeadRow(row);
  },

  async updateLead(id, patch) {
    const row = await prisma.lead.update({ where: { id }, data: patch });
    return toLeadRow(row);
  },

  async messageExists(leadId, messageId) {
    const found = await prisma.message.findFirst({
      where: { leadId, telegramMessageId: messageId },
      select: { id: true },
    });
    return found !== null;
  },

  async createMessage(data) {
    const row = await prisma.message.create({
      data: {
        leadId: data.leadId,
        direction: data.direction,
        text: data.text,
        telegramMessageId: data.messageId ?? null,
      },
    });
    const message: MaxMessageRow = {
      id: row.id,
      leadId: row.leadId,
      direction: row.direction as "INBOUND" | "OUTBOUND",
      text: row.text,
      sentAt: row.sentAt,
    };
    return message;
  },

  async listCultureNames() {
    const rows = await prisma.cultureTemplate.findMany({ select: { name: true } });
    return rows.map((r) => r.name);
  },

  async listingWithChannel(listingId) {
    const row = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { channel: true },
    });
    if (!row) return null;
    return {
      listing: {
        id: row.id,
        positionId: row.positionId,
        channelId: row.channelId,
        text: row.text,
        status: row.status,
        publishedAt: row.publishedAt,
        publishedCount: row.publishedCount,
        url: row.url,
      },
      channel: {
        id: row.channel.id,
        name: row.channel.name,
        url: row.channel.url,
        accountId: row.channel.accountId,
      },
    };
  },

  async publishedInChannelWithin24h(channelId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const found = await prisma.listing.findFirst({
      where: { channelId, status: "PUBLISHED", publishedAt: { gte: since } },
      select: { id: true },
    });
    return found !== null;
  },

  async markListingPublished(listingId, url) {
    await prisma.listing.update({
      where: { id: listingId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        url,
        publishedCount: { increment: 1 },
      },
    });
  },

  async bumpAccountUsedToday(accountId) {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return;
    const today = new Date();
    const sameDay =
      account.usedDate &&
      account.usedDate.getUTCFullYear() === today.getUTCFullYear() &&
      account.usedDate.getUTCMonth() === today.getUTCMonth() &&
      account.usedDate.getUTCDate() === today.getUTCDate();
    await prisma.account.update({
      where: { id: accountId },
      data: sameDay
        ? { usedToday: { increment: 1 } }
        : { usedToday: 1, usedDate: today },
    });
  },

  async listMaxChannels() {
    const rows = await prisma.channel.findMany({
      where: { type: "MAX" },
      orderBy: { subscribersCount: "desc" },
      select: { id: true, name: true, url: true, accountId: true },
    });
    return rows.map<MaxChannelRow>((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      accountId: row.accountId,
    }));
  },

  async listChatBindings() {
    const value = await readSetting("maxChats");
    const raw = value?.bindings;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (b): b is { channelId: string; chatId: number } =>
          typeof b === "object" && b !== null && typeof (b as BindingValue).channelId === "string" && typeof (b as BindingValue).chatId === "number",
      )
      .map<MaxChatBinding>((b) => ({ channelId: b.channelId, chatId: b.chatId }));
  },

  async saveChatBinding(channelId, chatId) {
    const current = await prismaMaxDb.listChatBindings();
    const bindings = current.filter((b) => b.channelId !== channelId);
    bindings.push({ channelId, chatId });
    await writeSetting("maxChats", { bindings });
  },

  async listDiscoveredChats() {
    const value = await readSetting("maxDiscovered");
    const raw = value?.chats;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c): c is BindingValue => typeof c === "object" && c !== null)
      .map<MaxDiscoveredChat>((c) => ({
        chatId: Number(c.chatId ?? 0),
        title: typeof c.title === "string" ? c.title : null,
        type: typeof c.type === "string" ? c.type : "chat",
        discoveredAt: typeof c.discoveredAt === "string" ? c.discoveredAt : new Date().toISOString(),
      }))
      .filter((c) => c.chatId > 0);
  },

  async saveDiscoveredChat(chat) {
    const current = await prismaMaxDb.listDiscoveredChats();
    const chats = current.filter((c) => c.chatId !== chat.chatId);
    chats.push(chat);
    /* Храним последние 20: бота могли добавить во многие чаты. */
    await writeSetting("maxDiscovered", { chats: chats.slice(-20) });
  },

  async countNewLeads() {
    return await prisma.lead.count({ where: { status: "NEW" } });
  },

  async countLeadsToday() {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return await prisma.lead.count({ where: { createdAt: { gte: midnight } } });
  },
};
