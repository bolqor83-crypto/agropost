/**
 * ЭТАП 10 — фикстуры тестов MAX-модуля: БД в памяти поверх массивов,
 * фейк MAX API, фейк уведомителя. Живой MAX не нужен.
 */

import type {
  MaxApi,
  MaxBotInfo,
  MaxChatBinding,
  MaxChannelRow,
  MaxDb,
  MaxDeps,
  MaxDiscoveredChat,
  LeadSourceValue,
  LeadStatusValue,
  MaxLeadRow,
  MaxMessageRow,
  MaxConfig,
} from "../types.js";

/* ---------- БД в памяти ---------- */

interface LeadSeed {
  id?: string;
  source?: LeadSourceValue;
  externalId?: string | null;
  externalUsername?: string | null;
  name?: string | null;
  status?: LeadStatusValue;
  interest?: string | null;
}

export class MemoryMaxDb implements MaxDb {
  leads: MaxLeadRow[] = [];
  messages: MaxMessageRow[] = [];
  listings: {
    id: string;
    positionId: string;
    channelId: string;
    text: string;
    status: string;
    publishedAt: Date | null;
    publishedCount: number;
    url: string | null;
  }[] = [];
  channels: MaxChannelRow[] = [];
  bindings: MaxChatBinding[] = [];
  discovered: MaxDiscoveredChat[] = [];
  cultureNames: string[] = ["Люцерна", "Эспарцет", "Суданка"];
  bumpedAccounts: string[] = [];

  constructor(seeds?: { leads?: LeadSeed[] }) {
    for (const seed of seeds?.leads ?? []) this.seedLead(seed);
  }

  seedLead(seed: LeadSeed): MaxLeadRow {
    const lead: MaxLeadRow = {
      id: seed.id ?? `lead-${this.leads.length + 1}`,
      source: seed.source ?? "MAX",
      externalId: seed.externalId ?? null,
      externalUsername: seed.externalUsername ?? null,
      name: seed.name ?? null,
      interest: seed.interest ?? null,
      status: seed.status ?? "NEW",
      createdAt: new Date("2026-11-25T10:00:00Z"),
      updatedAt: new Date("2026-11-25T10:00:00Z"),
    };
    this.leads.push(lead);
    return lead;
  }

  seedListing(data: {
    id: string;
    channelId: string;
    text?: string;
    status?: string;
    publishedAt?: Date | null;
  }): void {
    this.listings.push({
      id: data.id,
      positionId: "pos-1",
      channelId: data.channelId,
      text: data.text ?? "Люцерна 1 класс…\nОстальное",
      status: data.status ?? "DRAFT",
      publishedAt: data.publishedAt ?? null,
      publishedCount: 0,
      url: null,
    });
  }

  async findLeadByExternal(source, externalId) {
    return this.leads.find((l) => l.source === source && l.externalId === externalId) ?? null;
  }

  async createLead(data) {
    const lead: MaxLeadRow = {
      id: `lead-${this.leads.length + 1}`,
      source: data.source,
      externalId: data.externalId,
      externalUsername: data.externalUsername ?? null,
      name: data.name ?? null,
      interest: null,
      status: "NEW",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.leads.push(lead);
    return lead;
  }

  async updateLead(id, patch) {
    const lead = this.leads.find((l) => l.id === id);
    if (!lead) throw new Error(`lead ${id} не найден`);
    Object.assign(lead, patch, { updatedAt: new Date() });
    return lead;
  }

  async messageExists(leadId, messageId) {
    return this.messages.some((m) => m.leadId === leadId && m.id === `m:${messageId}`);
  }

  async createMessage(data) {
    const message: MaxMessageRow = {
      id: data.messageId ? `m:${data.messageId}` : `m-new-${this.messages.length + 1}`,
      leadId: data.leadId,
      direction: data.direction,
      text: data.text,
      sentAt: new Date(),
    };
    this.messages.push(message);
    return message;
  }

  async listCultureNames() {
    return this.cultureNames;
  }

  async listingWithChannel(listingId) {
    const listing = this.listings.find((l) => l.id === listingId);
    if (!listing) return null;
    const channel = this.channels.find((c) => c.id === listing.channelId) ?? null;
    if (!channel) return null;
    return { listing, channel };
  }

  async publishedInChannelWithin24h(channelId) {
    return this.listings.some(
      (l) =>
        l.channelId === channelId &&
        l.status === "PUBLISHED" &&
        l.publishedAt !== null &&
        Date.now() - l.publishedAt.getTime() < 24 * 60 * 60 * 1000,
    );
  }

  async markListingPublished(listingId, url) {
    const listing = this.listings.find((l) => l.id === listingId);
    if (!listing) throw new Error(`listing ${listingId} не найден`);
    listing.status = "PUBLISHED";
    listing.publishedAt = new Date();
    listing.url = url;
    listing.publishedCount += 1;
  }

  async bumpAccountUsedToday(accountId) {
    this.bumpedAccounts.push(accountId);
  }

  async listMaxChannels() {
    return this.channels;
  }

  async listChatBindings() {
    return this.bindings;
  }

  async saveChatBinding(channelId, chatId) {
    this.bindings = this.bindings.filter((b) => b.channelId !== channelId);
    this.bindings.push({ channelId, chatId });
  }

  async listDiscoveredChats() {
    return this.discovered;
  }

  async saveDiscoveredChat(chat) {
    this.discovered = this.discovered.filter((c) => c.chatId !== chat.chatId);
    this.discovered.push(chat);
  }

  async countNewLeads() {
    return this.leads.filter((l) => l.status === "NEW").length;
  }

  async countLeadsToday() {
    return this.leads.length;
  }
}

/* ---------- Фейк MAX API ---------- */

export interface FakeApiCalls {
  sent: { chatId?: number; userId?: number; text: string; format?: string }[];
  memberships: number[];
  chatsRequested: number[];
}

export class FakeMaxApi implements MaxApi {
  me: MaxBotInfo = { userId: 777, firstName: "АгроПост", username: "agropost_max_bot" };
  calls: FakeApiCalls = { sent: [], memberships: [], chatsRequested: [] };
  memberships: Record<number, { is_admin?: boolean; is_owner?: boolean }> = {};
  updatesQueue: { updates: unknown[]; marker: number | null }[] = [];
  failNext: string | null = null;

  async getMe() {
    if (this.failNext === "me") {
      this.failNext = null;
      throw new Error("MAX API: HTTP 401");
    }
    return this.me;
  }

  async getUpdates(marker) {
    if (this.failNext === "updates") {
      this.failNext = null;
      throw new Error("MAX API: HTTP 500");
    }
    const next = this.updatesQueue.shift() ?? { updates: [], marker };
    return next as { updates: never[]; marker: number | null };
  }

  async sendMessage(target, text, opts) {
    this.calls.sent.push({ ...target, text, format: opts?.format });
    return { mid: `mid-${this.calls.sent.length}`, url: null };
  }

  async getChat(chatId) {
    this.calls.chatsRequested.push(chatId);
    return { chatId, type: "channel", title: `Чат ${chatId}` };
  }

  async getBotMembership(chatId) {
    if (this.failNext === "membership") {
      this.failNext = null;
      throw new Error("MAX API: HTTP 500");
    }
    this.calls.memberships.push(chatId);
    const row = this.memberships[chatId] ?? { is_admin: true };
    return {
      isAdmin: row.is_admin === true || row.is_owner === true,
      isOwner: row.is_owner === true,
    };
  }
}

/* ---------- Фейк уведомителя ---------- */

export class FakeNotify {
  pushed: { leadId: string; from: string; text: string }[] = [];
  publishErrors: { channelName: string; reason: string }[] = [];

  pushNewMessage(item: { leadId: string; from: string; text: string }): void {
    this.pushed.push(item);
  }

  publishError(channelName: string, reason: string): void {
    this.publishErrors.push({ channelName, reason });
  }
}

/* ---------- Сборка deps ---------- */

export function maxTestDeps(
  db: MemoryMaxDb,
  api: FakeMaxApi,
  cfgOverrides: Partial<MaxConfig> = {},
): MaxDeps & { db: MemoryMaxDb; api: FakeMaxApi; notify: FakeNotify } {
  const cfg: MaxConfig = {
    token: "test-max-token",
    ownerId: null,
    apiBase: "http://127.0.0.1:0",
    webUrl: "https://agropost-web.onrender.com",
    fromEnv: true,
    ...cfgOverrides,
  };
  const notify = new FakeNotify();
  let meCache: MaxBotInfo | null | undefined;
  return {
    cfg,
    api,
    db,
    notify,
    botInfo: async () => {
      if (meCache === undefined) {
        try {
          meCache = await api.getMe();
        } catch {
          meCache = null;
        }
      }
      return meCache;
    },
  };
}
