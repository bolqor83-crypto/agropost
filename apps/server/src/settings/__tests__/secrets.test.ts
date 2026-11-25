/**
 * Тесты реестра секретов: приоритет env ⋁ БД, шифрование при записи,
 * инжект в env для секции "secrets", валидация, аудит (маски),
 * легаси-plaintext этапов 9–10 читается без миграции.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

const savedEnv: Record<string, string | undefined> = {};
for (const key of ["SECRETS_ENCRYPTION_KEY", "FEED_TOKEN", "OPENROUTER_API_KEY", "TELEGRAM_BOT_TOKEN"]) {
  savedEnv[key] = process.env[key];
}

process.env.SECRETS_ENCRYPTION_KEY = "c".repeat(64);

/* Память вместо Prisma: секции AppSetting + журнал аудита. */
const sections = new Map<string, Record<string, unknown>>();
const audit: { actor: string; action: string; field: string; detail: string | null }[] = [];

const memoryStore = {
  async readSection(key: string) {
    return sections.get(key) ?? null;
  },
  async writeSection(key: string, value: Record<string, unknown>) {
    sections.set(key, value);
  },
};

const memoryAudit = {
  async write(record: { actor: string; action: string; field: string; detail: string | null }) {
    audit.push(record);
  },
  async recent(limit: number) {
    return audit
      .slice(-limit)
      .reverse()
      .map((record, index) => ({ id: `audit-${index}`, createdAt: new Date().toISOString(), ...record }));
  },
};

const { setAuditStore } = await import("../audit.js");
const { setSecretsStore, __resetSecretsStateForTests } = await import("../secrets.js");
const secrets = await import("../secrets.js");

setSecretsStore(memoryStore);
setAuditStore(memoryAudit);

beforeEach(() => {
  __resetSecretsStateForTests();
  sections.clear();
  audit.length = 0;
  delete process.env.FEED_TOKEN;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.TELEGRAM_BOT_TOKEN;
});

afterAll(() => {
  setSecretsStore(null);
  setAuditStore(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Реестр секретов: чтение", () => {
  test("платформенный env приоритетнее сохранённого значения", async () => {
    process.env.FEED_TOKEN = "env-feed-token-123456";
    sections.set("secrets", { FEED_TOKEN: "db-feed-token-654321" });
    expect(await secrets.getSecretValue("FEED_TOKEN")).toBe("env-feed-token-123456");
  });

  test("нет env → читаем секцию (легаси-plaintext работает)", async () => {
    sections.set("secrets", { FEED_TOKEN: "legacy-plaintext-feed" });
    expect(await secrets.getSecretValue("FEED_TOKEN")).toBe("legacy-plaintext-feed");
  });

  test("секреты авито/max читаются из своих секций", async () => {
    sections.set("max", { token: "stored-max-token-value" });
    expect(await secrets.getSecretValue("MAX_BOT_TOKEN")).toBe("stored-max-token-value");
    sections.set("avito", { clientSecret: "avito-secret-987654" });
    expect(await secrets.getSecretValue("AVITO_CLIENT_SECRET")).toBe("avito-secret-987654");
  });

  test("неизвестный ключ → null", async () => {
    expect(await secrets.getSecretValue("DEFINITELY_NOT_A_SECRET")).toBeNull();
  });
});

describe("Реестр секретов: запись", () => {
  test("setSecret шифрует значение (в БД только v1:…)", async () => {
    const item = await secrets.setSecret("FEED_TOKEN", "brand-new-feed-token-42");
    expect(item.configured).toBe(true);
    expect(item.source).toBe("app");
    expect(item.mask).toBe("••••n-42");
    const stored = sections.get("secrets")?.["FEED_TOKEN"] as string;
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("brand-new-feed-token-42");
  });

  test("setSecret сразу подхватывается ленивыми читателями (env-инжект)", async () => {
    await secrets.setSecret("FEED_TOKEN", "instant-feed-token-xyz");
    expect(await secrets.getSecretValue("FEED_TOKEN")).toBe("instant-feed-token-xyz");
  });

  test("запись max-токена идёт в секцию max шифрованно", async () => {
    await secrets.setSecret("MAX_BOT_TOKEN", "max-bot-token-abcdef");
    const stored = sections.get("max")?.["token"] as string;
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("max-bot-token-abcdef");
  });

  test("валидация: короткий FEED_TOKEN → ошибка с сообщением", async () => {
    try {
      await secrets.setSecret("FEED_TOKEN", "short");
      expect.unreachable("должна была быть ошибка валидации");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
      expect((err as Error).message).toContain("16");
    }
  });

  test("валидация: формат Telegram-токена", async () => {
    await expect(secrets.setSecret("TELEGRAM_BOT_TOKEN", "not-a-token")).rejects.toThrow();
    const item = await secrets.setSecret("TELEGRAM_BOT_TOKEN", "8944861002:AAGY0aeJZ-NhUOth4vUiOGvZ5R9q0eSAPfQ");
    expect(item.configured).toBe(true);
  });

  test("платформенный env блокирует правку (400)", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-env-managed-key";
    try {
      await expect(secrets.setSecret("OPENROUTER_API_KEY", "sk-or-v1-another-key-123")).rejects.toThrow(
        /env имеет приоритет/,
      );
    } finally {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  test("без SECRETS_ENCRYPTION_KEY → 503 (честное предупреждение)", async () => {
    const key = process.env.SECRETS_ENCRYPTION_KEY;
    delete process.env.SECRETS_ENCRYPTION_KEY;
    try {
      const err = await secrets.setSecret("FEED_TOKEN", "cannot-save-this-token").catch((e) => e);
      expect((err as { statusCode?: number }).statusCode).toBe(503);
      expect((err as Error).message).toContain("SECRETS_ENCRYPTION_KEY");
    } finally {
      process.env.SECRETS_ENCRYPTION_KEY = key;
    }
  });

  test("очистка: value=null убирает поле и подчищает env", async () => {
    await secrets.setSecret("FEED_TOKEN", "temporary-feed-token-1");
    expect(await secrets.getSecretValue("FEED_TOKEN")).toBe("temporary-feed-token-1");
    await secrets.setSecret("FEED_TOKEN", null);
    expect(sections.get("secrets")?.["FEED_TOKEN"]).toBeUndefined();
    expect(await secrets.getSecretValue("FEED_TOKEN")).toBeNull();
  });

  test("аудит: каждое изменение — запись с масками, без значений", async () => {
    await secrets.setSecret("FEED_TOKEN", "audited-feed-token-77");
    await secrets.setSecret("FEED_TOKEN", "replaced-feed-token-88");
    await secrets.setSecret("FEED_TOKEN", null);
    expect(audit).toHaveLength(3);
    const details = audit.map((a) => a.detail ?? "").join(" | ");
    expect(details).toContain("••••");
    expect(details).not.toContain("audited-feed-token-77");
    expect(details).not.toContain("replaced-feed-token-88");
  });
});

describe("Статус для UI", () => {
  test("secretsStatus: маски, флаги env/app/none, шифрование включено", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-from-platform-env";
    sections.set("max", { token: "db-max-token-value" });
    try {
      const status = await secrets.secretsStatus();
      expect(status.ok).toBe(true);
      expect(status.encryptionEnabled).toBe(true);
      expect(status.warning).toBeNull();
      const byKey = Object.fromEntries(status.items.map((i) => [i.key, i]));
      expect(byKey["OPENROUTER_API_KEY"].source).toBe("env");
      expect(byKey["OPENROUTER_API_KEY"].mask).toBe("••••-env");
      expect(byKey["MAX_BOT_TOKEN"].source).toBe("app");
      expect(byKey["MAX_BOT_TOKEN"].configured).toBe(true);
      expect(byKey["FEED_TOKEN"].source).toBe("none");
      expect(byKey["FEED_TOKEN"].configured).toBe(false);
      expect(status.items).toHaveLength(9);
      expect(status.recentChanges).toEqual([]);
    } finally {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  test("статус без ключа шифрования: предупреждение для экрана", async () => {
    const key = process.env.SECRETS_ENCRYPTION_KEY;
    delete process.env.SECRETS_ENCRYPTION_KEY;
    try {
      const status = await secrets.secretsStatus();
      expect(status.encryptionEnabled).toBe(false);
      expect(status.warning).toContain("SECRETS_ENCRYPTION_KEY");
    } finally {
      process.env.SECRETS_ENCRYPTION_KEY = key;
    }
  });
});
