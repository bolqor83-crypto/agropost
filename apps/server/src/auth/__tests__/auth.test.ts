/**
 * Интеграционные тесты авторизации владельца (этап 5.1).
 * Полное приложение через buildApp + MemorySessionStore + inject().
 *
 * Доступ с сессией проверяем на несуществующем /api-пути: guard
 * отрабатывает ДО хендлера (401 без сессии / 404 с ней), БД и сеть
 * не задействованы — тесты детерминированы.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { hash } from "@node-rs/argon2";

/* Переменные окружения выставляем ДО импорта приложения. */
const TEST_PASSWORD = "test-password-123";
const TEST_HASH = await hash(TEST_PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 });
const TEST_WEBHOOK_SECRET = "w" + "h".repeat(31); /* 32 символа */

const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  "OWNER_LOGIN",
  "OWNER_PASSWORD_HASH",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "NODE_ENV",
  "TRUSTED_ORIGINS",
]) {
  savedEnv[key] = process.env[key];
}

process.env.OWNER_LOGIN = "owner";
process.env.OWNER_PASSWORD_HASH = TEST_HASH;
process.env.NODE_ENV = "test";
process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
process.env.TELEGRAM_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

const { buildApp } = await import("../../app.js");
const { MemorySessionStore } = await import("../sessions.js");
const { MemoryLoginRateLimiter } = await import("../rate-limit.js");

const store = new MemorySessionStore();
const limiter = new MemoryLoginRateLimiter(10, 15 * 60_000);
const app = await buildApp({ sessionStore: store, loginLimiter: limiter });

beforeEach(() => {
  limiter.reset("127.0.0.1");
});

afterAll(async () => {
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

describe("авторизация владельца (этап 5.1)", () => {
  test("публичные: health/meta/session доступны без сессии", async () => {
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/meta" })).statusCode).toBe(200);
    const session = await app.inject({ method: "GET", url: "/api/auth/session" });
    expect(session.statusCode).toBe(200);
    expect(session.json().authenticated).toBe(false);
    expect(session.json().configured).toBe(true);
  });

  test("приватный маршрут без сессии → 401 (GET и мутирующие)", async () => {
    for (const [method, url] of [
      ["GET", "/api/positions"],
      ["GET", "/api/user/profile"],
      ["GET", "/api/analytics/summary"],
      ["POST", "/api/positions/pos-1/suggest-channels"],
      ["DELETE", "/api/suppliers/sup-1"],
      ["PATCH", "/api/channels/ch-1"],
      ["POST", "/api/telegram/setup-webhook"],
      ["POST", "/api/telegram/publish"],
      ["POST", "/api/parser/run"],
      ["GET", "/api/parser/status"],
      ["GET", "/api/leads"],
      ["GET", "/api/deals"],
      ["POST", "/api/ai/advice"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    }
  });

  test("открытой регистрации нет: /api/users и /api/auth/register недоступны анонимно", async () => {
    const res = await app.inject({ method: "POST", url: "/api/users", payload: { login: "x" } });
    expect([401, 404]).toContain(res.statusCode);
    const res2 = await app.inject({ method: "POST", url: "/api/auth/register", payload: {} });
    expect([401, 404]).toContain(res2.statusCode);
    /* Аккаунт создать нельзя ни в одном случае. */
    expect(res2.json().error?.code ?? "NOT_FOUND").not.toBe("OK");
  });

  test("вход: верный пароль → cookie HttpOnly/SameSite=Lax, сессия в хранилище (хеш токена)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "owner", password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    expect(cookie).toContain("agropost_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(store.sessions.size).toBeGreaterThan(0);
    /* В хранилище — хеш, а не сам токен. */
    const token = (cookie as string).split(";")[0].split("=")[1];
    const hashes = [...store.sessions.keys()];
    expect(hashes).not.toContain(token);
  });

  test("неверный логин/пароль → одинаковый 401 без подробностей", async () => {
    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "owner", password: "definitely-wrong" },
    });
    const wrongLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "intruder", password: TEST_PASSWORD },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongLogin.statusCode).toBe(401);
    expect(wrongPassword.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(wrongLogin.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.json().error.message).toBe(wrongLogin.json().error.message);
  });

  test("слишком частые попытки входа → 429 TOO_MANY_ATTEMPTS", async () => {
    for (let i = 0; i < 10; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { login: "owner", password: "wrong" },
      });
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "owner", password: "wrong" },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  test("с действительной сессией guard пропускает (приватный /api-путь → 404, не 401)", async () => {
    const cookie = await loginOk();
    const res = await app.inject({
      method: "GET",
      url: "/api/definitely-not-a-route",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
    /* Без сессии тот же путь → 401. */
    const noAuth = await app.inject({ method: "GET", url: "/api/definitely-not-a-route" });
    expect(noAuth.statusCode).toBe(401);
  });

  test("истёкшая сессия → 401", async () => {
    const cookie = await loginOk();
    for (const session of store.sessions.values()) {
      session.expiresAt = new Date(Date.now() - 1000);
    }
    const res = await app.inject({
      method: "GET",
      url: "/api/definitely-not-a-route",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(401);
  });

  test("logout уничтожает серверную сессию", async () => {
    const cookie = await loginOk();
    const token = cookie.split(";")[0].split("=")[1];
    expect(await store.find(token)).not.toBeNull();

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect(logout.statusCode).toBe(200);
    expect(logout.json().authenticated).toBe(false);

    expect(await store.find(token)).toBeNull();
    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/definitely-not-a-route",
      headers: { cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  /* ЭТАП 5.2 (аудит): ДЕФЕКТ, найденный реальным браузером. Клиент
   * посылает Content-Type: application/json на POST без тела; Fastify
   * дефолтно отвечал 400 FST_ERR_CTP_EMPTY_JSON_BODY — logout НЕ
   * уничтожал сессию, cookie продолжал работать. Регресс-тесты ниже
   * держат поведение «пустое JSON-тело = {}» (правило app.ts). */
  test("logout с Content-Type json и ПУСТЫМ телом → 200, сессия уничтожена (этап 5.2)", async () => {
    const cookie = await loginOk();
    const token = cookie.split(";")[0].split("=")[1];
    expect(await store.find(token)).not.toBeNull();

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie, "content-type": "application/json" },
      payload: "",
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json().authenticated).toBe(false);
    expect(await store.find(token)).toBeNull();
    const after = await app.inject({
      method: "GET",
      url: "/api/definitely-not-a-route",
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  test("refresh с Content-Type json и пустым телом → 200 (не 400)", async () => {
    const cookie = await loginOk();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie, "content-type": "application/json" },
      payload: "",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().authenticated).toBe(true);
  });

  test("битое JSON-тело по-прежнему даёт 400 (парсер не «проглатывает» мусор)", async () => {
    const cookie = await loginOk();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie, "content-type": "application/json" },
      payload: "не-json{{",
    });
    expect(res.statusCode).toBe(400);
  });

  test("refresh продлевает сессию и выпускает новую cookie", async () => {
    const cookie = await loginOk();
    const res = await app.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().authenticated).toBe(true);
    expect(res.json().expiresAt).toBeString();
    /* Без сессии refresh → 401. */
    const no = await app.inject({ method: "POST", url: "/api/auth/refresh" });
    expect(no.statusCode).toBe(401);
  });

  test("webhook: неверный/отсутствующий секрет → 401; верный → 200", async () => {
    const noSecret = await app.inject({ method: "POST", url: "/api/telegram/webhook", payload: {} });
    expect(noSecret.statusCode).toBe(401);

    const wrongSecret = await app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "nope" },
      payload: {},
    });
    expect(wrongSecret.statusCode).toBe(401);

    const rightSecret = await app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": TEST_WEBHOOK_SECRET },
      payload: {},
    });
    expect(rightSecret.statusCode).toBe(200);
    expect(rightSecret.json().ok).toBe(true);
  });

  test("setup-webhook: тело с url игнорируется, маршрут закрыт авторизацией", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/telegram/setup-webhook",
      payload: { url: "https://evil.example.com/hook" },
    });
    expect(res.statusCode).toBe(401);

    const cookie = await loginOk();
    const res2 = await app.inject({
      method: "POST",
      url: "/api/telegram/setup-webhook",
      headers: { cookie },
      payload: { url: "https://evil.example.com/hook" },
    });
    /* TELEGRAM_WEBHOOK_URL/RENDER_EXTERNAL_URL не заданы в тесте →
       400 «не задан в серверной конфигурации». Никакого evil-URL. */
    expect(res2.statusCode).toBe(400);
    const message = res2.json()?.error?.message ?? "";
    expect(message.toLowerCase()).not.toContain("evil.example.com");
    expect(res2.json().webhook).toBeUndefined();
  });

  test("POST с посторонним Origin → 403 FORBIDDEN_ORIGIN (CSRF-глубина)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/positions",
      headers: { origin: "https://evil.example.com" },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN_ORIGIN");
  });

  test("вход без настроенного пароля → 503 AUTH_NOT_CONFIGURED, приватное закрыто (fail-closed)", async () => {
    const saved = process.env.OWNER_PASSWORD_HASH;
    delete process.env.OWNER_PASSWORD_HASH;
    const app2 = await buildApp({ sessionStore: new MemorySessionStore() });
    const res = await app2.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "owner", password: "anything" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("AUTH_NOT_CONFIGURED");
    const privateRes = await app2.inject({ method: "GET", url: "/api/positions" });
    expect(privateRes.statusCode).toBe(401);
    if (saved !== undefined) process.env.OWNER_PASSWORD_HASH = saved;
    await app2.close();
  });
});
