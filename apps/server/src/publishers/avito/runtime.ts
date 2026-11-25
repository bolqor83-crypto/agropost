/**
 * ЭТАП 9 — рантайм-доступ к конфигурации Авито (env + AppSetting "avito").
 *
 * appSetting "avito" хранит {clientId, clientSecret, userId, phone},
 * если ключи введены через «Ещё» → «Настройки» → «Авито API».
 * env AVITO_* имеет приоритет над БД (см. resolveAvitoConfig).
 */

import { prisma } from "../../prisma.js";
import { maybeDecrypt } from "../../settings/crypto.js";
import {
  isAvitoConfigured,
  resolveAvitoConfig,
  type AvitoRuntimeConfig,
  type AvitoSettingsRow,
} from "./config.js";

/* Тесты: подмена загрузчика настроек (env-only, без Prisma). */
let settingsLoader: (() => Promise<AvitoSettingsRow | null>) | null = null;

export function setAvitoSettingsLoader(loader: (() => Promise<AvitoSettingsRow | null>) | null): void {
  settingsLoader = loader;
}

/** Значение секции "avito" из AppSetting (или null, если не заполняли).
    Ключи хранятся шифрованными (AES-256-GCM); легаси-plaintext этапа 9
    читается как есть и перешифруется при следующем сохранении. */
export async function avitoSettingsFromDb(): Promise<AvitoSettingsRow | null> {
  if (settingsLoader) return settingsLoader();
  const row = await prisma.appSetting.findUnique({ where: { key: "avito" } });
  if (!row) return null;
  const value = row.value as Record<string, unknown> | null;
  if (!value || typeof value !== "object") return null;
  const pick = (key: string): string | null => {
    const v = value[key];
    if (typeof v !== "string" || v.trim().length === 0) return null;
    return maybeDecrypt(v);
  };
  return {
    clientId: pick("clientId"),
    clientSecret: pick("clientSecret"),
    userId: pick("userId"),
    phone: pick("phone"),
  };
}

/** Действующая конфигурация Авито (env ⋁ БД). */
export async function currentAvitoConfig(): Promise<AvitoRuntimeConfig> {
  return resolveAvitoConfig(await avitoSettingsFromDb());
}

/** Источник конфигурации для AvitoStatusDTO.configuredFrom. */
export function configuredFrom(config: AvitoRuntimeConfig): "env" | "settings" | "none" {
  if (isAvitoConfigured(config)) return config.fromEnv ? "env" : "settings";
  return "none";
}
