/**
 * Типизированный клиент API АгроПост.
 *
 * Этап 5.1 (авторизация владельца):
 * - все запросы идут с credentials: 'include' — HttpOnly-cookie сессии
 *   уходит автоматически, пароль/токен в JS НЕ живут;
 * - ответ 401 централизованно переводит на /login (без циклов:
 *   сами auth-запросы и страница входа исключены).
 *
 * База:
 * - Vite (apps/web): VITE_API_URL при сборке, иначе относительный /api —
 *   его проксирует vite-dev-server на localhost:3001 (см. vite.config.ts);
 * - Next-превью: мок-API на тех же маршрутах (same-origin /api);
 * - статика на Render: относительный /api — тот же origin, что сайт
 *   (rewrite /api/* → agropost-api в настройках статик-сайта). Прямой
 *   cross-origin адрес (VITE_API_URL=…api.onrender.com/api) — резерв
 *   для ручной сборки: cookie при нём cross-site и может блокироваться
 *   браузером (Safari/iOS, блокировка сторонних cookie) — вход «кружится».
 *
 * Ошибки сервера имеют единый формат { error: { code, message } } —
 * клиент превращает их в ApiError с человеческим сообщением.
 */

import type {
  AccountDTO,
  AccountInput,
  AnalyticsChannelsDTO,
  AnalyticsPeriod,
  AnalyticsPositionsDTO,
  AnalyticsSummaryDTO,
  AvitoCheckDTO,
  AvitoDryRunDTO,
  AvitoPublishDTO,
  AvitoSettingsDTO,
  AvitoSettingsInput,
  AvitoStatusDTO,
  MaxCheckDTO,
  MaxPublishDTO,
  MaxSettingsDTO,
  MaxSettingsInput,
  MaxStatusDTO,
  SecretsStatusDTO,
  SecretSaveDTO,
  SecretTestDTO,
  UserbotStatusDTO,
  CarrierDTO,
  CarrierInput,
  ChannelDTO,
  ChannelInput,
  ChannelTag,
  ChannelType,
  ClaimCreateInput,
  ClaimDTO,
  ClaimStatus,
  ClaimUpdateInput,
  CultureTemplateDTO,
  DealCreateInput,
  DealDetailDTO,
  DealShipInput,
  DealStatus,
  DealUpdateInput,
  DeliveryCalculateDTO,
  DocumentDTO,
  DocumentType,
  FeedsInfoDTO,
  LeadDetailDTO,
  LeadDTO,
  LeadDraftDTO,
  LeadMessageDTO,
  LeadReplyInput,
  LeadStatus,
  LeadUpdateInput,
  ListingCreateInput,
  ListingDTO,
  ListingUpdateInput,
  MarketDTO,
  MediaDTO,
  MediaUploadDTO,
  ParserRunDTO,
  PositionDTO,
  PositionInput,
  PositionStatus,
  ReadinessDTO,
  CultureType,
  SuggestChannelsDTO,
  SupplierDTO,
  SupplierInput,
  TelegramPublishDTO,
  TelegramStatusDTO,
  UserDTO,
  UserProfileDTO,
  UserProfileInput,
} from "@shared/types";
import type {
  AiAdviceData,
  AiAdviceInput,
  AiListingData,
  AiListingInput,
  AiLogisticsData,
  AiLogisticsInput,
  AiPriceAnalysisData,
  AiPriceAnalysisInput,
  AiReplyData,
  AiReplyInput,
  AiResponse,
} from "@shared/ai";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function resolveApiBase(): string {
  /* Vite: переменные сборки; в Next import.meta.env просто undefined */
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (viteEnv && viteEnv.VITE_API_URL) return viteEnv.VITE_API_URL;
  /* Next-превью (встроивается на сборке) */
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return "/api";
}

const BASE = resolveApiBase();

/** Авторизация: 401 → один.redirect на /login (без циклов). */
function handleUnauthorized(path: string): void {
  if (path.startsWith("/auth/")) return; /* auth сам обрабатывает */
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  const target = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?redirect=${target}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include", /* HttpOnly-cookie сессии (этап 5.1) */
      /* ЭТАП 5.2 (аудит): Content-Type только с телом. Без тела заголовок
       * провоцировал 400 FST_ERR_CTP_EMPTY_JSON_BODY на logout и действиях
       * сделок — и logout не уничтожал серверную сессию. */
      headers: {
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Сервер недоступен — проверьте, запущен ли API");
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status === 401) {
      /* Истёкшая/чужая сессия — на экран входа (однократно). */
      handleUnauthorized(path);
    }
    throw new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Ошибка ${res.status}`);
  }
  return body as T;
}

/* ---------- Поставщики ---------- */

export function listSuppliers(): Promise<SupplierDTO[]> {
  return request<SupplierDTO[]>("/suppliers");
}

export function createSupplier(input: SupplierInput): Promise<SupplierDTO> {
  return request<SupplierDTO>("/suppliers", { method: "POST", body: JSON.stringify(input) });
}

export function updateSupplier(id: string, patch: Partial<SupplierInput>): Promise<SupplierDTO> {
  return request<SupplierDTO>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteSupplier(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/suppliers/${id}`, { method: "DELETE" });
}

/* ---------- Шаблоны культур ---------- */

export function listCultures(): Promise<CultureTemplateDTO[]> {
  return request<CultureTemplateDTO[]>("/cultures");
}

/* ---------- Позиции ---------- */

export interface PositionFilters {
  type?: CultureType;
  cultureId?: string;
  supplierId?: string;
  status?: PositionStatus;
  q?: string;
}

export function listPositions(filters: PositionFilters = {}): Promise<PositionDTO[]> {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.cultureId) params.set("cultureId", filters.cultureId);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return request<PositionDTO[]>(`/positions${qs ? `?${qs}` : ""}`);
}

export function createPosition(input: PositionInput): Promise<PositionDTO> {
  return request<PositionDTO>("/positions", { method: "POST", body: JSON.stringify(input) });
}

export function updatePosition(
  id: string,
  patch: Partial<PositionInput>,
): Promise<PositionDTO> {
  return request<PositionDTO>(`/positions/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deletePosition(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/positions/${id}`, { method: "DELETE" });
}

/* ---------- Медиа (presigned R2) ---------- */

export function requestMediaUpload(
  positionId: string,
  input: { type: "PHOTO" | "VIDEO"; contentType: string; watermark?: boolean },
): Promise<MediaUploadDTO> {
  return request<MediaUploadDTO>(`/positions/${positionId}/media`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Прямая загрузка файла в R2 по presigned-ссылке. */
export async function putFile(uploadUrl: string, file: File, headers: Record<string, string>) {
  const res = await fetch(uploadUrl, { method: "PUT", headers, body: file });
  if (!res.ok) throw new ApiError(res.status, "UPLOAD_FAILED", "Не удалось загрузить файл");
}

/** ЭТАП 6: JSON-загрузка через сервер и единое хранилище
    (без R2 — base64 в БД; с R2 — объект в бакете). */
export function uploadPositionMedia(
  positionId: string,
  input: { dataUrl: string; type: "PHOTO" | "VIDEO"; watermark?: boolean },
): Promise<{ ok: boolean; media: MediaDTO; storage: "base64" | "r2" }> {
  return request(`/positions/${positionId}/media/upload`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Прочитать File как data-URL (для JSON-загрузки через сервер). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

export function deleteMedia(positionId: string, mediaId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/positions/${positionId}/media/${mediaId}`, {
    method: "DELETE",
  });
}

/* ---------- Пользователь и мета ---------- */

export function getUser(): Promise<UserDTO | null> {
  return request<UserDTO | null>("/user");
}

/* ---------- Этап 5.1: авторизация владельца ---------- */

export interface LoginInput {
  login: string;
  password: string;
}

export interface AuthSessionDTO {
  ok: true;
  authenticated: boolean;
  configured: boolean;
  login?: string;
  expiresAt?: string;
}

/** Вход владельца: серверная сессия в HttpOnly-cookie. */
export function login(input: LoginInput): Promise<{ ok: true; authenticated: true; expiresAt: string }> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

/** Выход: уничтожение серверной сессии + очистка cookie. */
export function logout(): Promise<{ ok: true; authenticated: false }> {
  return request("/auth/logout", { method: "POST" });
}

/** Состояние сессии (публичный маршрут — для экрана входа). */
export function getAuthSession(): Promise<AuthSessionDTO> {
  return request<AuthSessionDTO>("/auth/session");
}

export interface MetaDTO {
  ok: boolean;
  name: string;
  version: string;
  stage: number;
  /** ЭТАП 7: дата релиза для раздела «Версия и обновления». */
  releasedAt?: string;
  stages: Record<string, boolean>;
  /** ЭТАП 6: режим файлового хранилища (base64 | r2). */
  storage: { mode: "base64" | "r2" };
}

export function getMeta(): Promise<MetaDTO> {
  return request("/meta");
}

/* ---------- Каналы (этап 2) ---------- */

export interface ChannelFilters {
  type?: ChannelType;
  tag?: ChannelTag;
  region?: string;
  q?: string;
}

export function listChannels(filters: ChannelFilters = {}): Promise<ChannelDTO[]> {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.region) params.set("region", filters.region);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return request<ChannelDTO[]>(`/channels${qs ? `?${qs}` : ""}`);
}

export function createChannel(input: ChannelInput): Promise<ChannelDTO> {
  return request<ChannelDTO>("/channels", { method: "POST", body: JSON.stringify(input) });
}

export function updateChannel(id: string, patch: Partial<ChannelInput>): Promise<ChannelDTO> {
  return request<ChannelDTO>(`/channels/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteChannel(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/channels/${id}`, { method: "DELETE" });
}

/** Умный подбор: 3–5 каналов под позицию (тип → тег → регион → охват). */
export function suggestChannels(positionId: string): Promise<SuggestChannelsDTO> {
  return request<SuggestChannelsDTO>(`/positions/${positionId}/suggest-channels`, {
    method: "POST",
  });
}

/* ---------- Этап 2.5: рынок и парсер ---------- */

/** Агрегаты цен конкурентов по культуре позиции (обновление раз в день). */
export function getPositionMarket(positionId: string): Promise<MarketDTO> {
  return request<MarketDTO>(`/positions/${positionId}/market`);
}

/** Ручной запуск парсера (для теста; cron живёт в самом сервисе). */
export function runParser(
  input: { queries?: string[]; sources?: string[] } = {},
): Promise<ParserRunDTO> {
  return request<ParserRunDTO>("/parser/run", { method: "POST", body: JSON.stringify(input) });
}

/* ---------- Аккаунты (этап 2) ---------- */

export function listAccounts(): Promise<AccountDTO[]> {
  return request<AccountDTO[]>("/accounts");
}

export function createAccount(input: AccountInput): Promise<AccountDTO> {
  return request<AccountDTO>("/accounts", { method: "POST", body: JSON.stringify(input) });
}

export function updateAccount(id: string, patch: Partial<AccountInput>): Promise<AccountDTO> {
  return request<AccountDTO>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteAccount(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/accounts/${id}`, { method: "DELETE" });
}

/* ---------- Размещения (этап 2) ---------- */

export function listListings(positionId?: string): Promise<ListingDTO[]> {
  const qs = positionId ? `?positionId=${encodeURIComponent(positionId)}` : "";
  return request<ListingDTO[]>(`/listings${qs}`);
}

export function createListing(input: ListingCreateInput): Promise<ListingDTO> {
  return request<ListingDTO>("/listings", { method: "POST", body: JSON.stringify(input) });
}

export function updateListing(id: string, patch: ListingUpdateInput): Promise<ListingDTO> {
  return request<ListingDTO>(`/listings/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteListing(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/listings/${id}`, { method: "DELETE" });
}

/* ---------- Этап 3.2: инбокс (лиды) и Telegram-бот ---------- */

export interface LeadFilters {
  status?: LeadStatus;
  source?: string;
  q?: string;
}

/** Список лидов с превью последнего сообщения. */
export function listLeads(filters: LeadFilters = {}): Promise<{ items: LeadDTO[] }> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return request<{ items: LeadDTO[] }>(`/leads${qs ? `?${qs}` : ""}`);
}

/** Лид с полной перепиской. */
export function getLead(id: string): Promise<LeadDetailDTO> {
  return request<LeadDetailDTO>(`/leads/${id}`);
}

/** Статус, заметка, интерес, позиция. */
export function updateLead(id: string, patch: LeadUpdateInput): Promise<LeadDetailDTO> {
  return request<LeadDetailDTO>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Черновик ответа (AI по позиции или честный fallback-шаблон). */
export function replyLeadDraft(id: string): Promise<LeadDraftDTO> {
  return request<LeadDraftDTO>(`/leads/${id}/reply`, {
    method: "POST",
    body: JSON.stringify({ useAi: true }),
  });
}

/** Отправка ответа покупателю через бота (возвращает отправленное сообщение). */
export function sendLeadReply(
  id: string,
  input: LeadReplyInput,
): Promise<{ ok: true; message: LeadMessageDTO }> {
  return request<{ ok: true; message: LeadMessageDTO }>(`/leads/${id}/reply`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Статус бота: настроен ли, webhook, новые лиды, свои каналы. */
export function getTelegramStatus(): Promise<TelegramStatusDTO> {
  return request<TelegramStatusDTO>("/telegram/status");
}

/** Ручная установка webhook (если авто-сетап при деплое не сработал). */
export function setupTelegramWebhook(url?: string): Promise<{
  ok: true;
  webhook: { url: string; pendingUpdateCount: number; lastErrorMessage?: string };
}> {
  return request<{ ok: true; webhook: { url: string; pendingUpdateCount: number; lastErrorMessage?: string } }>(
    "/telegram/setup-webhook",
    { method: "POST", body: JSON.stringify(url ? { url } : {}) },
  );
}

/** Публикация черновика в свой канал через бота (админом которого он является). */
export function publishViaBot(
  listingId: string,
  confirm?: boolean,
): Promise<TelegramPublishDTO> {
  return request<TelegramPublishDTO>("/telegram/publish", {
    method: "POST",
    body: JSON.stringify({ listingId, ...(confirm ? { confirm: true } : {}) }),
  });
}

/* ---------- ЭТАП 9: фиды площадок и Авито API ---------- */

/** Адреса фидов для кабинетов площадок (Зерно Он-Лайн, Своё Фермерство). */
export function getFeedsInfo(): Promise<FeedsInfoDTO> {
  return request<FeedsInfoDTO>("/feeds/info");
}

/* ЭТАП «СЕКРЕТЫ» — управление переменными окружения из «Настройки».
   Значения клиенту не отдаются: только маски ••••1234 и флаги. */

/** Список переменных: маски, источники (env/app/none), шифрование, история. */
export function getSecretsStatus(): Promise<SecretsStatusDTO> {
  return request<SecretsStatusDTO>("/settings/secrets");
}

/** Сохранить секрет (value=null — убрать). env платформы → 400. */
export function saveSecret(key: string, value: string | null): Promise<SecretSaveDTO> {
  return request<SecretSaveDTO>("/settings/secrets", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  });
}

/** «Проверить подключение» — реальный запрос к сервису. */
export function testSecretConnection(key: string): Promise<SecretTestDTO> {
  return request<SecretTestDTO>(`/settings/secrets/${encodeURIComponent(key)}/test`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Статус Авито API: настроен ли клиент, id профиля, адрес фида. */
export function getAvitoStatus(): Promise<AvitoStatusDTO> {
  return request<AvitoStatusDTO>("/avito/status");
}

/** Настройки Авито API (секрет маскирован; env — только чтение). */
export function getAvitoSettings(): Promise<AvitoSettingsDTO> {
  return request<AvitoSettingsDTO>("/avito/settings");
}

/** Сохранение ключей Авито API (client_id/secret/user_id/телефон). */
export function saveAvitoSettings(input: AvitoSettingsInput): Promise<AvitoSettingsDTO> {
  return request<AvitoSettingsDTO>("/avito/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** «Проверить подключение»: OAuth-токен + состояние автозагрузки. */
export function checkAvitoConnection(): Promise<AvitoCheckDTO> {
  return request<AvitoCheckDTO>("/avito/check", { method: "POST", body: JSON.stringify({}) });
}

/** Dry-run: превью XML Автозагрузки + валидация (до подтверждения). */
export function avitoDryRun(): Promise<AvitoDryRunDTO> {
  return request<AvitoDryRunDTO>("/avito/dry-run", { method: "POST", body: JSON.stringify({}) });
}

/** Публикация на Авито (после подтверждения превью): upload фида. */
export function avitoPublish(): Promise<AvitoPublishDTO> {
  return request<AvitoPublishDTO>("/avito/publish", { method: "POST", body: JSON.stringify({}) });
}

/* ---------- ЭТАП 10: MAX Bot API и userbot (чтение TG-чатов) ---------- */

/** Статус MAX-бота: токен, бот, режим, каналы с привязками chat_id. */
export function getMaxStatus(): Promise<MaxStatusDTO> {
  return request<MaxStatusDTO>("/max/status");
}

/** Настройки MAX (токен маскирован; env — только чтение). */
export function getMaxSettings(): Promise<MaxSettingsDTO> {
  return request<MaxSettingsDTO>("/max/settings");
}

/** Сохранение токена MAX-бота и ID владельца (когда токен не в env). */
export function saveMaxSettings(input: MaxSettingsInput): Promise<MaxSettingsDTO> {
  return request<MaxSettingsDTO>("/max/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** «Проверить подключение» MAX: реальный GET /me. */
export function checkMaxConnection(): Promise<MaxCheckDTO> {
  return request<MaxCheckDTO>("/max/check", { method: "POST", body: JSON.stringify({}) });
}

/** Публикация черновика в свой MAX-канал через бота. */
export function maxPublish(
  listingId: string,
  opts?: { chatId?: number; confirm?: boolean },
): Promise<MaxPublishDTO> {
  return request<MaxPublishDTO>("/max/publish", {
    method: "POST",
    body: JSON.stringify({
      listingId,
      ...(opts?.chatId ? { chatId: opts.chatId } : {}),
      ...(opts?.confirm ? { confirm: true } : {}),
    }),
  });
}

/** Статус userbot: креды, живой сервис, список читаемых чатов. */
export function getUserbotStatus(): Promise<UserbotStatusDTO> {
  return request<UserbotStatusDTO>("/userbot/status");
}

/** «Добавить чат» для чтения userbot-ом (@username/t.me-ссылка/ID). */
export function addUserbotChat(chat: string): Promise<{ ok: true; chat: string; chats: string[] }> {
  return request<{ ok: true; chat: string; chats: string[] }>("/userbot/chats", {
    method: "POST",
    body: JSON.stringify({ chat }),
  });
}

/** Убрать чат из списка читаемых. */
export function removeUserbotChat(chat: string): Promise<{ ok: true; chat: string; chats: string[] }> {
  return request<{ ok: true; chat: string; chats: string[] }>("/userbot/chats", {
    method: "DELETE",
    body: JSON.stringify({ chat }),
  });
}

/* ---------- Этап 3.0: AI-слой (5 use cases) ---------- */

export function generateAiListing(input: AiListingInput): Promise<AiResponse<AiListingData>> {
  return request<AiResponse<AiListingData>>("/ai/listing", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function generateAiReply(input: AiReplyInput): Promise<AiResponse<AiReplyData>> {
  return request<AiResponse<AiReplyData>>("/ai/reply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAiAdvice(input: AiAdviceInput = {}): Promise<AiResponse<AiAdviceData>> {
  return request<AiResponse<AiAdviceData>>("/ai/advice", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function analyzeAiPrice(
  input: AiPriceAnalysisInput,
): Promise<AiResponse<AiPriceAnalysisData>> {
  return request<AiResponse<AiPriceAnalysisData>>("/ai/price_analysis", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function planAiLogistics(
  input: AiLogisticsInput,
): Promise<AiResponse<AiLogisticsData>> {
  return request<AiResponse<AiLogisticsData>>("/ai/logistics", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* ---------- Этап 4: сделки, документы, рекламации, ТК ---------- */

/** Фильтр списка сделок: конкретный статус + группы ACTIVE / FINISHED. */
export type DealListStatus = DealStatus | "ACTIVE" | "FINISHED";

export interface DealFilters {
  status?: DealListStatus;
  q?: string;
  period?: "all" | "week" | "month";
}

export function listDeals(filters: DealFilters = {}): Promise<{ items: DealDetailDTO[] }> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.period && filters.period !== "all") params.set("period", filters.period);
  const qs = params.toString();
  return request<{ items: DealDetailDTO[] }>(`/deals${qs ? `?${qs}` : ""}`);
}

export function getDeal(id: string): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}`);
}

export function createDeal(input: DealCreateInput): Promise<DealDetailDTO> {
  return request<DealDetailDTO>("/deals", { method: "POST", body: JSON.stringify(input) });
}

export function updateDeal(id: string, patch: DealUpdateInput): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteDeal(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/deals/${id}`, { method: "DELETE" });
}

export function awaitingPaymentDeal(id: string): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}/awaiting-payment`, { method: "POST" });
}

export function payDeal(id: string): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}/pay`, { method: "POST" });
}

export function shipDeal(id: string, input: DealShipInput): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}/ship`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deliverDeal(id: string): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}/deliver`, { method: "POST" });
}

export function closeDeal(id: string): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}/close`, { method: "POST" });
}

export function cancelDeal(id: string): Promise<DealDetailDTO> {
  return request<DealDetailDTO>(`/deals/${id}/cancel`, { method: "POST" });
}

/* Документы */

export function listDealDocuments(dealId: string): Promise<{ items: DocumentDTO[] }> {
  return request<{ items: DocumentDTO[] }>(`/deals/${dealId}/documents`);
}

/** Генерация PDF: type — invoice | contract | transport_note | upd. */
export function generateDealDocument(
  dealId: string,
  type: DocumentType,
): Promise<{ ok: true; document: DocumentDTO }> {
  return request<{ ok: true; document: DocumentDTO }>(`/deals/${dealId}/documents/${type}`, {
    method: "POST",
  });
}

/** Скачивание PDF как файла (бинарный ответ, с cookie сессии). */
export async function downloadDocument(doc: DocumentDTO): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/documents/${doc.id}/file`, { credentials: "include" });
  } catch {
    throw new ApiError(0, "NETWORK", "Сервер недоступен — проверьте API");
  }
  if (res.status === 401) {
    handleUnauthorized(`/documents/${doc.id}/file`);
  }
  if (!res.ok) {
    throw new ApiError(res.status, "DOWNLOAD_FAILED", "Не удалось скачать документ");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.number}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Калькулятор доставки */

export function calculateDelivery(input: {
  positionId?: string;
  toCity: string;
  volumeKg: number;
}): Promise<DeliveryCalculateDTO> {
  return request<DeliveryCalculateDTO>("/deals/calculate-delivery", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* Справочник ТК */

export function listCarriers(): Promise<{ items: CarrierDTO[] }> {
  return request<{ items: CarrierDTO[] }>("/carriers");
}

export function createCarrier(input: CarrierInput): Promise<CarrierDTO> {
  return request<CarrierDTO>("/carriers", { method: "POST", body: JSON.stringify(input) });
}

/* Рекламации */

export interface ClaimFilters {
  dealId?: string;
  status?: ClaimStatus;
}

export function listClaims(filters: ClaimFilters = {}): Promise<{ items: ClaimDTO[] }> {
  const params = new URLSearchParams();
  if (filters.dealId) params.set("dealId", filters.dealId);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return request<{ items: ClaimDTO[] }>(`/claims${qs ? `?${qs}` : ""}`);
}

export function createClaim(input: ClaimCreateInput): Promise<ClaimDTO> {
  return request<ClaimDTO>("/claims", { method: "POST", body: JSON.stringify(input) });
}

export function updateClaim(id: string, patch: ClaimUpdateInput): Promise<ClaimDTO> {
  return request<ClaimDTO>(`/claims/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/* ЭТАП 6: фото рекламаций — через единое хранилище (base64 в БД | R2). */

export function addClaimPhoto(claimId: string, dataUrl: string): Promise<ClaimDTO & { storage: "base64" | "r2" }> {
  return request(`/claims/${claimId}/photos`, {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
  });
}

export function deleteClaimPhoto(claimId: string, index: number): Promise<ClaimDTO> {
  return request(`/claims/${claimId}/photos/${index}`, { method: "DELETE" });
}

/* ---------- Этап 5: аналитика ---------- */

/** Сводка за период: выручка, маржа, конверсия, топы. */
export function getAnalyticsSummary(period: AnalyticsPeriod): Promise<AnalyticsSummaryDTO> {
  return request<AnalyticsSummaryDTO>(`/analytics/summary?period=${period}`);
}

/** Каналы с метриками: ?sort=margin|leads. */
export function getAnalyticsChannels(
  sort: "margin" | "leads" = "margin",
): Promise<AnalyticsChannelsDTO> {
  return request<AnalyticsChannelsDTO>(`/analytics/channels?sort=${sort}`);
}

/** Позиции с метриками: ?sort=margin|stock. */
export function getAnalyticsPositions(
  sort: "margin" | "stock" = "margin",
): Promise<AnalyticsPositionsDTO> {
  return request<AnalyticsPositionsDTO>(`/analytics/positions?sort=${sort}`);
}

/** Чек-лист «Перед запуском». */
export function getReadiness(): Promise<ReadinessDTO> {
  return request<ReadinessDTO>("/analytics/readiness");
}

/* Реквизиты профиля */

export function getUserProfile(): Promise<UserProfileDTO | null> {
  return request<UserProfileDTO | null>("/user/profile");
}

export function updateUserProfile(input: UserProfileInput): Promise<UserProfileDTO | null> {
  return request<UserProfileDTO | null>("/user/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
