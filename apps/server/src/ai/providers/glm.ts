/**
 * GLM через Z.AI — прямой HTTP (не SDK), чтобы gateway оставался
 * провайдеро-независимым: смена на OpenRouter — только env.
 *
 * POST {GLM_BASE_URL}/chat/completions
 * Authorization: Bearer {GLM_API_KEY}
 */

import type { AiCompletion, AiCompleteParams, AiProvider } from "./types.js";
import { AiProviderError } from "./types.js";
import { AI_DEFAULTS, loadAiConfig } from "../config.js";

export interface GlmProviderOptions {
  apiKey?: string | null;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}

export class GlmProvider implements AiProvider {
  readonly name = "glm" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GlmProviderOptions = {}) {
    const config = loadAiConfig();
    this.apiKey = (options.apiKey ?? config.glmApiKey ?? "").trim();
    this.baseUrl = (options.baseUrl ?? config.glmBaseUrl).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(params: AiCompleteParams): Promise<AiCompletion> {
    if (!this.apiKey) {
      throw new AiProviderError("GLM_API_KEY не задан", "glm");
    }

    const body = {
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ] satisfies ChatMessage[],
      temperature: 0.2,
      stream: false,
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
    };

    const started = Date.now();
    const first = await this.request(body, 0);
    if (first.ok) {
      return this.toCompletion(first.data, started);
    }

    /* Часть моделей не принимает response_format — повторяем без него. */
    if (params.jsonMode && first.status === 400) {
      const second = await this.request({ ...body, response_format: undefined }, 0);
      if (second.ok) return this.toCompletion(second.data, started);
      throw new AiProviderError(second.error, "glm", second.status);
    }

    /* 429 (rate limit) — ждём и пробуем ещё раз один раз. */
    if (first.status === 429) {
      const retried = await this.request(body, 2_000);
      if (retried.ok) return this.toCompletion(retried.data, started);
      throw new AiProviderError(retried.error, "glm", retried.status);
    }

    throw new AiProviderError(
      first.error,
      "glm",
      first.status,
    );
  }

  private async request(
    body: Record<string, unknown>,
    delayMs: number,
  ): Promise<
    | { ok: true; data: unknown }
    | { ok: false; status?: number; error: string }
  > {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      return {
        ok: false,
        error: `GLM недоступен: ${err instanceof Error ? err.message : "ошибка сети"}`,
      };
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* не JSON — оставим текст ошибки */
    }

    if (!res.ok) {
      const apiMessage =
        json && typeof json === "object" && "error" in json
          ? String((json as { error?: { message?: string } | string }).error)
          : text.slice(0, 300);
      return {
        ok: false,
        status: res.status,
        error: `GLM HTTP ${res.status}: ${apiMessage}`,
      };
    }

    return { ok: true, data: json };
  }

  private toCompletion(data: unknown, started: number): AiCompletion {
    const root = data as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = contentToText(root.choices?.[0]?.message?.content);
    if (!content.trim()) {
      throw new AiProviderError("GLM вернул пустой content", "glm");
    }
    return {
      content,
      tokensIn: Number(root.usage?.prompt_tokens ?? 0),
      tokensOut: Number(root.usage?.completion_tokens ?? 0),
      latencyMs: Date.now() - started,
    };
  }
}

export function createGlmProvider(options: GlmProviderOptions = {}): GlmProvider {
  return new GlmProvider(options);
}

export { AI_DEFAULTS };
