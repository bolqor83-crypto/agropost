/**
 * ЭТАП 10 — MAX-модуль: контракты и лёгкие структурные типы подмножества
 * MAX Bot API (https://dev.max.ru/docs-api), которое использует приложение.
 *
 * Транспорт — прямой HTTP (fetch), без SDK: домен platform-api2.max.ru,
 * авторизация заголовком `Authorization: <access_token>` (передача токена
 * query-параметром больше не поддерживается платформой).
 */

/** Конфиг модуля: env ⋁ Настройки → MAX (AppSetting "max"). */
export interface MaxConfig {
  /** MAX_BOT_TOKEN (env) или токен из Настроек; null — бот не настроен. */
  token: string | null;
  /** MAX_USER_ID — ваш пользовательский ID в MAX (сообщения владельца). */
  ownerId: number | null;
  /** База API (подменяется в тестах на локальный мок). */
  apiBase: string;
  /** Публичный URL веб-приложения (кнопки «Открыть инбокс»). */
  webUrl: string;
  /** true — токен задан через env (UI-настройки игнорируются). */
  fromEnv: boolean;
}

/* ---------- Подмножество MAX Bot API ---------- */

export interface MaxUser {
  user_id: number;
  first_name?: string;
  last_name?: string | null;
  /** Никнейм бота (для пользователей не возвращается). */
  username?: string | null;
  is_bot?: boolean;
}

export interface MaxMessageBody {
  mid?: string;
  seq?: number;
  text?: string | null;
}

export interface MaxRecipient {
  chat_id?: number | null;
  /** "dialog" — личка, "chat" — группа, "channel" — канал. */
  chat_type?: "dialog" | "chat" | "channel" | string | null;
  user_id?: number | null;
}

export interface MaxMessage {
  sender?: MaxUser;
  recipient?: MaxRecipient;
  timestamp?: number;
  /** MAX возвращает тело и в `body`, и в `message` — читаем оба. */
  body?: MaxMessageBody;
  message?: MaxMessageBody;
}

/** Апдейт Long Polling (GET /updates) или Webhook. */
export interface MaxUpdate {
  update_type?: string;
  timestamp?: number;
  /** message_created / message_edited — входящее сообщение. */
  message?: MaxMessage;
  /** bot_started — пользователь запустил бота (аналог /start). */
  bot_started?: { user_id?: number; chat_id?: number | null };
  /** bot_added — бота добавили в чат/канал (источник chat_id!). */
  bot_added?: { user_id?: number; chat_id?: number; chat_type?: string };
}

export interface MaxUpdatesResponse {
  updates: MaxUpdate[];
  /** Маркер для следующего запроса Long Polling. */
  marker: number | null;
}

export interface MaxBotInfo {
  userId: number;
  firstName: string;
  /** Никнейм бота (диплинк https://max.ru/<username>). */
  username: string | null;
}

export interface MaxChat {
  chatId: number;
  type: "chat" | "channel" | "dialog" | string;
  title: string | null;
}

export interface MaxMembership {
  isAdmin: boolean;
  isOwner: boolean;
}

export interface MaxSendResult {
  mid: string | null;
  /** Публичная ссылка на пост в канале (Message.stat.url), если есть. */
  url: string | null;
}

/** Тонкий клиент MAX Bot API — в тестах подменяется фейком. */
export interface MaxApi {
  getMe(): Promise<MaxBotInfo>;
  getUpdates(marker: number | null, timeout?: number, limit?: number): Promise<MaxUpdatesResponse>;
  sendMessage(
    target: { chatId?: number; userId?: number },
    text: string,
    opts?: { format?: "html" | "markdown" },
  ): Promise<MaxSendResult>;
  getChat(chatId: number): Promise<MaxChat>;
  /** GET /chats/{chatId}/bot-membership — бот админ/владелец? */
  getBotMembership(chatId: number): Promise<MaxMembership>;
}

export class MaxApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MaxApiError";
  }
}

/* ---------- Доступ к данным (фейк поверх массивов в тестах) ---------- */

export type LeadSourceValue = "TELEGRAM_BOT" | "TELEGRAM_CHAT" | "MAX" | "AVITO" | "MANUAL";
export type LeadStatusValue = "NEW" | "IN_PROGRESS" | "ANSWERED" | "CLOSED" | "SPAM";

export interface MaxLeadRow {
  id: string;
  source: LeadSourceValue;
  externalId: string | null;
  externalUsername: string | null;
  name: string | null;
  interest: string | null;
  status: LeadStatusValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaxMessageRow {
  id: string;
  leadId: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string;
  sentAt: Date;
}

export interface MaxListingRow {
  id: string;
  positionId: string;
  channelId: string;
  text: string;
  status: string;
  publishedAt: Date | null;
  publishedCount: number;
  url: string | null;
}

export interface MaxChannelRow {
  id: string;
  name: string;
  url: string;
  accountId: string | null;
}

/** Привязка «MAX-канал → chat_id» (AppSetting "maxChats"). */
export interface MaxChatBinding {
  channelId: string;
  chatId: number;
}

/** Чат, который бот обнаружил сам (bot_added) — для привязки руками. */
export interface MaxDiscoveredChat {
  chatId: number;
  title: string | null;
  type: string;
  discoveredAt: string;
}

/** Подмножество БД, нужное MAX-модулю (Prisma в проде, фейк в тестах). */
export interface MaxDb {
  findLeadByExternal(source: LeadSourceValue, externalId: string): Promise<MaxLeadRow | null>;
  createLead(data: {
    source: LeadSourceValue;
    externalId: string;
    externalUsername?: string | null;
    name?: string | null;
  }): Promise<MaxLeadRow>;
  updateLead(id: string, patch: { interest?: string; status?: LeadStatusValue; externalUsername?: string | null }): Promise<MaxLeadRow>;
  messageExists(leadId: string, messageId: string): Promise<boolean>;
  createMessage(data: { leadId: string; direction: "INBOUND" | "OUTBOUND"; text: string; messageId?: string }): Promise<MaxMessageRow>;
  listCultureNames(): Promise<string[]>;

  listingWithChannel(listingId: string): Promise<{ listing: MaxListingRow; channel: MaxChannelRow } | null>;
  publishedInChannelWithin24h(channelId: string): Promise<boolean>;
  markListingPublished(listingId: string, url: string | null): Promise<void>;
  bumpAccountUsedToday(accountId: string): Promise<void>;

  /** MAX-каналы каталога (type = MAX). */
  listMaxChannels(): Promise<MaxChannelRow[]>;
  /** Сохранённые привязки chat_id (AppSetting "maxChats"). */
  listChatBindings(): Promise<MaxChatBinding[]>;
  saveChatBinding(channelId: string, chatId: number): Promise<void>;
  /** Чаты, найденные ботом через bot_added (AppSetting "maxDiscovered"). */
  listDiscoveredChats(): Promise<MaxDiscoveredChat[]>;
  saveDiscoveredChat(chat: MaxDiscoveredChat): Promise<void>;

  countNewLeads(): Promise<number>;
  countLeadsToday(): Promise<number>;
}

/** Уведомитель владельцу (в Telegram-бот — переиспользуем OwnerNotifier). */
export interface MaxNotify {
  pushNewMessage(item: { leadId: string; from: string; text: string }): void;
  publishError(channelName: string, reason: string): void;
}

export interface MaxDeps {
  cfg: MaxConfig;
  api: MaxApi;
  db: MaxDb;
  notify: MaxNotify;
  /** getMe с кэшем (username нужен для диплинка объявления). */
  botInfo: () => Promise<MaxBotInfo | null>;
}
