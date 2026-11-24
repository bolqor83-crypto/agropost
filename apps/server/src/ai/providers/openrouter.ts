/**
 * OpenRouter — резервный канал. Тот же интерфейс, что и GLM,
 * поэтому gateway переключается без изменения use cases.
 *
 * POST https://openrouter.ai/api/v1/chat/completions
 * Модель задаётся OPENROUTER_MODEL (по умолчанию недорогая).
 */

import type { AiCompletion, AiCompleteParams, AiProvider } from "./types.js";
import { AiProviderError } from "./types.js";
import { loadAiConfig } from "../config.js";

export interface OpenRouterProviderOptions {
  apiKey?: string | null;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenRouterProviderOptions = {}) {
    const config = loadAiConfig();
    this.apiKey = (options.apiKey ?? config.openrouterApiKey ?? "").trim();
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(params: AiCompleteParams): Promise<AiCompletion> {
    if (!this.apiKey) {
      throw new AiProviderError("OPENROUTER_API_KEY не задан", "openrouter");
    }

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
          model: params.model,
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
      throw new AiProviderError("OpenRouter вернул пустый content", "openrouter");
    }
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
