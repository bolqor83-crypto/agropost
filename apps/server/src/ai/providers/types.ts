/**
 * Контракт AI-провайдера. Оба провайдера (GLM, OpenRouter) и мок
 * реализуют один интерфейс — gateway выбирает по env и переключается
 * без изменения use cases.
 */

export interface AiCompleteParams {
  system: string;
  user: string;
  model: string;
  /** Просить response_format json_object, если провайдер поддерживает. */
  jsonMode: boolean;
}

export interface AiCompletion {
  content: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: "glm" | "openrouter" | "mock";
  complete(params: AiCompleteParams): Promise<AiCompletion>;
}

/** Ошибка сети/HTTP/парсинга — gateway ловит и уходит в retry/fallback. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
