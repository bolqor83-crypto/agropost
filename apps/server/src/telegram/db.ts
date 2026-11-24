/**
 * Prisma-реализация интерфейса TelegramDb. Роуты /api/leads используют
 * prisma напрямую; сюда вынесено только то, что нужно хендлерам бота
 * и публикации — чтобы их можно было тестировать на фейках.
 */

import { positionName } from "@shared/attributes";
import { prisma } from "../prisma.js";
import type {
  ChannelRow,
  LeadRow,
  ListingRow,
  MessageRow,
  TelegramDb,
} from "./types.js";

function toLeadRow(row: {
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
}): LeadRow {
  return {
    ...row,
    source: row.source as LeadRow["source"],
    status: row.status as LeadRow["status"],
  };
}

function toMessageRow(row: {
  id: string;
  leadId: string;
  direction: string;
  text: string;
  sentAt: Date;
  aiGenerated: boolean;
  aiCallId: string | null;
  telegramMessageId: string | null;
  createdAt: Date;
}): MessageRow {
  return { ...row, direction: row.direction as MessageRow["direction"] };
}

export const prismaTelegramDb: TelegramDb = {
  async findLeadByExternal(source, externalId) {
    const row = await prisma.lead.findUnique({
      where: { source_externalId: { source, externalId } },
    });
    return row ? toLeadRow(row) : null;
  },

  async findLeadById(id) {
    const row = await prisma.lead.findUnique({ where: { id } });
    return row ? toLeadRow(row) : null;
  },

  async findLeadByTelegramMessageId(telegramMessageId) {
    const message = await prisma.message.findFirst({
      where: { telegramMessageId },
      include: { lead: true },
    });
    return message ? toLeadRow(message.lead) : null;
  },

  async messageExists(leadId, telegramMessageId) {
    const found = await prisma.message.findFirst({
      where: { leadId, telegramMessageId },
      select: { id: true },
    });
    return found !== null;
  },

  async createLead(data) {
    const row = await prisma.lead.create({
      data: {
        source: data.source,
        externalId: data.externalId,
        externalUsername: data.externalUsername,
        name: data.name,
        positionId: data.positionId ?? null,
      },
    });
    return toLeadRow(row);
  },

  async updateLead(id, patch) {
    const row = await prisma.lead.update({ where: { id }, data: patch });
    return toLeadRow(row);
  },

  async createMessage(data) {
    const row = await prisma.message.create({
      data: {
        leadId: data.leadId,
        direction: data.direction,
        text: data.text,
        telegramMessageId: data.telegramMessageId ?? null,
        aiGenerated: data.aiGenerated ?? false,
        aiCallId: data.aiCallId ?? null,
      },
    });
    return toMessageRow(row);
  },

  async listMessages(leadId) {
    const rows = await prisma.message.findMany({
      where: { leadId },
      orderBy: { sentAt: "asc" },
    });
    return rows.map(toMessageRow);
  },

  async listCultureNames() {
    const rows = await prisma.cultureTemplate.findMany({ select: { name: true } });
    return rows.map((r) => r.name);
  },

  async positionBrief(positionId) {
    const row = await prisma.supplierPosition.findUnique({
      where: { id: positionId },
      include: { culture: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      name: positionName(
        row.culture.name,
        (row.attributes ?? {}) as Record<string, string | number>,
      ),
      salePrice: Number(row.salePrice),
      volumeKg: row.volumeKg,
      status: row.status,
    };
  },

  async listingWithChannel(listingId) {
    const row = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { channel: true },
    });
    if (!row) return null;
    const listing: ListingRow = {
      id: row.id,
      positionId: row.positionId,
      channelId: row.channelId,
      text: row.text,
      status: row.status,
      publishedAt: row.publishedAt,
      publishedCount: row.publishedCount,
      url: row.url,
    };
    const channel: ChannelRow = {
      id: row.channel.id,
      name: row.channel.name,
      url: row.channel.url,
      accountId: row.channel.accountId,
    };
    return { listing, channel };
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

  async findBotConfigByChannelId(channelId) {
    const row = await prisma.botConfig.findUnique({ where: { channelId } });
    return row ? { telegramChatId: row.telegramChatId } : null;
  },

  async upsertBotConfig(channelId, telegramChatId) {
    await prisma.botConfig.upsert({
      where: { channelId },
      create: { channelId, telegramChatId, isAdmin: true },
      update: { telegramChatId, isAdmin: true },
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

  async listBotChannels() {
    const rows = await prisma.botConfig.findMany({
      include: { channel: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      channelId: row.channelId,
      name: row.channel.name,
      url: row.channel.url,
      telegramChatId: row.telegramChatId,
    }));
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
