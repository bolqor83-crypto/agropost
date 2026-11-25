import type { FastifyInstance } from "fastify";

/** Мета: версия, этапы и флаги интеграций. Фронт использует для статуса «Ещё». */
import { storageMode } from "../storage/factory.js";
import { getSecretValue } from "../settings/secrets.js";
import { secretsEncryptionAvailable } from "../settings/crypto.js";
import { userbotEnvConfigured } from "./userbot.js";

/**
 * Флаги интеграций (этапы 9–10 + секреты): настроен ли канал целиком.
 * Читают и env, и сохранённые секреты; ошибка БД не роняет meta —
 * флаги честно считаются по одному env.
 */
async function featureFlags(): Promise<{
  feeds: boolean;
  avito: boolean;
  max: boolean;
  userbot: boolean;
  secrets: boolean;
}> {
  const fromEnv = () => ({
    feeds: (process.env.FEED_TOKEN ?? "").trim().length >= 16,
    avito: Boolean(
      (process.env.AVITO_CLIENT_ID ?? "").trim() && (process.env.AVITO_CLIENT_SECRET ?? "").trim(),
    ),
    max: Boolean((process.env.MAX_BOT_TOKEN ?? "").trim()),
    userbot: userbotEnvConfigured(),
    secrets: secretsEncryptionAvailable(),
  });
  try {
    const [feedToken, avitoId, avitoSecret, maxToken] = await Promise.all([
      getSecretValue("FEED_TOKEN"),
      getSecretValue("AVITO_CLIENT_ID"),
      getSecretValue("AVITO_CLIENT_SECRET"),
      getSecretValue("MAX_BOT_TOKEN"),
    ]);
    return {
      feeds: feedToken !== null && feedToken.length >= 16,
      avito: avitoId !== null && avitoSecret !== null,
      max: maxToken !== null,
      userbot: userbotEnvConfigured(),
      secrets: secretsEncryptionAvailable(),
    };
  } catch {
    return fromEnv();
  }
}

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/meta", async () => ({
    ok: true,
    name: "АгроПост",
    version: "1.1.0",
    stage: 10,
    /* Этап «секреты»: деплой этапов 8–10 + управление переменными. */
    releasedAt: "2026-11-25",
    stages: {
      suppliers: true, // этап 1
      positions: true, // этап 1
      channels: true, // этап 2 (+ гео-ротация 2.1, подача 2.5)
      parser: true, // этап 2.5
      ai: true, // этап 3.0 (5 use cases)
      bot: true, // этап 3.2 (Telegram-бот, инбокс, автопостинг)
      deals: true, // этап 4 (сделки, доставка, документы, рекламации)
      advice: true, // этап 5 (расширенный контекст + аналитика)
      analytics: true, // этап 5 (сводка, каналы, позиции, readiness)
      storage: true, // этап 6 (единое хранилище: base64 | R2)
      docs: true, // этап 7 (документация и обучающие подсказки)
      feeds: true, // этап 9 (YML/Авито-фиды + Авито API)
      max: true, // этап 10 (MAX Bot API + userbot)
    },
    /* ЭТАП «СЕКРЕТЫ»: флаги настроенных интеграций (env ⋁ UI). */
    features: await featureFlags(),
    /* ЭТАП 6: режим файлового хранилища — фронт выбирает способ загрузки
       и показывает честное предупреждение про «файлы в БД». */
    storage: {
      mode: storageMode(process.env),
    },
  }));
}
