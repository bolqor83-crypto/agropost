/**
 * OpenRouter — резервный канал. Тот же интерфейс, что и GLM,
 * поэтому gateway переключается без изменения use cases.
 *
 * POST https://openrouter.ai/api/v1/chat/completions
 * Патч 4.1: каскад моделей (по умолчанию бесплатные из config):
 * complete() идёт по списку, пока одна не ответит; после успеха курсор
 * смещается — следующий вызов начнётся со следующей модели (если
 * модель регулярно возвращает мусор, каскад естественно продвигается).
 * Все модели списка упали — AiProviderError, gateway уходит в fallback.
 */

import type { AiCompletion, AiCompleteParams, AiProvider } from "./types.js";
import { AiProviderError } from "./types.js";
import { loadAiConfig } from "../config.js";

export interface OpenRouterProviderOptions {
  apiKey?: string | null;
  baseUrl?: string;
  /** Каскад моделей; по умолчанию — config.openrouterModels. */
  models?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly models: string[];
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  /** Индекс, с которого начинаем обход каскада на следующем вызове. */
  private cursor = 0;

  constructor(options: OpenRouterProviderOptions = {}) {
    const config = loadAiConfig();
    this.apiKey = (options.apiKey ?? config.openrouterApiKey ?? "").trim();
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    this.models =
      options.models && options.models.length > 0
        ? options.models
        : [config.openrouterModel, ...config.openrouterModels.filter((m) => m !== config.openrouterModel)];
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Порядок обхода каскада с текущего курсора. */
  private cascade(): string[] {
    const n = this.models.length;
    return Array.from({ length: n }, (_, i) => this.models[(this.cursor + i) % n]);
  }

  async complete(params: AiCompleteParams): Promise<AiCompletion> {
    if (!this.apiKey) {
      throw new AiProviderError("OPENROUTER_API_KEY не задан", "openrouter");
    }
    if (this.models.length === 0) {
      throw new AiProviderError("Список моделей OpenRouter пуст", "openrouter");
    }

    const order = this.cascade();
    let lastError: AiProviderError | null = null;
    for (let i = 0; i < order.length; i += 1) {
      const model = order[i];
      try {
        return await this.completeWith(model, params);
      } catch (err) {
        lastError = err instanceof AiProviderError ? err : null;
        if (!lastError) {
          lastError = new AiProviderError(
            err instanceof Error ? err.message : "OpenRouter недоступен",
            "openrouter",
          );
        }
        /* Следующая модель каскада. */
      }
    }
    throw lastError ?? new AiProviderError("OpenRouter: все модели каскада недоступны", "openrouter");
  }

  /** Один вызов модели; успешный ответ смещает курсор каскада. */
  private async completeWith(model: string, params: AiCompleteParams): Promise<AiCompletion> {
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://agropost-web.onrender.com",
          "X-Title": "АгроПост",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user },
          ],
          temperature: 0.2,
          ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new AiProviderError(
        `OpenRouter недоступен: ${err instanceof Error ? err.message : "ошибка сети"}`,
        "openrouter",
      );
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* не JSON */
    }

    if (!res.ok) {
      const apiMessage =
        json && typeof json === "object" && "error" in json
          ? String((json as { error?: { message?: string } | string }).error)
          : text.slice(0, 300);
      throw new AiProviderError(`OpenRouter HTTP ${res.status}: ${apiMessage}`, "openrouter", res.status);
    }

    const root = json as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const raw = root.choices?.[0]?.message?.content;
    const content = typeof raw === "string" ? raw : "";
    if (!content.trim()) {
      throw new AiProviderError("OpenRouter вернул пустой content", "openrouter");
    }

    /* Успех: следующий вызов начнётся со следующей модели каскада. */
    const index = this.models.indexOf(model);
    this.cursor = ((index >= 0 ? index : 0) + 1) % this.models.length;

    return {
      content,
      tokensIn: Number(root.usage?.prompt_tokens ?? 0),
      tokensOut: Number(root.usage?.completion_tokens ?? 0),
      latencyMs: Date.now() - started,
    };
  }
}

export function createOpenRouterProvider(
  options: OpenRouterProviderOptions = {},
): OpenRouterProvider {
  return new OpenRouterProvider(options);
}
