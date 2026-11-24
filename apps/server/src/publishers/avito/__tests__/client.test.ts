/**
 * ЭТАП 9 — тесты HTTP-клиента Авито API: OAuth2 (POST /token),
 * удалённая валидация (/autoload/v2/validate), загрузка по ссылке
 * (/autoload/v1/upload), текущая загрузка (v4). fetch подменён —
 * сеть не трогаем.
 */

import { describe, expect, test } from "bun:test";
import { fetchAvitoToken } from "../auth.js";
import { AvitoApiError } from "../types.js";
import { createAvitoClient } from "../client.js";
import type { AvitoRuntimeConfig } from "../config.js";

const CONFIG = (apiBase: string): AvitoRuntimeConfig => ({
  clientId: "avito-client-id",
  clientSecret: "avito-client-secret",
  userId: "123456",
  contactPhone: "+7 900 000-00-00",
  apiBase,
  categories: { seed: "Товары для дома и дачи", nut: "Продукты питания" },
  fromEnv: true,
});

/** fetch-фактура: маршрутизация по (метод, путь) — как мини-сервер. */
function fakeFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const key = `${method} ${path}`;
    const handler = routes[key];
    if (!handler) return new Response("not found", { status: 404 });
    return handler(init);
  };
  return { impl, calls };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Авито OAuth2: POST /token", () => {
  test("успех: access_token, expires_in; тело — form-urlencoded", async () => {
    const { impl, calls } = fakeFetch({
      "POST /token": (init) => {
        const body = new URLSearchParams(String(init?.body ?? ""));
        expect(body.get("grant_type")).toBe("client_credentials");
        expect(body.get("client_id")).toBe("avito-client-id");
        expect(body.get("client_secret")).toBe("avito-client-secret");
        return jsonResponse(200, { access_token: "tok-1", expires_in: 86400, token_type: "Bearer" });
      },
    });

    const token = await fetchAvitoToken(
      { clientId: "avito-client-id", clientSecret: "avito-client-secret", apiBase: "https://api.avito.ru" },
      impl,
    );
    expect(token.access_token).toBe("tok-1");
    expect(token.expires_in).toBe(86400);
    expect(calls.length).toBe(1);
    const tokenHeaders = calls[0].init?.headers as Record<string, string> | undefined;
    expect(tokenHeaders?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  test("401 от Авито → AvitoApiError с человекочитаемой причиной", async () => {
    const { impl } = fakeFetch({
      "POST /token": () =>
        jsonResponse(401, { error: "invalid_client", error_description: "client_id не найден" }),
    });
    await expect(
      fetchAvitoToken(
        { clientId: "bad", clientSecret: "bad", apiBase: "https://api.avito.ru" },
        impl,
      ),
    ).rejects.toThrow("client_id не найден");
  });

  test("ответ без access_token → ошибка", async () => {
    const { impl } = fakeFetch({ "POST /token": () => jsonResponse(200, {}) });
    await expect(
      fetchAvitoToken(
        { clientId: "x", clientSecret: "y", apiBase: "https://api.avito.ru" },
        impl,
      ),
    ).rejects.toThrow("без access_token");
  });
});

describe("Авито клиент: токен кэшируется, Bearer в запросах", () => {
  test("validate + upload + currentUpload идут с Bearer", async () => {
    const { impl, calls } = fakeFetch({
      "POST /token": () => jsonResponse(200, { access_token: "tok-1", expires_in: 86400, token_type: "Bearer" }),
      "POST /autoload/v2/validate": () => jsonResponse(200, { valid: true }),
      "POST /autoload/v1/upload": () => jsonResponse(200, { id: "upl-7", status: "in_progress" }),
      "GET /autoload/v4/uploads/current": () => jsonResponse(200, { status: "completed" }),
    });

    const client = createAvitoClient({ config: CONFIG("https://api.avito.ru"), fetchImpl: impl });
    const validate = await client.validate("<Ads/>");
    expect(validate.remote).toBe("passed");

    const upload = await client.upload("https://agropost/api/feeds/avito?token=t");
    expect(upload).toEqual({ ok: true, status: "in_progress" });

    const current = await client.currentUpload();
    expect(current).toBe("completed");

    /* Токен получен ОДИН раз — кэш. */
    expect(calls.filter((c) => c.url.endsWith("/token")).length).toBe(1);
    /* Все авторизованные запросы — с Bearer. */
    for (const call of calls.slice(1)) {
      const headers = call.init?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBe("Bearer tok-1");
    }
    /* Upload передал адрес фида площадке. */
    const uploadCall = calls.find((c) => c.url.endsWith("/autoload/v1/upload"));
    expect(JSON.parse(String(uploadCall?.init?.body))).toEqual({
      url: "https://agropost/api/feeds/avito?token=t",
    });
  });

  test("validate: 404 у площадки → unavailable (валидатора нет)", async () => {
    const { impl } = fakeFetch({
      "POST /token": () => jsonResponse(200, { access_token: "tok-1", expires_in: 86400, token_type: "Bearer" }),
      /* /autoload/v2/validate не описан → 404. */
    });
    const client = createAvitoClient({ config: CONFIG("https://api.avito.ru"), fetchImpl: impl });
    const result = await client.validate("<Ads/>");
    expect(result.remote).toBe("unavailable");
    expect(result.errors).toEqual([]);
  });

  test("validate: valid=false → failed с ошибками площадки", async () => {
    const { impl } = fakeFetch({
      "POST /token": () => jsonResponse(200, { access_token: "tok-1", expires_in: 86400, token_type: "Bearer" }),
      "POST /autoload/v2/validate": () =>
        jsonResponse(200, { valid: false, errors: ["Ad #1: Category не найдена"] }),
    });
    const client = createAvitoClient({ config: CONFIG("https://api.avito.ru"), fetchImpl: impl });
    const result = await client.validate("<Ads/>");
    expect(result.remote).toBe("failed");
    expect(result.errors).toEqual(["Ad #1: Category не найдена"]);
  });

  test("upload: ошибка площадки → AvitoApiError с сообщением", async () => {
    const { impl } = fakeFetch({
      "POST /token": () => jsonResponse(200, { access_token: "tok-1", expires_in: 86400, token_type: "Bearer" }),
      "POST /autoload/v1/upload": () => jsonResponse(403, { message: "нет доступа к Автозагрузке" }),
    });
    const client = createAvitoClient({ config: CONFIG("https://api.avito.ru"), fetchImpl: impl });
    await expect(client.upload("https://feed")).rejects.toThrow("нет доступа к Автозагрузке");
    await expect(client.upload("https://feed")).rejects.toBeInstanceOf(AvitoApiError);
  });
});
