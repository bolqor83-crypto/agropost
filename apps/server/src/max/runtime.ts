/**
 * ЭТАП 10 — рантайм MAX-модуля: env ⋁ AppSetting "max", сборка deps.
 *
 * appSetting "max" хранит {token, ownerId}, если токен введён через
 * «Ещё» → «Настройки» → «MAX». env MAX_BOT_TOKEN имеет приоритет.
 *
 * setMaxSettingsLoader / setMaxDepsFactory — подмены для тестов
 * (env-only, без Prisma; deps поверх фейков — как у feeds/avito).
 */

import { prisma } from "../prisma.js";
import type { Prisma } from "@prisma/client";
import { encryptSecret, maybeDecrypt } from "../settings/crypto.js";
import { createMaxClient } from "./bot.js";
import {
  isMaxConfigured,
  maxConfiguredFrom,
  resolveMaxConfig,
  type MaxSettingsRow,
} from "./config.js";
import type { MaxConfig } from "./types.js";
import { prismaMaxDb } from "./db.js";
import type { MaxBotInfo, MaxDeps, MaxNotify } from "./types.js";

/* Тесты: подмена загрузчика настроек (env-only, без Prisma). */
let settingsLoader: (() => Promise<MaxSettingsRow | null>) | null = null;
/* Тесты маршрутов: подмена deps (фейк вместо Prisma/сети). */
let depsFactory: (() => Promise<MaxDeps> | null) | null = null;

export function setMaxSettingsLoader(loader: (() => Promise<MaxSettingsRow | null>) | null): void {
  settingsLoader = loader;
}

export function setMaxDepsFactory(factory: (() => Promise<MaxDeps> | null) | null): void {
  depsFactory = factory;
}

/** Значение секции "max" из AppSetting (или null, если не заполняли).
    Токен хранится шифрованным (AES-256-GCM); легаси-plaintext этапа 10
    читается как есть и перешифруется при следующем сохранении. */
export async function maxSettingsFromDb(): Promise<MaxSettingsRow | null> {
  if (settingsLoader) return settingsLoader();
  const row = await prisma.appSetting.findUnique({ where: { key: "max" } });
  if (!row) return null;
  const value = row.value as Record<string, unknown> | null;
  if (!value || typeof value !== "object") return null;
  const token = value.token;
  const ownerId = value.ownerId;
  return {
    token:
      typeof token === "string" && token.trim().length > 0
        ? maybeDecrypt(token)
        : null,
    ownerId: typeof ownerId === "number" && Number.isFinite(ownerId) ? ownerId : null,
  };
}

/** Сохранить секцию "max" (токен/ID владельца) — из Настроек.
    Токен пишется ТОЛЬКО в шифрованном виде. */
export async function saveMaxSettings(data: MaxSettingsRow): Promise<void> {
  const asJson = JSON.parse(JSON.stringify({
    ...data,
    token: data.token ? encryptSecret(data.token) : null,
  })) as Prisma.InputJsonValue;
  await prisma.appSetting.upsert({
    where: { key: "max" },
    create: { key: "max", value: asJson },
    update: { value: asJson },
  });
}

/** Действующая конфигурация MAX (env ⋁ БД). */
export async function currentMaxConfig(): Promise<MaxConfig> {
  return resolveMaxConfig(await maxSettingsFromDb());
}

export function maxConfiguredSource(config: MaxConfig): "env" | "settings" | "none" {
  return maxConfiguredFrom(config);
}

/** Уведомитель владельцу — из Telegram-модуля (тот же дайджест-бот). */
async function telegramNotify(): Promise<MaxNotify> {
  const { getTelegram } = await import("../telegram/index.js");
  return getTelegram().deps.notify;
}

/** Сборка deps MAX-модуля (api + db + notify). */
export async function buildMaxDeps(config?: MaxConfig): Promise<MaxDeps | null> {
  const cfg = config ?? (await currentMaxConfig());
  if (!isMaxConfigured(cfg) || cfg.token === null) return null;
  const api = createMaxClient({ token: cfg.token, apiBase: cfg.apiBase });

  /* Кэш getMe: username нужен для диплинков объявлений. */
  let meCache: MaxBotInfo | null | undefined;
  const botInfo = async (): Promise<MaxBotInfo | null> => {
    if (meCache !== undefined) return meCache;
    try {
      meCache = await api.getMe();
    } catch {
      meCache = null;
    }
    return meCache;
  };

  return {
    cfg,
    api,
    db: prismaMaxDb,
    notify: await telegramNotify(),
    botInfo,
  };
}

/** deps для маршрутов: тестовая подмена ⋁ прод-сборка.
    Не настроен → null всегда (фабрика не обходит отсутствие токена). */
export async function resolveMaxDeps(): Promise<MaxDeps | null> {
  const config = await currentMaxConfig();
  if (!isMaxConfigured(config)) return null;
  if (depsFactory) return depsFactory();
  return await buildMaxDeps(config);
}
