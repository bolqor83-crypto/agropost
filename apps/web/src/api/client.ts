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
  ChannelDTO,
  ChannelInput,
  ChannelTag,
  ChannelType,
  CultureTemplateDTO,
  ListingCreateInput,
  ListingDTO,
  ListingUpdateInput,
  MarketDTO,
  MediaUploadDTO,
  ParserRunDTO,
  PositionDTO,
  PositionInput,
  PositionStatus,
  CultureType,
  SuggestChannelsDTO,
  SupplierDTO,
  SupplierInput,
  UserDTO,
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
