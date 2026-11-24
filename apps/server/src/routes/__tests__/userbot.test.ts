/**
 * ЭТАП 10 — интеграционные тесты /api/userbot/* (buildApp + inject):
 * - без env-кредов: configured=false (приложение работает как раньше);
 * - с env-кредами + подмена хранилища: статус сервиса, список чатов,
 *   «Добавить чат» (нормализация @username / t.me-ссылки), удаление;
 * - нормализация адресов: t.me/selhoz032 → @selhoz032.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { hash } from "@node-rs/argon2";

const TEST_PASSWORD = "userbot-password-123";
const TEST_HASH = await hash(TEST_PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 });

const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  "OWNER_LOGIN",
  "OWNER_PASSWORD_HASH",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "NODE_ENV",
  "TRUSTED_ORIGINS",
  "TELEGRAM_SESSION",
  "TELEGRAM_API_ID",
  "TELEGRAM_API_HASH",
  "CHATS_TO_READ",
]) {
  savedEnv[key] = process.env[key];
}

async function startApp(env: Record<string, string | undefined>, store: {
  status: Record<string, unknown> | null;
  dbChats: string[];
}) {
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
  const { setUserbotStore } = await import("../userbot.js");

  const saved: string[] = [...store.dbChats];
  setUserbotStore({
    getStatus: async () => store.status,
    getChats: async () => saved,
    saveChats: async (chats: string[]) => {
      saved.length = 0;
      saved.push(...chats);
    },
  });

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
  const { setUserbotStore } = await import("../userbot.js");
  setUserbotStore(null);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Userbot: маршруты", () => {
  test("без env-кредов: configured=false, честный статус", async () => {
    const app = await startApp({}, { status: null, dbChats: [] });
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/userbot/status",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.configured).toBe(false);
      expect(body.configuredFrom).toBe("none");
      expect(body.service).toBe(null);
      expect(body.chats).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test("с env-кредами: статус сервиса, env-чаты + добавленные", async () => {
    const app = await startApp(
      {
        TELEGRAM_SESSION: "session-string",
        TELEGRAM_API_ID: "29618367",
        TELEGRAM_API_HASH: "hash",
        CHATS_TO_READ: "selhoz032",
      },
      {
        status: { connected: true, chats: 2, lastMessageAt: "2026-11-25T10:00:00Z", leadsToday: 3, version: "0.1.0" },
        dbChats: ["rus_fermer"],
      },
    );
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/userbot/status",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.configured).toBe(true);
      expect(body.configuredFrom).toBe("env");
      expect(body.service.connected).toBe(true);
      expect(body.service.leadsToday).toBe(3);
      expect(body.chats).toContain("selhoz032");
      expect(body.chats).toContain("rus_fermer");
    } finally {
      await app.close();
    }
  });

  test("«Добавить чат»: t.me-ссылка → @username, без дублей; удаление", async () => {
    const app = await startApp(
      { TELEGRAM_SESSION: "s", TELEGRAM_API_ID: "1", TELEGRAM_API_HASH: "h" },
      { status: null, dbChats: [] },
    );
    try {
      const cookie = await loginOk(app);

      const add = await app.inject({
        method: "POST",
        url: "/api/userbot/chats",
        headers: { cookie },
        payload: { chat: "https://t.me/selhoz032" },
      });
      expect(add.statusCode).toBe(200);
      const addBody = add.json();
      expect(addBody.chat).toBe("@selhoz032");
      expect(addBody.chats).toContain("@selhoz032");

      /* Дубль не размножает список. */
      const addAgain = await app.inject({
        method: "POST",
        url: "/api/userbot/chats",
        headers: { cookie },
        payload: { chat: "@selhoz032" },
      });
      expect(addAgain.json().chats.filter((c: string) => c === "@selhoz032")).toHaveLength(1);

      const remove = await app.inject({
        method: "DELETE",
        url: "/api/userbot/chats",
        headers: { cookie },
        payload: { chat: "selhoz032" },
      });
      expect(remove.statusCode).toBe(200);
      expect(remove.json().chats).not.toContain("@selhoz032");
    } finally {
      await app.close();
    }
  });

  test("«Добавить чат» с мусором → 400", async () => {
    const app = await startApp(
      { TELEGRAM_SESSION: "s", TELEGRAM_API_ID: "1", TELEGRAM_API_HASH: "h" },
      { status: null, dbChats: [] },
    );
    try {
      const cookie = await loginOk(app);
      const res = await app.inject({
        method: "POST",
        url: "/api/userbot/chats",
        headers: { cookie },
        payload: { chat: "" },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe("Userbot: нормализация адресов", () => {
  test("числа, ссылки и @username", async () => {
    const { normalizeChatAddress } = await import("../userbot.js");
    expect(normalizeChatAddress("https://t.me/selhoz032")).toBe("@selhoz032");
    expect(normalizeChatAddress("https://t.me/s/selhoz032")).toBe("@selhoz032");
    expect(normalizeChatAddress("@rus_fermer")).toBe("@rus_fermer");
    expect(normalizeChatAddress("rus_fermer")).toBe("@rus_fermer");
    expect(normalizeChatAddress("-100123456789")).toBe("-100123456789");
  });
});
