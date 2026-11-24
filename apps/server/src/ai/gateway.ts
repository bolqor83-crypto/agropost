/**
 * Единая точка вызова AI.
 *
 * Схема:
 *   кэш → провайдер → JSON → zod → white-label → ответ
 *                    └→ ошибка/невалидно → retry (усиленный промпт)
 *                                         └→ ошибка → fallback (шаблон)
 *
 * Приложение НИКОГДА не падает из-за AI: fallback возвращает честный
 * результат из тех же данных. OpenRouter — резервный канал при сбое GLM.
 */

import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import type {
  AiMeta,
  AiProviderName,
  AiResponse,
  AiStatus,
  AiUseCase,
} from "@shared/ai";
import { AiCache } from "./cache.js";
import { loadAiConfig, type AiConfig } from "./config.js";
import { extractJson } from "./json.js";
import type { AiLogger } from "./logger.js";
import { dbAiLogger } from "./logger.js";
import { createGlmProvider } from "./providers/glm.js";
import { createOpenRouterProvider } from "./providers/openrouter.js";
import type { AiProvider } from "./providers/types.js";

export interface AiRunOptions<T> {
  useCase: AiUseCase;
  /** Вход для хэша и логов (без ключей). */
  input: unknown;
  schema: ZodType<T>;
  system: string;
  user: string;
  model?: "flash" | "pro";
  /** Проверка бизнес-правил (white-label, лимиты). */
  validate?: (data: T) => string[];
  /** Шаблонный результат, если AI не справился. */
  fallback: (reason: string) => T;
  /** Для инвалидации кэша при PATCH позиции. */
  positionIds?: string[];
  warnings?: string[];
}

export interface AiGatewayDeps {
  primary?: AiProvider | null;
  secondary?: AiProvider | null;
  cache?: AiCache;
  logger?: AiLogger;
  config?: AiConfig;
}

export class AiGateway {
  private readonly primary: AiProvider | null;
  private readonly secondary: AiProvider | null;
  private readonly cache: AiCache;
  private readonly logger: AiLogger;
  private readonly config: AiConfig;

  constructor(deps: AiGatewayDeps = {}) {
    this.config = deps.config ?? loadAiConfig();
    const primary =
      deps.primary === undefined ? this.defaultPrimary(this.config) : deps.primary;
    const secondary =
      deps.secondary === undefined ? this.defaultSecondary(this.config) : deps.secondary;
    this.primary = primary;
    this.secondary = secondary;
    this.cache = deps.cache ?? new AiCache();
    this.logger = deps.logger ?? dbAiLogger;
  }

  private defaultPrimary(config: AiConfig): AiProvider | null {
    if (config.provider === "glm") {
      return config.glmApiKey ? createGlmProvider() : null;
    }
    return config.openrouterApiKey ? createOpenRouterProvider() : null;
  }

  private defaultSecondary(config: AiConfig): AiProvider | null {
    if (config.provider === "glm") {
      return config.openrouterApiKey ? createOpenRouterProvider() : null;
    }
    return config.glmApiKey ? createGlmProvider() : null;
  }

  private modelFor(provider: AiProvider, tier: "flash" | "pro"): string {
    if (provider.name === "openrouter") return this.config.openrouterModel;
    return tier === "pro" ? this.config.glmModelPro : this.config.glmModelFlash;
  }

  async run<T>(options: AiRunOptions<T>): Promise<AiResponse<T>> {
    const started = Date.now();
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ useCase: options.useCase, input: options.input }))
      .digest("hex");

    const cached = this.cache.get<T>(inputHash);
    if (cached !== null) {
      return {
        ok: true,
        data: cached,
        warnings: [],
        meta: {
          model: "cache",
          provider: "cache" satisfies AiProviderName,
          latencyMs: Date.now() - started,
          status: "ok",
          cached: true,
          tokensIn: 0,
          tokensOut: 0,
        },
      };
    }

    const warnings = [...(options.warnings ?? [])];
    let lastError = "AI не настроен";
    let status: AiStatus = "ok";
    let data: T | null = null;
    let usedProvider: AiProvider | null = null;
    let usedModel = "fallback";
    let tokensIn = 0;
    let tokensOut = 0;
    let providerFailed = false;

    /* Две попытки. Если первая упала по сети/HTTP — вторая идёт в резервный
     * канал; если вернулся невалидный JSON или white-label — та же модель,
     * но с усиленным промптом. */
    for (let attempt = 0; attempt < 2 && data === null; attempt += 1) {
      const provider = providerFailed
        ? this.secondary ?? this.primary
        : this.primary ?? this.secondary;
      if (!provider) {
        lastError = "AI-провайдер не настроен";
        break;
      }

      const user =
        attempt === 0
          ? options.user
          : `${options.user}\n\nВАЖНО: предыдущий ответ не прошёл проверку (${lastError}).\n` +
            "Верни ТОЛЬКО валидный JSON по схеме. Не добавляй имя поставщика, город, станицу, склад, телефон и другие данные, которых нет во входе.";

      try {
        const completion = await provider.complete({
          system: options.system,
          user,
          model: this.modelFor(provider, options.model ?? "flash"),
          jsonMode: true,
        });
        usedProvider = provider;
        usedModel = this.modelFor(provider, options.model ?? "flash");
        tokensIn = completion.tokensIn;
        tokensOut = completion.tokensOut;

        const parsed = extractJson(completion.content);
        const result = options.schema.safeParse(parsed);
        if (!result.success) {
          lastError = `JSON не прошёл схему: ${result.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
            .join("; ")}`;
          providerFailed = false;
          continue;
        }

        const violations = options.validate ? options.validate(result.data) : [];
        if (violations.length > 0) {
          lastError = `Нарушены правила: ${violations.join("; ")}`;
          providerFailed = false;
          continue;
        }

        data = result.data;
        status = attempt === 0 ? "ok" : "retry";
        if (attempt === 1) {
          warnings.push("AI переформулировал ответ: первая версия не прошла проверку.");
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Неизвестная ошибка AI";
        usedProvider = provider;
        providerFailed = true;
      }
    }

    if (data === null) {
      data = options.fallback(lastError);
      status = "fallback";
      usedProvider = null;
      usedModel = "fallback";
      warnings.push("AI недоступен — использован шаблон.");
    }

    const latencyMs = Date.now() - started;
    const meta: AiMeta = {
      model: usedModel,
      provider: (usedProvider?.name ?? "fallback") satisfies AiProviderName,
      latencyMs,
      status,
      tokensIn,
      tokensOut,
    };

    if (status !== "fallback") {
      this.cache.set(inputHash, data, options.positionIds ?? []);
    }

    await this.logger.log({
      useCase: options.useCase,
      inputHash,
      outputJson: data,
      latencyMs,
      status,
      errorMessage: status === "fallback" ? lastError : null,
      tokensIn: tokensIn || null,
      tokensOut: tokensOut || null,
      provider: usedProvider?.name ?? "fallback",
      model: usedModel,
    });

    return { ok: true, data, warnings: [...new Set(warnings)], meta };
  }
}

/** Глобальный gateway — провайдеры читаются из env один раз. */
export const aiGateway = new AiGateway();

/** Фабрика для тестов и для запуска с другим окружением. */
export function createAiGateway(deps: AiGatewayDeps = {}): AiGateway {
  return new AiGateway(deps);
}

/** Тестовый хэш — тот же алгоритм, что и в run. */
export function aiInputHash(useCase: AiUseCase, input: unknown): string {
  return createHash("sha256").update(JSON.stringify({ useCase, input })).digest("hex");
}
