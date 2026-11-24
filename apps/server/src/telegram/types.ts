/**
 * Telegram-модуль (этап 3.2): контракты и лёгкие структурные типы
 * подмножества Bot API, которые реально использует приложение.
 * grammY — транспорт; эти типы позволяют тестировать хендлеры
 * без живого бота.
 */

/** Конфиг модуля из env. */
export interface TelegramConfig {
  /** TELEGRAM_BOT_TOKEN; пустая строка — бот не настроен. */
  token: string;
  /** TELEGRAM_USER_ID — владелец (вы). */
  ownerId: number | null;
  /** Публичный URL веб-приложения (deep links «Открыть инбокс»). */
  webUrl: string;
  /** URL webhook (TELEGRAM_WEBHOOK_URL или RENDER_EXTERNAL_URL); null — не ставить. */
  webhookUrl: string | null;
  /** Секрет заголовка X-Telegram-Bot-Api-Secret-Token. */
  webhookSecret: string;
}

/* ---------- Подмножество Bot API ---------- */

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  /** Сообщение, на которое ответили (привязка лида по telegramMessageId). */
  reply_to_message?: { message_id: number } | null;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
}

export interface TgUpdate {
  update_id?: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgChatInfo {
  id: number;
  type: string;
  username?: string;
  title?: string;
}

export interface TgSendOptions {
  parseMode?: "HTML";
  replyMarkup?: { text: string; url: string }[][];
}

export interface TgWebhookInfo {
  /** Опционален: пуст, если webhook не настроен (локальный запуск без Render). */
  url?: string;
  pending_update_count: number;
  last_error_message?: string;
}

/** Тонкий клиент Bot API — за grammY; в тестах подменяется фейком. */
export interface TgApi {
  getMe(): Promise<{ id: number; username?: string; first_name?: string }>;
  sendMessage(
    chatId: number | string,
    text: string,
    opts?: TgSendOptions,
  ): Promise<{ message_id: number }>;
  getChat(chatId: number | string): Promise<TgChatInfo>;
  getChatMember(chatId: number | string, userId: number): Promise<{ status: string }>;
  getChatMemberCount(chatId: number | string): Promise<number>;
  setWebhook(url: string, secret: string): Promise<true>;
  getWebhookInfo(): Promise<TgWebhookInfo>;
  answerCallbackQuery(queryId: string): Promise<true>;
}

/* ---------- Доступ к данным (для тестов — фейк поверх массивов) ---------- */

export type LeadSourceValue = "TELEGRAM_BOT" | "TELEGRAM_CHAT" | "AVITO" | "MANUAL";
export type LeadStatusValue = "NEW" | "IN_PROGRESS" | "ANSWERED" | "CLOSED" | "SPAM";
export type MessageDirectionValue = "INBOUND" | "OUTBOUND";

export interface LeadRow {
  id: string;
  source: LeadSourceValue;
  externalId: string | null;
  externalUsername: string | null;
  name: string | null;
  phone: string | null;
  region: string | null;
  interest: string | null;
  status: LeadStatusValue;
  positionId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  leadId: string;
  direction: MessageDirectionValue;
  text: string;
  sentAt: Date;
  aiGenerated: boolean;
  aiCallId: string | null;
  telegramMessageId: string | null;
  createdAt: Date;
}

export interface ListingRow {
  id: string;
  positionId: string;
  channelId: string;
  text: string;
  status: "DRAFT" | "COPIED" | "PUBLISHED";
  publishedAt: Date | null;
  publishedCount: number;
  url: string | null;
}

export interface ChannelRow {
  id: string;
  name: string;
  url: string;
  accountId: string | null;
}

export interface PositionBrief {
  id: string;
  /** Готовое название позиции (positionName) для покупателя. */
  name: string;
  salePrice: number;
  volumeKg: number;
  status: "IN_STOCK" | "ON_ORDER" | "OUT_OF_STOCK";
}

/** Узкий интерфейс БД, нужный модулю. Роуты /api/leads работают с prisma напрямую. */
export interface TelegramDb {
  findLeadByExternal(source: LeadSourceValue, externalId: string): Promise<LeadRow | null>;
  findLeadById(id: string): Promise<LeadRow | null>;
  /** Лид по message_id ответа — привязка reply к переписке. */
  findLeadByTelegramMessageId(telegramMessageId: string): Promise<LeadRow | null>;
  messageExists(leadId: string, telegramMessageId: string): Promise<boolean>;
  createLead(
    data: Pick<LeadRow, "source" | "externalId" | "externalUsername" | "name"> & Partial<Pick<LeadRow, "positionId">>,
  ): Promise<LeadRow>;
  updateLead(
    id: string,
    patch: Partial<Pick<LeadRow, "status" | "notes" | "interest" | "positionId" | "externalUsername" | "phone" | "region">>,
  ): Promise<LeadRow>;
  createMessage(
    data: Pick<MessageRow, "leadId" | "direction" | "text"> & Partial<Pick<MessageRow, "telegramMessageId" | "aiGenerated" | "aiCallId">>,
  ): Promise<MessageRow>;
  listMessages(leadId: string): Promise<MessageRow[]>;
  listCultureNames(): Promise<string[]>;
  positionBrief(positionId: string): Promise<PositionBrief | null>;
  /** Размещение с каналом и позицией — для публикации ботом. */
  listingWithChannel(listingId: string): Promise<{ listing: ListingRow; channel: ChannelRow } | null>;
  publishedInChannelWithin24h(channelId: string): Promise<boolean>;
  markListingPublished(listingId: string, url: string | null): Promise<void>;
  findBotConfigByChannelId(channelId: string): Promise<{ telegramChatId: string } | null>;
  upsertBotConfig(channelId: string, telegramChatId: string): Promise<void>;
  bumpAccountUsedToday(accountId: string): Promise<void>;
  listBotChannels(): Promise<{ channelId: string; name: string; url: string; telegramChatId: string }[]>;
  countNewLeads(): Promise<number>;
  countLeadsToday(): Promise<number>;
}

/** Зависимости хендлеров — всё подменяемо в тестах. */
export interface TelegramDeps {
  cfg: TelegramConfig;
  api: TgApi;
  db: TelegramDb;
  notify: OwnerNotifierLike;
  /** Кэш getMe (username нужен для deep link в объявлениях). */
  botInfo(): Promise<{ id: number; username: string } | null>;
}

/** Интерфейс уведомлятора (см. notifier.ts). */
export interface OwnerNotifierLike {
  pushNewMessage(item: { leadId: string; from: string; text: string }): void;
  publishError(channelName: string, reason: string): void;
}
