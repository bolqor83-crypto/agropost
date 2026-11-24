/**
 * ЭТАП 9 — интеграционный тест флоу публикации на Авито:
 * dry-run (XML + валидация) → подтверждение → upload по ссылке → успех.
 * Avito API — локальный Fastify-mock (/token, /autoload/v2/validate,
 * /autoload/v1/upload, /autoload/v4/uploads/current): реальный HTTP
 * через createAvitoClient, без внешней сети.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import Fastify from "fastify";

import { createFeedService } from "../../../feeds/service.js";
import { ALFALFA_ROW, FIXED_NOW, OWNER, SHOP_URL, WALNUT_ROW } from "../../../feeds/__tests__/fixtures.js";
import { createAvitoClient } from "../client.js";
import { avitoDryRun, avitoPublish } from "../autoload.js";
import type { AvitoRuntimeConfig } from "../config.js";

/* Локальный мок Авито API. */
const received: { path: string; body: string | null; auth: string | null }[] = [];
const mock = Fastify();
/* form-urlencoded — как настоящий /token Авито. */
mock.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  (_req, body, done) => done(null, String(body)),
);

mock.post("/token", async (req) => {
  const body = new URLSearchParams(String(req.body ?? ""));
  expect(body.get("client_id")).toBe("mock-client");
  expect(body.get("client_secret")).toBe("mock-secret");
  return { access_token: "mock-token", expires_in: 86400, token_type: "Bearer" };
});

mock.post("/autoload/v2/validate", async (req) => {
  received.push({ path: "/autoload/v2/validate", body: JSON.stringify(req.body ?? {}), auth: req.headers.authorization ?? null });
  const payload = (req.body ?? {}) as { xml?: string };
  /* Валидатору отдаём ровно тот XML, что пойдёт площадке. */
  if ((payload.xml ?? "").includes('<Ads formatVersion="3" target="Avito.ru">')) {
    return { valid: true };
  }
  return { valid: false, errors: ["некорректный Ads"] };
});

mock.post("/autoload/v1/upload", async (req) => {
  received.push({ path: "/autoload/v1/upload", body: JSON.stringify(req.body ?? {}), auth: req.headers.authorization ?? null });
  return { id: "mock-upload-1", status: "in_progress" };
});

mock.get("/autoload/v4/uploads/current", async () => {
  received.push({ path: "/autoload/v4/uploads/current", body: null, auth: null });
  return { status: "in_progress" };
});

beforeAll(async () => {
  await mock.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await mock.close();
});

describe("Авито-флоу: dry-run → подтверждение → успех (mock API)", () => {
  test("полный флоу без внешней сети", async () => {
    const address = mock.server.address();
    const apiBase = `http://127.0.0.1:${(address as { port: number }).port}`;

    const config: AvitoRuntimeConfig = {
      clientId: "mock-client",
      clientSecret: "mock-secret",
      userId: "42",
      contactPhone: "+7 900 000-00-00",
      apiBase,
      categories: { seed: "Товары для дома и дачи", nut: "Продукты питания" },
      fromEnv: true,
    };

    const service = createFeedService(
      {
        loadRows: async () => [ALFALFA_ROW, WALNUT_ROW],
        loadOwner: async () => OWNER,
        loadAvitoOptions: async () => ({
          contactPhone: config.contactPhone,
          categories: config.categories,
        }),
      },
      () => FIXED_NOW,
    );

    const client = createAvitoClient({ config });
    const deps = { service, client, contactPhone: config.contactPhone, feedUrl: "https://agropost-api.onrender.com/api/feeds/avito?token=t9" };

    /* 1) Dry-run: XML, число офферов, локальная + удалённая валидация. */
    const dry = await avitoDryRun(deps);
    expect(dry.ok).toBe(true);
    expect(dry.offers).toBe(2);
    expect(dry.valid).toBe(true);
    expect(dry.remote).toBe("passed");
    expect(dry.xml).toContain("<Ads formatVersion=\"3\" target=\"Avito.ru\">");
    expect(dry.xml).toContain("<Id>pos-1</Id>");
    expect(dry.xml).toContain("<ContactPhone>+7 900 000-00-00</ContactPhone>");
    expect(dry.warnings).toEqual([]);

    /* Превью и реальный фид — один и тот же снапшот (кэш 1 ч). */
    const snapshotAgain = await service.snapshot();
    expect(snapshotAgain.avito).toBe(dry.xml);

    /* 2) Подтверждение → upload по ссылке → успех. */
    const published = await avitoPublish(deps);
    expect(published.ok).toBe(true);
    expect(published.uploaded).toBe(true);
    expect(published.offers).toBe(2);
    expect(published.feedUrl).toBe("https://agropost-api.onrender.com/api/feeds/avito?token=t9");
    expect(published.uploadStatus).toBe("in_progress");
    expect(published.publishedAt).toBeTruthy();

    /* 3) Мок получил: validate + upload с Bearer-токеном. */
    const upload = received.find((r) => r.path === "/autoload/v1/upload");
    expect(upload).toBeTruthy();
    expect(JSON.parse(upload?.body ?? "{}")).toEqual({
      url: "https://agropost-api.onrender.com/api/feeds/avito?token=t9",
    });
    expect(upload?.auth).toBe("Bearer mock-token");
  });

  test("невалидный XML не отправляется: ошибка до upload", async () => {
    const address = mock.server.address();
    const apiBase = `http://127.0.0.1:${(address as { port: number }).port}`;

    const config: AvitoRuntimeConfig = {
      clientId: "mock-client",
      clientSecret: "mock-secret",
      userId: null,
      contactPhone: null,
      apiBase,
      categories: { seed: "Товары для дома и дачи", nut: "Продукты питания" },
      fromEnv: true,
    };

    /* Сервис отдаёт битый снапшот: 1 оффер заявлен, Ad-элементов нет. */
    const base = createFeedService(
      {
        loadRows: async () => [ALFALFA_ROW],
        loadOwner: async () => null,
        loadAvitoOptions: async () => ({ contactPhone: null, categories: config.categories }),
      },
      () => FIXED_NOW,
    );
    const brokenService = {
      ...base,
      snapshot: async () => ({
        yml: "<yml_catalog/>",
        avito: '<?xml version="1.0" encoding="UTF-8"?>\n<Ads formatVersion="3" target="Avito.ru">\n</Ads>\n',
        offers: 1,
        generatedAt: FIXED_NOW.toISOString(),
      }),
    };

    const client = createAvitoClient({ config });
    const deps = { service: brokenService, client, contactPhone: null, feedUrl: "https://feed" };

    /* Dry-run честно показывает: XML не валиден. */
    const dry = await avitoDryRun(deps);
    expect(dry.valid).toBe(false);
    expect(dry.warnings.join(" ")).toContain("Ad-элементов 0, ожидалось 1");

    const before = received.length;
    await expect(avitoPublish(deps)).rejects.toThrow("локальную проверку");
    /* Upload не вызывался — до площадки не дошло. */
    expect(received.slice(before).some((r) => r.path === "/autoload/v1/upload")).toBe(false);
  });
});
