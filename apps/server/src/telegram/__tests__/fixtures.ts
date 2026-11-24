/**
 * Фикстуры для тестов Telegram-модуля: БД в памяти поверх массивов,
 * фейк Bot API, фейк уведомителя. Живой бот не нужен (ТЗ, п. G).
 */

import type {
  ChannelRow,
  LeadRow,
  ListingRow,
  MessageRow,
  PositionBrief,
  TelegramConfig,
  TelegramDb,
  TgApi,
} from "../types.js";

/* ---------- БД в памяти ---------- */

interface LeadSeed {
  id?: string;
  source?: LeadRow["source"];
  externalId?: string | null;
  externalUsername?: string | null;
  name?: string | null;
  status?: LeadRow["status"];
  positionId?: string | null;
  interest?: string | null;
}

interface MessageSeed {
  leadId: string;
  direction: MessageRow["direction"];
  text: string;
  telegramMessageId?: string | null;
}

export class MemoryDb implements TelegramDb {
  leads: LeadRow[] = [];
  messages: MessageRow[] = [];
  listings: ListingRow[] = [];
  channels: ChannelRow[] = [];
  botConfigs: { channelId: string; telegramChatId: string }[] = [];
  cultureNames: string[] = [];
  positions: PositionBrief[] = [];
  bumpedAccounts: string[] = [];

  constructor(seeds?: { leads?: LeadSeed[]; messages?: MessageSeed[] }) {
    for (const seed of seeds?.leads ?? []) this.seedLead(seed);
    for (const seed of seeds?.messages ?? []) this.seedMessage(seed);
  }

  seedLead(seed: LeadSeed): LeadRow {
    const lead: LeadRow = {
      id: seed.id ?? `lead-${this.leads.length + 1}`,
      source: seed.source ?? "TELEGRAM_BOT",
      externalId: seed.externalId ?? null,
      externalUsername: seed.externalUsername ?? null,
      name: seed.name ?? null,
      phone: null,
      region: null,
      interest: seed.interest ?? null,
      status: seed.status ?? "NEW",
      positionId: seed.positionId ?? null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.leads.push(lead);
    return lead;
  }

  seedMessage(seed: MessageSeed): MessageRow {
    const message: MessageRow = {
      id: `msg-${this.messages.length + 1}`,
      leadId: seed.leadId,
      direction: seed.direction,
      text: seed.text,
      sentAt: new Date(),
      aiGenerated: false,
      aiCallId: null,
      telegramMessageId: seed.telegramMessageId ?? null,
      createdAt: new Date(),
    };
    this.messages.push(message);
    return message;
  }

  async findLeadByExternal(source: LeadRow["source"], externalId: string): Promise<LeadRow | null> {
    return this.leads.find((l) => l.source === source && l.externalId === externalId) ?? null;
  }

  async findLeadById(id: string): Promise<LeadRow | null> {
    return this.leads.find((l) => l.id === id) ?? null;
  }

  async findLeadByTelegramMessageId(telegramMessageId: string): Promise<LeadRow | null> {
    const message = this.messages.find((m) => m.telegramMessageId === telegramMessageId);
    if (!message) return null;
    return this.leads.find((l) => l.id === message.leadId) ?? null;
  }

  async messageExists(leadId: string, telegramMessageId: string): Promise<boolean> {
    return this.messages.some(
      (m) => m.leadId === leadId && m.telegramMessageId === telegramMessageId,
    );
  }

  async createLead(
    data: Pick<LeadRow, "source" | "externalId" | "externalUsername" | "name"> &
      Partial<Pick<LeadRow, "positionId">>,
  ): Promise<LeadRow> {
    const lead: LeadRow = {
      id: `lead-${this.leads.length + 1}`,
      source: data.source,
      externalId: data.externalId,
      externalUsername: data.externalUsername,
      name: data.name,
      phone: null,
      region: null,
      interest: null,
      status: "NEW",
      positionId: data.positionId ?? null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.leads.push(lead);
    return lead;
  }

  async updateLead(
    id: string,
    patch: Partial<
      Pick<LeadRow, "status" | "notes" | "interest" | "positionId" | "externalUsername" | "phone" | "region">
    >,
  ): Promise<LeadRow> {
    const lead = this.leads.find((l) => l.id === id);
    if (!lead) throw new Error(`LEAD_NOT_FOUND:${id}`);
    Object.assign(lead, patch, { updatedAt: new Date() });
    return lead;
  }

  async createMessage(
    data: Pick<MessageRow, "leadId" | "direction" | "text"> &
      Partial<Pick<MessageRow, "telegramMessageId" | "aiGenerated" | "aiCallId">>,
  ): Promise<MessageRow> {
    const message: MessageRow = {
      id: `msg-${this.messages.length + 1}`,
      leadId: data.leadId,
      direction: data.direction,
      text: data.text,
      sentAt: new Date(),
      aiGenerated: data.aiGenerated ?? false,
      aiCallId: data.aiCallId ?? null,
      telegramMessageId: data.telegramMessageId ?? null,
      createdAt: new Date(),
    };
    this.messages.push(message);
    return message;
  }

  async listMessages(leadId: string): Promise<MessageRow[]> {
    return this.messages.filter((m) => m.leadId === leadId);
  }

  async listCultureNames(): Promise<string[]> {
    return this.cultureNames;
  }

  async positionBrief(positionId: string): Promise<PositionBrief | null> {
    return this.positions.find((p) => p.id === positionId) ?? null;
  }

  async listingWithChannel(
    listingId: string,
  ): Promise<{ listing: ListingRow; channel: ChannelRow } | null> {
    const listing = this.listings.find((l) => l.id === listingId);
    if (!listing) return null;
    const channel = this.channels.find((c) => c.id === listing.channelId);
    if (!channel) return null;
    return { listing, channel };
  }

  async publishedInChannelWithin24h(channelId: string): Promise<boolean> {
    return this.listings.some(
      (l) =>
        l.channelId === channelId &&
        l.status === "PUBLISHED" &&
        l.publishedAt !== null &&
        Date.now() - l.publishedAt.getTime() < 24 * 3600 * 1000,
    );
  }

  async markListingPublished(listingId: string, url: string | null): Promise<void> {
    const listing = this.listings.find((l) => l.id === listingId);
    if (!listing) return;
    listing.status = "PUBLISHED";
    listing.publishedAt = new Date();
    listing.url = url;
    listing.publishedCount += 1;
  }

  async findBotConfigByChannelId(channelId: string): Promise<{ telegramChatId: string } | null> {
    return this.botConfigs.find((c) => c.channelId === channelId) ?? null;
  }

  async upsertBotConfig(channelId: string, telegramChatId: string): Promise<void> {
    const existing = this.botConfigs.find((c) => c.channelId === channelId);
    if (existing) existing.telegramChatId = telegramChatId;
    else this.botConfigs.push({ channelId, telegramChatId });
  }

  async bumpAccountUsedToday(accountId: string): Promise<void> {
    this.bumpedAccounts.push(accountId);
  }

  async listBotChannels(): Promise<{ channelId: string; name: string; url: string; telegramChatId: string }[]> {
    return this.botConfigs.map((c) => {
      const channel = this.channels.find((ch) => ch.id === c.channelId);
      return {
        channelId: c.channelId,
        name: channel?.name ?? c.channelId,
        url: channel?.url ?? "",
        telegramChatId: c.telegramChatId,
      };
    });
  }

  async countNewLeads(): Promise<number> {
    return this.leads.filter((l) => l.status === "NEW").length;
  }

  async countLeadsToday(): Promise<number> {
    return this.leads.filter((l) => Date.now() - l.createdAt.getTime() < 24 * 3600 * 1000).length;
  }
}

/* ---------- Фейк Bot API ---------- */

export interface SentMessage {
  chatId: number | string;
  text: string;
  opts?: { parseMode?: "HTML"; replyMarkup?: unknown };
}

export class FakeApi implements TgApi {
  sent: SentMessage[] = [];
  chats = new Map<string | number, { id: number; type: string; username?: string; title?: string }>();
  memberStatuses = new Map<string, string>();
  memberCounts = new Map<string | number>();
  webhook: { url: string; secret: string } | null = null;
  private nextMessageId = 100;
  /** Если задан — sendMessage падает с этой ошибкой. */
  sendMessageError: Error | null = null;

  addPublicChannel(username: string, opts?: { memberStatus?: string; memberCount?: number }): number {
    const chatId = -1001234567 + this.chats.size;
    this.chats.set(username, { id: chatId, type: "channel", username });
    this.chats.set(`@${username}`, { id: chatId, type: "channel", username });
    this.chats.set(chatId, { id: chatId, type: "channel", username });
    this.memberStatuses.set(String(chatId), opts?.memberStatus ?? "administrator");
    this.memberCounts.set(String(chatId), opts?.memberCount ?? 500);
    return chatId;
  }

  async getMe(): Promise<{ id: number; username?: string; first_name?: string }> {
    return { id: 555000, username: "agropost_test_bot", first_name: "AgroPost Test" };
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    opts?: { parseMode?: "HTML"; replyMarkup?: unknown },
  ): Promise<{ message_id: number }> {
    if (this.sendMessageError) throw this.sendMessageError;
    this.sent.push({ chatId, text, opts });
    return { message_id: ++this.nextMessageId };
  }

  /** Числовой id может прийти строкой — как в реальном Bot API. */
  private resolveKey(chatId: number | string): number | string {
    return typeof chatId === "string" && /^-?\d+$/.test(chatId) ? Number(chatId) : chatId;
  }

  async getChat(chatId: number | string): Promise<{ id: number; type: string; username?: string; title?: string }> {
    const chat = this.chats.get(this.resolveKey(chatId));
    if (!chat) throw new Error("CHAT_NOT_FOUND");
    return chat;
  }

  async getChatMember(chatId: number | string, userId: number): Promise<{ status: string }> {
    const status = this.memberStatuses.get(String(chatId));
    if (!status) throw new Error("MEMBER_NOT_FOUND");
    return { status };
  }

  async getChatMemberCount(chatId: number | string): Promise<number> {
    const count = this.memberCounts.get(String(chatId));
    if (count === undefined) throw new Error("COUNT_NOT_FOUND");
    return count;
  }

  async setWebhook(url: string, secret: string): Promise<true> {
    this.webhook = { url, secret };
    return true;
  }

  async getWebhookInfo(): Promise<{
    url?: string;
    pending_update_count: number;
    last_error_message?: string;
  }> {
    return { url: this.webhook?.url ?? "", pending_update_count: 0 };
  }

  async answerCallbackQuery(_queryId: string): Promise<true> {
    return true;
  }
}

/* ---------- Фейк уведомителя ---------- */

export class FakeNotifier {
  pushes: { leadId: string; from: string; text: string }[] = [];
  publishErrors: { channelName: string; reason: string }[] = [];

  pushNewMessage(item: { leadId: string; from: string; text: string }): void {
    this.pushes.push(item);
  }

  publishError(channelName: string, reason: string): void {
    this.publishErrors.push({ channelName, reason });
  }
}

/* ---------- Сборка deps ---------- */

export function testConfig(overrides?: Partial<TelegramConfig>): TelegramConfig {
  return {
    token: "test-token",
    ownerId: 7867317588,
    webUrl: "https://agropost-web.onrender.com",
    webhookUrl: "https://api.example.com/api/telegram/webhook",
    webhookSecret: "test-secret",
    ...overrides,
  };
}

export function buyerMessage(opts?: {
  fromId?: number;
  username?: string;
  text?: string;
  messageId?: number;
  replyTo?: number;
  chatType?: string;
}): {
  message_id: number;
  from: { id: number; is_bot?: boolean; first_name?: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { message_id: number } | null;
} {
  const fromId = opts?.fromId ?? 1001;
  return {
    message_id: opts?.messageId ?? 10,
    from: {
      id: fromId,
      is_bot: false,
      first_name: "Иван",
      username: opts?.username ?? "ivan_buyer",
    },
    chat: { id: fromId, type: opts?.chatType ?? "private" },
    text: opts?.text ?? "Здравствуйте! Сколько стоит пшеница 3 класс?",
    reply_to_message: opts?.replyTo ? { message_id: opts.replyTo } : null,
  };
}
