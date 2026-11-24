/**
 * ЭТАП 9 — интеграционные тесты /api/avito/* (buildApp + inject):
 * - без ключей: status.configured=false, dry-run → 503 AVITO_NOT_CONFIGURED
 *   (приложение работает как раньше — полуавто, без падения);
 * - с ключами (env) + локальный мок Авито API + фикстурный сервис фидов:
 *   dry-run → 200 с XML и валидацией, publish → upload по ссылке;
 * - PUT настроек с неверным телефоном → 400 (валидация до БД).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import Fastify from "fastify";
import { hash } from "@node-rs/argon2";

const TEST_PASSWORD = "avito-password-123";
const TEST_HASH = await hash(TEST_PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 });
const TEST_WEBHOOK_SECRET = "w" + "h".repeat(31);

const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  "OWNER_LOGIN",
  "OWNER_PASSWORD_HASH",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "NODE_ENV",
  "TRUSTED_ORIGINS",
  "AVITO_CLIENT_ID",
  "AVITO_CLIENT_SECRET",
  "AVITO_USER_ID",
  "AVITO_CONTACT_PHONE",
  "AVITO_API_BASE",
  "AVITO_CATEGORY_SEED",
  "AVITO_CATEGORY_NUT",
  "FEED_TOKEN",
  "FEED_SHOP_URL",
  "PUBLIC_API_URL",
]) {
  savedEnv[key] = process.env[key];
}

/* Локальный мок Авито API. */
const uploads: string[] = [];
const mock = Fastify();
/* form-urlencoded — как настоящий /token Авито. */
mock.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  (_req, body, done) => done(null, String(body)),
);
mock.post("/token", async () => ({
  access_token: "mock-token",
  expires_in: 86400,
  token_type: "Bearer",
}));
mock.post("/autoload/v2/validate", async () => ({ valid: true }));
mock.post("/autoload/v1/upload", async (req) => {
  const body = (req.body ?? {}) as { url?: string };
  uploads.push(body.url ?? "");
  return { id: "mock-upload-1", status: "in_progress" };
});
mock.get("/autoload/v4/uploads/current", async () => ({ status: "in_progress" }));

async function startApp(env: Record<string, string | undefined>) {
  process.env.OWNER_LOGIN = "owner";
  process.env.OWNER_PASSWORD_HASH = TEST_HASH;
  process.env.NODE_ENV = "test";
  process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { buildApp } = await import("../../../app.js");
  const { MemorySessionStore } = await import("../../../auth/sessions.js");
  const { MemoryLoginRateLimiter } = await import("../../../auth/rate-limit.js");
  const { setAvitoSettingsLoader } = await import("../runtime.js");
  const { setFeedServiceFactory } = await import("../../../feeds/runtime.js");
  const { createFeedService } = await import("../../../feeds/service.js");
  const { ALFALFA_ROW, FIXED_NOW, OWNER, SHOP_URL, WALNUT_ROW } = await import(
    "../../../feeds/__tests__/fixtures.js",
  );

  /* Настройки — только env (Prisma не трогаем), сервис — фикстуры. */
  setAvitoSettingsLoader(async () => null);
  setFeedServiceFactory(() =>
    createFeedService(
      {
        loadRows: async () => [ALFALFA_ROW, WALNUT_ROW],
        loadOwner: async () => OWNER,
        loadAvitoOptions: async () => ({
          contactPhone: "+7 900 000-00-00",
          categories: { seed: "Товары для дома и дачи", nut: "Продукты питания" },
        }),
      },
      () => FIXED_NOW,
    ),
  );

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

beforeAll(async () => {
  await mock.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await mock.close();
  const { setAvitoSettingsLoader } = await import("../runtime.js");
  const { setFeedServiceFactory } = await import("../../../feeds/runtime.js");
  setAvitoSettingsLoader(null);
  setFeedServiceFactory(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Авито API: маршруты без ключей (полуавто не ломается)", () => {
  test("status: не настроено; dry-run/check → 503 с честной причиной", async () => {
    const app = await startApp({});
    try {
      const cookie = await loginOk(app);
      const status = await app.inject({
        method: "GET",
        url: "/api/avito/status",
        headers: { cookie },
      });
      expect(status.statusCode).toBe(200);
      const body = status.json();
      expect(body.configured).toBe(false);
      expect(body.configuredFrom).toBe("none");
      expect(body.feedUrl).toBe(null);

      const dry = await app.inject({
        method: "POST",
        url: "/api/avito/dry-run",
        headers: { cookie },
        payload: {},
      });
      expect(dry.statusCode).toBe(503);
      expect(dry.json().error.code).toBe("AVITO_NOT_CONFIGURED");

      const check = await app.inject({
        method: "POST",
        url: "/api/avito/check",
        headers: { cookie },
        payload: {},
      });
      expect(check.statusCode).toBe(503);
      expect(check.json().error.message).toContain("Настройки → Авито API");
    } finally {
      await app.close();
    }
  });
});

describe("Авито API: маршруты с ключами (env) и мок-площадкой", () => {
  test("status → настроено из env; dry-run → XML; publish → upload", async () => {
    const address = mock.server.address();
    const apiBase = `http://127.0.0.1:${(address as { port: number }).port}`;
    const app = await startApp({
      AVITO_CLIENT_ID: "mock-client",
      AVITO_CLIENT_SECRET: "mock-secret",
      AVITO_USER_ID: "42",
      AVITO_CONTACT_PHONE: "+7 900 000-00-00",
      AVITO_API_BASE: apiBase,
      FEED_TOKEN: "feed-token-0123456789abcdef",
      PUBLIC_API_URL: "https://agropost-api.onrender.com",
    });
    try {
      const cookie = await loginOk(app);

      /* Статус: настроено, источник — env, адрес фида с токеном. */
      const status = await app.inject({
        method: "GET",
        url: "/api/avito/status",
        headers: { cookie },
      });
      expect(status.statusCode).toBe(200);
      const statusBody = status.json();
      expect(statusBody.configured).toBe(true);
      expect(statusBody.configuredFrom).toBe("env");
      expect(statusBody.userId).toBe("42");
      expect(statusBody.feedUrl).toContain("/api/feeds/avito?token=");

      /* Dry-run: XML + валидация (локальная + мок-валидатор). */
      const dry = await app.inject({
        method: "POST",
        url: "/api/avito/dry-run",
        headers: { cookie },
        payload: {},
      });
      expect(dry.statusCode).toBe(200);
      const dryBody = dry.json();
      expect(dryBody.offers).toBe(2);
      expect(dryBody.valid).toBe(true);
      expect(dryBody.remote).toBe("passed");
      expect(dryBody.xml).toContain("<Ads formatVersion=\"3\" target=\"Avito.ru\">");

      /* Публикация: upload по ссылке с токеном. */
      const before = uploads.length;
      const publish = await app.inject({
        method: "POST",
        url: "/api/avito/publish",
        headers: { cookie },
        payload: {},
      });
      expect(publish.statusCode).toBe(200);
      const publishBody = publish.json();
      expect(publishBody.uploaded).toBe(true);
      expect(publishBody.offers).toBe(2);
      expect(publishBody.uploadStatus).toBe("in_progress");
      expect(uploads.length).toBe(before + 1);
      expect(uploads[uploads.length - 1]).toBe(
        "https://agropost-api.onrender.com/api/feeds/avito?token=feed-token-0123456789abcdef",
      );

      /* Настройки: env-ключи недоступны для правки, секрет маскирован. */
      const settings = await app.inject({
        method: "GET",
        url: "/api/avito/settings",
        headers: { cookie },
      });
      expect(settings.statusCode).toBe(200);
      const settingsBody = settings.json();
      expect(settingsBody.fromEnv).toBe(true);
      expect(settingsBody.clientId).toBe("mock-client");
      expect(settingsBody.clientSecretSet).toBe(true);
      expect(JSON.stringify(settingsBody)).not.toContain("mock-secret");
    } finally {
      await app.close();
    }
  });

  test("PUT настроек с кривым телефоном → 400 (валидация до БД)", async () => {
    const app = await startApp({});
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "PUT",
        url: "/api/avito/settings",
        headers: { cookie },
        payload: { contactPhone: "не-телефон" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain("Телефон");
    } finally {
      await app.close();
    }
  });
});
