/**
 * ЭТАП 10 — интеграционные тесты /api/max/* (buildApp + inject):
 * - без токена: status.configured=false, publish/check → 503
 *   MAX_NOT_CONFIGURED (приложение работает как раньше — полуавто);
 * - с токеном (env) + подмена deps (фейк БД/API): status с ботом и
 *   каналами, publish → публикация, настройки/проверка подключения;
 * - PUT настроек с коротким токеном → 400 (валидация до БД).
 *
 * MAX-платформа не нужна: клиент работает на фейке (depsFactory).
 */

import { afterAll, describe, expect, test } from "bun:test";
import { hash } from "@node-rs/argon2";

const TEST_PASSWORD = "max-password-123";
const TEST_HASH = await hash(TEST_PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 });

const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  "OWNER_LOGIN",
  "OWNER_PASSWORD_HASH",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "NODE_ENV",
  "TRUSTED_ORIGINS",
  "MAX_BOT_TOKEN",
  "MAX_API_BASE",
  "MAX_USER_ID",
]) {
  savedEnv[key] = process.env[key];
}

import { MemoryMaxDb, FakeMaxApi, maxTestDeps } from "./fixtures.js";
import type { MaxDeps } from "../types.js";

let testDeps: ReturnType<typeof maxTestDeps> | null = null;

async function startApp(env: Record<string, string | undefined>) {
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
  const { setMaxSettingsLoader } = await import("../runtime.js");
  const { setMaxDepsFactory } = await import("../runtime.js");

  /* Настройки — только env (Prisma не трогаем), deps — фейк. */
  setMaxSettingsLoader(async () => null);
  testDeps = maxTestDeps(new MemoryMaxDb(), new FakeMaxApi());
  testDeps.db.channels.push({
    id: "ch-max-rostov",
    name: "Барахолка Ростов (MAX)",
    url: "https://max.ru/channel_baraholka_rostov",
    accountId: null,
  });
  testDeps.db.seedListing({ id: "lst-1", channelId: "ch-max-rostov" });
  testDeps.db.bindings.push({ channelId: "ch-max-rostov", chatId: 100 });
  setMaxDepsFactory(async () => testDeps as unknown as MaxDeps);

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

afterAll(async () => {
  const { setMaxSettingsLoader, setMaxDepsFactory } = await import("../runtime.js");
  setMaxSettingsLoader(null);
  setMaxDepsFactory(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("MAX API: маршруты без токена (полуавто не ломается)", () => {
  test("status: не настроено; publish/check → 503 MAX_NOT_CONFIGURED", async () => {
    const app = await startApp({});
    try {
      const cookie = await loginOk(app);
      const status = await app.inject({
        method: "GET",
        url: "/api/max/status",
        headers: { cookie },
      });
      expect(status.statusCode).toBe(200);
      const body = status.json();
      expect(body.configured).toBe(false);
      expect(body.configuredFrom).toBe("none");
      expect(body.bot).toBe(null);
      expect(body.channels).toEqual([]);

      const publish = await app.inject({
        method: "POST",
        url: "/api/max/publish",
        headers: { cookie },
        payload: { listingId: "lst-1" },
      });
      expect(publish.statusCode).toBe(503);
      expect(publish.json().error.code).toBe("MAX_NOT_CONFIGURED");

      const check = await app.inject({
        method: "POST",
        url: "/api/max/check",
        headers: { cookie },
        payload: {},
      });
      expect(check.statusCode).toBe(503);
      expect(check.json().error.message).toContain("Настройки → MAX");
    } finally {
      await app.close();
    }
  });
});

describe("MAX API: маршруты с токеном (env) и фейк-платформой", () => {
  test("status → бот/каналы/привязка; check → ok; publish → публикация", async () => {
    const app = await startApp({ MAX_BOT_TOKEN: "test-max-token" });
    try {
      const cookie = await loginOk(app);

      const status = await app.inject({
        method: "GET",
        url: "/api/max/status",
        headers: { cookie },
      });
      expect(status.statusCode).toBe(200);
      const statusBody = status.json();
      expect(statusBody.configured).toBe(true);
      expect(statusBody.configuredFrom).toBe("env");
      expect(statusBody.bot.username).toBe("agropost_max_bot");
      expect(statusBody.bot.url).toContain("https://max.ru/agropost_max_bot");
      expect(statusBody.channels).toHaveLength(1);
      expect(statusBody.channels[0].chatId).toBe(100);

      const check = await app.inject({
        method: "POST",
        url: "/api/max/check",
        headers: { cookie },
        payload: {},
      });
      expect(check.statusCode).toBe(200);
      expect(check.json().botOk).toBe(true);

      const publish = await app.inject({
        method: "POST",
        url: "/api/max/publish",
        headers: { cookie },
        payload: { listingId: "lst-1" },
      });
      expect(publish.statusCode).toBe(200);
      const publishBody = publish.json();
      expect(publishBody.chatId).toBe(100);
      expect(publishBody.listingId).toBe("lst-1");
      /* Сообщение реально ушло в «MAX» (фейк запомнил вызов). */
      expect(testDeps?.api.calls.sent).toHaveLength(1);
      expect(testDeps?.api.calls.sent[0].chatId).toBe(100);

      /* Без чата-цели: publish без привязки — 400 (чат известен из привязки,
         поэтому отдельно проверяем валидацию пустого listingId). */
      const bad = await app.inject({
        method: "POST",
        url: "/api/max/publish",
        headers: { cookie },
        payload: {},
      });
      expect(bad.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe("MAX API: настройки (токен)", () => {
  test("PUT с коротким токеном → 400 (валидация до БД)", async () => {
    const app = await startApp({});
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "PUT",
        url: "/api/max/settings",
        headers: { cookie },
        payload: { token: "123" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain("Токен");
    } finally {
      await app.close();
    }
  });

  test("PUT при env-токене → 400 (env имеет приоритет)", async () => {
    const app = await startApp({ MAX_BOT_TOKEN: "test-max-token" });
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "PUT",
        url: "/api/max/settings",
        headers: { cookie },
        payload: { token: "another-token-value" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain("env");
    } finally {
      await app.close();
    }
  });
});
