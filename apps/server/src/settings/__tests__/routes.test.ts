/**
 * Интеграционные тесты /api/settings/* (buildApp + inject):
 * - guard: без сессии — 401, после входа — 200;
 * - GET /api/settings/secrets: маски вместо значений, флаги env/app/none,
 *   предупреждение при выключенном шифровании;
 * - PUT: валидация, env-приоритет, шифротекст в «БД» (память-подмена),
 *   аудит с масками;
 * - POST :key/test — реальные проверки на моке fetch;
 * - фиды: токен, сохранённый через UI, открывает /api/feeds/yml.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { hash } from "@node-rs/argon2";

const TEST_PASSWORD = "secrets-password-123";
const TEST_HASH = await hash(TEST_PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 });

const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  "OWNER_LOGIN",
  "OWNER_PASSWORD_HASH",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "NODE_ENV",
  "TRUSTED_ORIGINS",
  "SECRETS_ENCRYPTION_KEY",
  "FEED_TOKEN",
  "MAX_BOT_TOKEN",
]) {
  savedEnv[key] = process.env[key];
}

process.env.SECRETS_ENCRYPTION_KEY = "d".repeat(64);

/* Память вместо Prisma. */
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
      .map((record, index) => ({ id: `a-${index}`, createdAt: new Date().toISOString(), ...record }));
  },
};

const { setAuditStore } = await import("../audit.js");
const { setSecretsStore, __resetSecretsStateForTests } = await import("../secrets.js");
setSecretsStore(memoryStore);
setAuditStore(memoryAudit);

const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetSecretsStateForTests();
  sections.clear();
  audit.length = 0;
  delete process.env.FEED_TOKEN;
  delete process.env.MAX_BOT_TOKEN;
});

afterAll(async () => {
  setSecretsStore(null);
  setAuditStore(null);
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function startApp(env: Record<string, string | undefined> = {}) {
  process.env.OWNER_LOGIN = "owner";
  process.env.OWNER_PASSWORD_HASH = TEST_HASH;
  process.env.NODE_ENV = "test";
  process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "w" + "h".repeat(31);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { buildApp } = await import("../../app.js");
  const { MemorySessionStore } = await import("../../auth/sessions.js");
  const { MemoryLoginRateLimiter } = await import("../../auth/rate-limit.js");
  const app = await buildApp({
    sessionStore: new MemorySessionStore(),
    loginLimiter: new MemoryLoginRateLimiter(10, 15 * 60_000),
  });
  await app.ready();
  return app;
}

async function loginOk(app: Awaited<ReturnType<typeof startApp>>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { login: "owner", password: TEST_PASSWORD },
  });
  expect(res.statusCode).toBe(200);
  const setCookie = res.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
  return (cookie as string).split(";")[0];
}

describe("Экран «Переменные»: маршруты", () => {
  test("без сессии — 401 (guard закрывает настройки)", async () => {
    const app = await startApp();
    try {
      const res = await app.inject({ method: "GET", url: "/api/settings/secrets" });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test("GET: 9 переменных, маски, ни одного сырого значения", async () => {
    sections.set("secrets", { FEED_TOKEN: "stored-feed-token-9999" });
    process.env.MAX_BOT_TOKEN = "platform-max-token-value";
    const app = await startApp();
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({ method: "GET", url: "/api/settings/secrets", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.encryptionEnabled).toBe(true);
      expect(body.items).toHaveLength(9);
      const byKey = Object.fromEntries(body.items.map((i: { key: string }) => [i.key, i]));
      expect(byKey.FEED_TOKEN.source).toBe("app");
      expect(byKey.FEED_TOKEN.mask).toBe("••••9999");
      expect(byKey.MAX_BOT_TOKEN.source).toBe("env");
      expect(byKey.TELEGRAM_USER_ID.source).toBe("none");
      /* Сырых значений нет нигде в ответе. */
      const raw = JSON.stringify(body);
      expect(raw).not.toContain("stored-feed-token-9999");
      expect(raw).not.toContain("platform-max-token-value");
    } finally {
      await app.close();
    }
  });

  test("PUT: сохраняет шифротекст + пишет аудит с маской", async () => {
    const app = await startApp();
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/secrets",
        headers: { cookie },
        payload: { key: "FEED_TOKEN", value: "ui-saved-feed-token-777" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().item.configured).toBe(true);
      const stored = sections.get("secrets")?.["FEED_TOKEN"] as string;
      expect(stored.startsWith("v1:")).toBe(true);
      expect(stored).not.toContain("ui-saved-feed-token-777");
      expect(audit).toHaveLength(1);
      expect(audit[0].field).toBe("FEED_TOKEN");
      expect(audit[0].detail).toContain("••••");
    } finally {
      await app.close();
    }
  });

  test("PUT: короткий токен → 400, неизвестный ключ → 400, env → 400", async () => {
    process.env.MAX_BOT_TOKEN = "platform-max-token-value";
    const app = await startApp();
    try {
      const cookie = await loginOk(app);
      const short = await app.inject({
        method: "PUT",
        url: "/api/settings/secrets",
        headers: { cookie },
        payload: { key: "FEED_TOKEN", value: "short" },
      });
      expect(short.statusCode).toBe(400);
      expect(short.json().error.message).toContain("16");

      const unknown = await app.inject({
        method: "PUT",
        url: "/api/settings/secrets",
        headers: { cookie },
        payload: { key: "NOT_A_SECRET", value: "whatever-value-123" },
      });
      expect(unknown.statusCode).toBe(400);

      const envManaged = await app.inject({
        method: "PUT",
        url: "/api/settings/secrets",
        headers: { cookie },
        payload: { key: "MAX_BOT_TOKEN", value: "another-max-token-value" },
      });
      expect(envManaged.statusCode).toBe(400);
      expect(envManaged.json().error.message).toContain("env");
    } finally {
      await app.close();
    }
  });

  test("PUT без SECRETS_ENCRYPTION_KEY → 503 с честным предупреждением", async () => {
    const app = await startApp({ SECRETS_ENCRYPTION_KEY: undefined });
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/secrets",
        headers: { cookie },
        payload: { key: "FEED_TOKEN", value: "no-encryption-token-1" },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("SECRETS_ENCRYPTION_KEY_MISSING");
      const status = await app.inject({ method: "GET", url: "/api/settings/secrets", headers: { cookie } });
      expect(status.json().encryptionEnabled).toBe(false);
      expect(status.json().warning).toContain("SECRETS_ENCRYPTION_KEY");
    } finally {
      process.env.SECRETS_ENCRYPTION_KEY = "d".repeat(64);
      await app.close();
    }
  });

  test("POST :key/test: Telegram getMe на моке fetch (успех и отказ)", async () => {
    sections.set("secrets", { TELEGRAM_BOT_TOKEN: "8944861002:AAGtest_token_value_ok" });
    const app = await startApp();
    try {
      const cookie = await loginOk(app);
      globalThis.fetch = (async (url: string | URL) => {
        const href = String(url);
        if (href.startsWith("https://api.telegram.org/bot")) {
          return new Response(
            JSON.stringify({ ok: true, result: { username: "agropost_test_bot" } }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 200 });
      }) as typeof fetch;
      const ok = await app.inject({
        method: "POST",
        url: "/api/settings/secrets/TELEGRAM_BOT_TOKEN/test",
        headers: { cookie },
        payload: {},
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().pass).toBe(true);
      expect(ok.json().message).toContain("agropost_test_bot");
      /* Сообщение не содержит сам токен. */
      expect(JSON.stringify(ok.json())).not.toContain("AAGtest_token_value_ok");

      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 })) as typeof fetch;
      const fail = await app.inject({
        method: "POST",
        url: "/api/settings/secrets/TELEGRAM_BOT_TOKEN/test",
        headers: { cookie },
        payload: {},
      });
      expect(fail.statusCode).toBe(200);
      expect(fail.json().pass).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
      await app.close();
    }
  });

  test("POST :key/test: неизвестный ключ → 404, без проверки → 400", async () => {
    const app = await startApp();
    try {
      const cookie = await loginOk(app);
      const unknown = await app.inject({
        method: "POST",
        url: "/api/settings/secrets/NOPE/test",
        headers: { cookie },
        payload: {},
      });
      expect(unknown.statusCode).toBe(404);
      const noTest = await app.inject({
        method: "POST",
        url: "/api/settings/secrets/TELEGRAM_USER_ID/test",
        headers: { cookie },
        payload: {},
      });
      expect(noTest.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test("фиды: токен из UI открывает /api/feeds/yml (мок сервиса фидов)", async () => {
    const { setFeedServiceFactory } = await import("../../feeds/runtime.js");
    setFeedServiceFactory(
      () =>
        ({
          snapshot: async () => ({ yml: "<yml/>", avito: "<avito/>", offers: 3 }),
        }) as never,
    );
    const app = await startApp();
    try {
      const cookie = await loginOk(app);
      const save = await app.inject({
        method: "PUT",
        url: "/api/settings/secrets",
        headers: { cookie },
        payload: { key: "FEED_TOKEN", value: "feed-via-settings-42" },
      });
      expect(save.statusCode).toBe(200);

      const feed = await app.inject({
        method: "GET",
        url: `/api/feeds/yml?token=${encodeURIComponent("feed-via-settings-42")}`,
      });
      expect(feed.statusCode).toBe(200);
      expect(feed.body).toContain("<yml/>");

      const wrong = await app.inject({
        method: "GET",
        url: `/api/feeds/yml?token=${encodeURIComponent("wrong-token-value-1234")}`,
      });
      expect(wrong.statusCode).toBe(403);
    } finally {
      const { setFeedServiceFactory } = await import("../../feeds/runtime.js");
      setFeedServiceFactory(null);
      await app.close();
    }
  });
});
