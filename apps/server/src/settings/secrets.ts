/**
 * Реестр секретов и единый резолвер «env ⋁ AppSetting».
 *
 * Управляемые переменные (экран «Ещё» → «Настройки»): FEED_TOKEN,
 * AVITO_CLIENT_ID/SECRET/USER_ID/CONTACT_PHONE, MAX_BOT_TOKEN,
 * OPENROUTER_API_KEY, TELEGRAM_BOT_TOKEN/USER_ID.
 *
 * Правила:
 * - env платформы (Render) имеет приоритет: поле в UI только для чтения;
 * - значения из UI хранятся в AppSetting ТОЛЬКО в шифрованном виде
 *   (AES-256-GCM, см. ./crypto.ts) — в БД нет открытых секретов;
 * - клиенту отдаются только маски (••••1234) и флаги «настроено/нет»;
 * - секция "secrets" хранит ключи без собственного модуля (фиды, AI,
 *   Telegram) и на старте инжектируется в process.env — до инициализации
 *   AI-gateway и Telegram, которые читают env один раз;
 * - секции "avito"/"max" остаются на своих местах (этапы 9–10): резолвер
 *   читает те же поля, запись идёт через общий API setSecret;
 * - каждое изменение — запись в AuditLog (маски, без значений).
 */

import type { Prisma } from "@prisma/client";
import type {
  SecretGroup,
  SecretItemDTO,
  SecretsStatusDTO,
  SecretSource,
} from "@shared/types";
import { ApiError, badRequest } from "../errors.js";
import { prisma } from "../prisma.js";
import { recentAudit, writeAudit } from "./audit.js";
import { encryptSecret, maskSecret, maybeDecrypt, secretsEncryptionAvailable } from "./crypto.js";

/* ---------- Реестр ---------- */

export type SecretTest = "feeds" | "avito" | "max" | "ai" | "telegram";

export interface SecretDef {
  /** Имя переменной окружения (оно же — идентификатор в API). */
  key: string;
  label: string;
  group: SecretGroup;
  /** Секция AppSetting: "secrets" — общая, "avito"/"max" — профильные (этапы 9–10). */
  store: "secrets" | "avito" | "max";
  /** Поле в секции (для avito/max); по умолчанию — имя переменной. */
  field?: string;
  /** Какая проверка подключения применима (null — проверять нечего). */
  test?: SecretTest;
  /** Вступает в силу только после перезапуска API. */
  restart?: boolean;
  validate: (value: string) => string | null;
}

const nonEmpty = (min: number): ((v: string) => string | null) => {
  return (v) => (v.length >= min ? null : `минимум ${min} символов`);
};

export const SECRET_DEFS: readonly SecretDef[] = [
  {
    key: "FEED_TOKEN",
    label: "Токен фидов",
    group: "feeds",
    store: "secrets",
    test: "feeds",
    validate: nonEmpty(16),
  },
  {
    key: "AVITO_CLIENT_ID",
    label: "client_id Авито",
    group: "avito",
    store: "avito",
    field: "clientId",
    test: "avito",
    validate: nonEmpty(4),
  },
  {
    key: "AVITO_CLIENT_SECRET",
    label: "client_secret Авито",
    group: "avito",
    store: "avito",
    field: "clientSecret",
    test: "avito",
    validate: nonEmpty(8),
  },
  {
    key: "AVITO_USER_ID",
    label: "ID профиля Авито",
    group: "avito",
    store: "avito",
    field: "userId",
    test: "avito",
    validate: (v) => (/^\d{1,20}$/.test(v) ? null : "число (ID профиля Авито)"),
  },
  {
    key: "AVITO_CONTACT_PHONE",
    label: "Телефон для объявлений",
    group: "avito",
    store: "avito",
    field: "phone",
    test: "avito",
    validate: (v) => (/^\+?\d[\d()\s-]{6,19}$/.test(v) ? null : "телефон в формате +7 …"),
  },
  {
    key: "MAX_BOT_TOKEN",
    label: "Токен MAX-бота",
    group: "max",
    store: "max",
    field: "token",
    test: "max",
    validate: nonEmpty(10),
  },
  {
    key: "OPENROUTER_API_KEY",
    label: "Ключ OpenRouter (AI)",
    group: "ai",
    store: "secrets",
    test: "ai",
    restart: true,
    validate: nonEmpty(20),
  },
  {
    key: "TELEGRAM_BOT_TOKEN",
    label: "Токен Telegram-бота",
    group: "telegram",
    store: "secrets",
    test: "telegram",
    restart: true,
    validate: (v) => (/^\d+:[A-Za-z0-9_-]{20,}$/.test(v) ? null : "формат 1234567890:AA…"),
  },
  {
    key: "TELEGRAM_USER_ID",
    label: "Ваш Telegram ID",
    group: "telegram",
    store: "secrets",
    validate: (v) => (/^\d{4,20}$/.test(v) ? null : "число (ваш Telegram ID)"),
  },
];

export function findSecretDef(key: string): SecretDef | undefined {
  return SECRET_DEFS.find((def) => def.key === key);
}

function storageField(def: SecretDef): string {
  return def.field ?? def.key;
}

/* ---------- Хранилище секций AppSetting (подмена для тестов) ---------- */

export interface SecretsSectionStore {
  readSection(key: string): Promise<Record<string, unknown> | null>;
  writeSection(key: string, value: Record<string, unknown>): Promise<void>;
}

const prismaSectionStore: SecretsSectionStore = {
  async readSection(key) {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    const value = row?.value as Record<string, unknown> | null | undefined;
    return value && typeof value === "object" ? value : null;
  },
  async writeSection(key, value) {
    const asJson = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: asJson },
      update: { value: asJson },
    });
  },
};

let sectionStore: SecretsSectionStore = prismaSectionStore;

export function setSecretsStore(override: SecretsSectionStore | null): void {
  sectionStore = override ?? prismaSectionStore;
}

/* ---------- env: платформа ⋁ инжект из БД ---------- */

function envValue(name: string): string | null {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/** Ключи, чьи значения мы сами положили в env из AppSetting. */
const injectedKeys = new Set<string>();

/** Только для тестов: сбросить пометки инжектированных ключей. */
export function __resetSecretsStateForTests(): void {
  injectedKeys.clear();
}

/** Значение из env ПЛАТФОРМЫ (не наш инжект): только оно блокирует правку в UI. */
function platformEnvValue(name: string): string | null {
  const raw = envValue(name);
  if (raw === null) return null;
  return injectedKeys.has(name) ? null : raw;
}

/* ---------- Чтение ---------- */

async function readStoredValue(def: SecretDef): Promise<string | null> {
  let section: Record<string, unknown> | null;
  try {
    section = await sectionStore.readSection(def.store);
  } catch {
    return null;
  }
  if (!section) return null;
  const raw = section[storageField(def)];
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  return maybeDecrypt(raw);
}

/** Действующее значение переменной: env платформы ⋁ сохранённое (AppSetting). */
export async function getSecretValue(key: string): Promise<string | null> {
  const def = findSecretDef(key);
  if (!def) return null;
  return platformEnvValue(key) ?? (await readStoredValue(def));
}

/** Все значения сразу (одним чтением секций) — для проверок подключения. */
export async function getSecretValues(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    result[key] = await getSecretValue(key);
  }
  return result;
}

/* ---------- Старт сервера: секция "secrets" → env ---------- */

/**
 * Ключи секции "secrets" кладём в process.env до инициализации модулей,
 * которые читают env один раз при импорте (AI-gateway, Telegram).
 * Платформенный env не трогаем — он приоритетнее. Ошибка БД не роняет API.
 */
export async function injectStoredSecretsIntoEnv(): Promise<void> {
  for (const def of SECRET_DEFS) {
    if (def.store !== "secrets") continue;
    if (platformEnvValue(def.key)) continue;
    const stored = await readStoredValue(def);
    if (stored !== null) {
      process.env[def.key] = stored;
      injectedKeys.add(def.key);
    }
  }
}

/* ---------- Запись ---------- */

/**
 * Сохранить (value = null/"" → удалить) секрет. В БД — только шифротекст;
 * для секции "secrets" значение сразу подхватывается ленивыми читателями
 * (фиды). Каждое изменение — запись в аудит (маски).
 */
export async function setSecret(key: string, value: string | null): Promise<SecretItemDTO> {
  const def = findSecretDef(key);
  if (!def) {
    throw badRequest(`Неизвестная переменная: ${key}`);
  }
  if (platformEnvValue(key)) {
    throw badRequest(`${key} задан переменной окружения — правка в UI недоступна (env имеет приоритет)`);
  }
  if (!secretsEncryptionAvailable()) {
    throw new ApiError(
      503,
      "SECRETS_ENCRYPTION_KEY_MISSING",
      "Шифрование не настроено: задайте SECRETS_ENCRYPTION_KEY в env (64 hex-символа, openssl rand -hex 32) и перезапустите API",
    );
  }

  const previous = await readStoredValue(def);

  if (value === null || value.trim() === "") {
    const section = (await sectionStore.readSection(def.store)) ?? {};
    delete section[storageField(def)];
    await sectionStore.writeSection(def.store, section);
    if (injectedKeys.has(key)) {
      delete process.env[key];
      injectedKeys.delete(key);
    }
    await writeAudit(
      "secret.clear",
      key,
      previous !== null ? `убрано (было ${maskSecret(previous)})` : "убрано (значения не было)",
    );
  } else {
    const trimmed = value.trim();
    const problem = def.validate(trimmed);
    if (problem !== null) {
      throw badRequest(`${def.label}: ${problem}`);
    }
    const section = (await sectionStore.readSection(def.store)) ?? {};
    section[storageField(def)] = encryptSecret(trimmed);
    await sectionStore.writeSection(def.store, section);
    if (def.store === "secrets") {
      process.env[key] = trimmed;
      injectedKeys.add(key);
    }
    await writeAudit(
      "secret.set",
      key,
      `${previous !== null ? `${maskSecret(previous)} → ` : ""}${maskSecret(trimmed)}`,
    );
  }

  return statusItem(def);
}

/* ---------- Статус для UI ---------- */

export async function statusItem(def: SecretDef): Promise<SecretItemDTO> {
  const source: SecretSource = (() => {
    if (platformEnvValue(def.key)) return "env";
    return "none";
  })();
  if (source === "env") {
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      configured: true,
      source: "env",
      mask: maskSecret(platformEnvValue(def.key) as string),
      test: def.test ?? null,
      restart: def.restart === true,
    };
  }
  const stored = await readStoredValue(def);
  if (stored !== null) {
    return {
      key: def.key,
      label: def.label,
      group: def.group,
      configured: true,
      source: "app",
      mask: maskSecret(stored),
      test: def.test ?? null,
      restart: def.restart === true,
    };
  }
  return {
    key: def.key,
    label: def.label,
    group: def.group,
    configured: false,
    source: "none",
    mask: null,
    test: def.test ?? null,
    restart: def.restart === true,
  };
}

/** Полный статус для экрана «Переменные»: элементы + шифрование + история. */
export async function secretsStatus(): Promise<SecretsStatusDTO> {
  const encryptionEnabled = secretsEncryptionAvailable();
  const items = await Promise.all(SECRET_DEFS.map((def) => statusItem(def)));
  return {
    ok: true,
    encryptionEnabled,
    warning: encryptionEnabled
      ? null
      : "Управление секретами недоступно: задайте SECRETS_ENCRYPTION_KEY в env (openssl rand -hex 32) и перезапустите API. Пока работают переменные окружения.",
    items,
    recentChanges: await recentAudit(15),
  };
}
