/**
 * Конфигурация AI-слоя. Все ключи живут только на бэкенде (env),
 * в клиент не попадают. Значения по умолчанию — GLM через Z.AI;
 * OpenRouter включается как резервный канал.
 */

export interface AiConfig {
  provider: "glm" | "openrouter";
  glmApiKey: string | null;
  glmBaseUrl: string;
  glmModelFlash: string;
  glmModelPro: string;
  openrouterApiKey: string | null;
  openrouterModel: string;
  /** Каскад моделей OpenRouter (патч 4.1): пробуем по списку, пока не получим ответ. */
  openrouterModels: string[];
  timeoutMs: number;
}

/**
 * Бесплатные модели OpenRouter для каскадного переключения (патч 4.1).
 * Порядок — от более «умной» к более лёгкой; можно переопределить
 * через OPENROUTER_MODELS (через запятую).
 */
export const OPENROUTER_FREE_MODELS = [
  "deepseek/deepseek-v4-flash-0731:free",
  "qwen/qwen3.8-27b:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
] as const;

export const AI_DEFAULTS = {
  glmBaseUrl: "https://api.z.ai/api/paas/v4",
  glmModelFlash: "glm-5.3-flash",
  glmModelPro: "glm-5.3",
  openrouterModel: "openai/gpt-4o-mini",
  timeoutMs: 30_000,
} as const;

/** Список моделей каскада: OPENROUTER_MODELS или [OPENROUTER_MODEL?, ...free]. */
function loadOpenRouterModels(env: NodeJS.ProcessEnv): string[] {
  const explicit = env.OPENROUTER_MODELS
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (explicit?.length) return explicit;
  const primary = env.OPENROUTER_MODEL?.trim();
  return [...(primary ? [primary] : []), ...OPENROUTER_FREE_MODELS];
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = env.AI_PROVIDER === "openrouter" ? "openrouter" : "glm";
  const timeout = Number(env.AI_TIMEOUT_MS);
  const openrouterModels = loadOpenRouterModels(env);
  return {
    provider,
    glmApiKey: env.GLM_API_KEY?.trim() || null,
    glmBaseUrl: env.GLM_BASE_URL?.trim() || AI_DEFAULTS.glmBaseUrl,
    glmModelFlash: env.GLM_MODEL_FLASH?.trim() || AI_DEFAULTS.glmModelFlash,
    glmModelPro: env.GLM_MODEL_PRO?.trim() || AI_DEFAULTS.glmModelPro,
    openrouterApiKey:
      env.OPENROUTER_API_KEY?.trim() ||
      env.OPENROUTER_KEY?.trim() ||
      null,
    openrouterModel: openrouterModels[0] ?? AI_DEFAULTS.openrouterModel,
    openrouterModels,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : AI_DEFAULTS.timeoutMs,
  };
}

/** Краткое описание для /api/meta и логов — без ключей. */
export function aiPublicInfo(config: AiConfig): {
  provider: string;
  glmConfigured: boolean;
  openrouterConfigured: boolean;
  models: { flash: string; pro: string; reserve: string; reserveCascade: string[] };
} {
  return {
    provider: config.provider,
    glmConfigured: Boolean(config.glmApiKey),
    openrouterConfigured: Boolean(config.openrouterApiKey),
    models: {
      flash: config.glmModelFlash,
      pro: config.glmModelPro,
      reserve: config.openrouterModel,
      reserveCascade: config.openrouterModels,
    },
  };
}
