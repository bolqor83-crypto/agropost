/**
 * ЭТАП 9 — интеграционные тесты маршрутов фидов (buildApp + inject).
 *
 * Токен FEED_TOKEN: без токена / неверный / не задан → 403 (структуру
 * фида не раскрываем); верный → 200 + XML. Сервис фидов подменён
 * фабрикой (фикстуры вместо Prisma). /api/feeds/info — за сессией
 * владельца: без — 401, с — адреса с токеном и счёт офферов.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { hash } from "@node-rs/argon2";

const TEST_PASSWORD = "feed-password-123";
const TEST_HASH = await hash(TEST_PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 });
const TEST_WEBHOOK_SECRET = "w" + "h".repeat(31);
const FEED_TOKEN = "feed-token-0123456789abcdef";

const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  "OWNER_LOGIN",
  "OWNER_PASSWORD_HASH",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "NODE_ENV",
  "TRUSTED_ORIGINS",
  "FEED_TOKEN",
  "FEED_SHOP_URL",
  "PUBLIC_API_URL",
  "FEED_CACHE_TTL_MS",
]) {
  savedEnv[key] = process.env[key];
}
process.env.OWNER_LOGIN = "owner";
process.env.OWNER_PASSWORD_HASH = TEST_HASH;
process.env.NODE_ENV = "test";
process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
process.env.TELEGRAM_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.FEED_TOKEN = FEED_TOKEN;
process.env.FEED_SHOP_URL = "https://agropost-web.onrender.com";
process.env.PUBLIC_API_URL = "https://agropost-api.onrender.com";

const { buildApp } = await import("../../app.js");
const { MemorySessionStore } = await import("../../auth/sessions.js");
const { MemoryLoginRateLimiter } = await import("../../auth/rate-limit.js");
const { setFeedServiceFactory } = await import("../runtime.js");
const { createFeedService } = await import("../service.js");
const { ALFALFA_ROW, FIXED_NOW, OWNER, SHOP_URL, WALNUT_ROW } = await import("./fixtures.js");

const fakeService = createFeedService(
  {
    loadRows: async () => [ALFALFA_ROW, WALNUT_ROW],
    loadOwner: async () => OWNER,
    loadAvitoOptions: async () => ({ contactPhone: "+7 900 000-00-00", categories: { seed: "Товары для дома и дачи", nut: "Продукты питания" } }),
  },
  () => FIXED_NOW,
);
setFeedServiceFactory(() => fakeService);

const store = new MemorySessionStore();
const limiter = new MemoryLoginRateLimiter(10, 15 * 60_000);
const app = await buildApp({ sessionStore: store, loginLimiter: limiter });

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  setFeedServiceFactory(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await app.close();
});

async function loginOk(): Promise<string> {
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

describe("фиды: токен и доступ (этап 9)", () => {
  test("YML без токена → 403", async () => {
    const res = await app.inject({ method: "GET", url: "/api/feeds/yml" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FEED_FORBIDDEN");
  });

  test("YML с неверным токеном → 403", async () => {
    const res = await app.inject({ method: "GET", url: "/api/feeds/yml?token=wrong-token" });
    expect(res.statusCode).toBe(403);
  });

  test("YML с верным токеном → 200 + XML (golden: 2 оффера)", async () => {
    const res = await app.inject({ method: "GET", url: `/api/feeds/yml?token=${FEED_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.headers["cache-control"]).toContain("max-age=3600");
    expect(res.body).toContain("<yml_catalog");
    expect(res.body).toContain('<offer id="pos-1" available="true">');
    expect(res.body).toContain('<offer id="pos-2" available="true">');
    expect(res.body).toContain("Люцерна «Вега 87» РС1, всхожесть 92%");
    expect(res.body).toContain("Грецкий орех");
  });

  test("Авито-фид с верным токеном → 200 + Ads v3", async () => {
    const res = await app.inject({ method: "GET", url: `/api/feeds/avito?token=${FEED_TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.body).toContain('<Ads formatVersion="3" target="Avito.ru">');
    expect(res.body).toContain("<ContactPhone>+7 900 000-00-00</ContactPhone>");
  });

  test("кэш 1 час: два запроса отдают одинаковый XML (снапшот переиспользуется)", async () => {
    const first = await app.inject({ method: "GET", url: `/api/feeds/yml?token=${FEED_TOKEN}` });
    const second = await app.inject({ method: "GET", url: `/api/feeds/yml?token=${FEED_TOKEN}` });
    expect(second.body).toBe(first.body);
    /* Дата фиксированная — при пересборке менялась бы. */
    expect(first.body).toContain('date="2026-11-25T12:00"');
  });

  test("/api/feeds/info без сессии → 401, с сессией → адреса с токеном", async () => {
    const anon = await app.inject({ method: "GET", url: "/api/feeds/info" });
    expect(anon.statusCode).toBe(401);

    const cookie = await loginOk();
    const res = await app.inject({
      method: "GET",
      url: "/api/feeds/info",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(true);
    expect(body.offers).toBe(2);
    expect(body.yml).toBe(`https://agropost-api.onrender.com/api/feeds/yml?token=${FEED_TOKEN}`);
    expect(body.avito).toBe(`https://agropost-api.onrender.com/api/feeds/avito?token=${FEED_TOKEN}`);
  });
});
