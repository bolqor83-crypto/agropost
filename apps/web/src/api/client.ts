/**
 * Типизированный клиент API АгроПост.
 *
 * База:
 * - Vite (apps/web): VITE_API_URL при сборке, иначе относительный /api —
 *   его проксирует vite-dev-server на localhost:3001 (см. vite.config.ts);
 * - Next-превью: мок-API на тех же маршрутах (same-origin /api);
 * - статика на Render: VITE_API_URL=https://agropost-api.onrender.com/api.
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Сервер недоступен — проверьте, запущен ли API");
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
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

export function deleteMedia(positionId: string, mediaId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/positions/${positionId}/media/${mediaId}`, {
    method: "DELETE",
  });
}

/* ---------- Пользователь и мета ---------- */

export function getUser(): Promise<UserDTO | null> {
  return request<UserDTO | null>("/user");
}

export function getMeta(): Promise<{
  ok: boolean;
  name: string;
  version: string;
  stage: number;
  stages: Record<string, boolean>;
}> {
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

/** Скачивание PDF как файла (бинарный ответ). */
export async function downloadDocument(doc: DocumentDTO): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/documents/${doc.id}/file`);
  } catch {
    throw new ApiError(0, "NETWORK", "Сервер недоступен — проверьте API");
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
