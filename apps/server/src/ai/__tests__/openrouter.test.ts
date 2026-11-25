/**
 * Патч 4.1, часть D: OpenRouter как резерв с каскадом моделей.
 * complete() идёт по списку, пока модель не ответит; после успеха курсор
 * смещается (следующий вызов начнётся со следующей модели).
 */

import { describe, expect, test } from "bun:test";
import { OPENROUTER_FREE_MODELS, loadAiConfig } from "../config.js";
import { OpenRouterProvider } from "../providers/openrouter.js";
import { AiProviderError, type AiProvider } from "../providers/types.js";

function okResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenRouter: каскад моделей", () => {
  test("первая модель падает (HTTP 429) — отвечает вторая", async () => {
    const calls: string[] = [];
    const provider = new OpenRouterProvider({
      apiKey: "test",
      models: ["model-a:free", "model-b:free"],
      fetchImpl: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        calls.push(body.model);
        if (body.model === "model-a:free") {
          return errorResponse(429, "Rate limit exceeded for free model");
        }
        return okResponse('{"a":"ok"}');
      },
    });
    const result = await provider.complete({
      system: "sys",
      user: "user",
      model: "ignored",
      jsonMode: true,
    });
    expect(result.content).toBe('{"a":"ok"}');
    expect(calls).toEqual(["model-a:free", "model-b:free"]);
  });

  test("успех смещает курсор: следующий вызов идёт со второй модели", async () => {
    const calls: string[] = [];
    const provider = new OpenRouterProvider({
      apiKey: "test",
      models: ["model-a:free", "model-b:free"],
      fetchImpl: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        calls.push(body.model);
        return okResponse('{"a":"ok"}');
      },
    });
    await provider.complete({ system: "s", user: "u", model: "m", jsonMode: false });
    await provider.complete({ system: "s", user: "u", model: "m", jsonMode: false });
    /* 1-й вызов: model-a → успех → курсор на model-b. 2-й вызов: model-b. */
    expect(calls).toEqual(["model-a:free", "model-b:free"]);
  });

  test("все модели каскада упали — AiProviderError с последним сообщением", async () => {
    const provider = new OpenRouterProvider({
      apiKey: "test",
      models: ["model-a:free", "model-b:free"],
      fetchImpl: async () => errorResponse(503, "upstream error"),
    });
    await expect(
      provider.complete({ system: "s", user: "u", model: "m", jsonMode: false }),
    ).rejects.toThrow(AiProviderError);
  });

  test("пустой content у модели — каскад пробует следующую", async () => {
    const calls: string[] = [];
    const provider = new OpenRouterProvider({
      apiKey: "test",
      models: ["model-a:free", "model-b:free"],
      fetchImpl: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        calls.push(body.model);
        if (body.model === "model-a:free") {
          return okResponse("");
        }
        return okResponse('{"a":"ok"}');
      },
    });
    const result = await provider.complete({
      system: "s",
      user: "u",
      model: "m",
      jsonMode: true,
    });
    expect(result.content).toBe('{"a":"ok"}');
    expect(calls).toEqual(["model-a:free", "model-b:free"]);
  });

  test("baseURL — https://openrouter.ai/api/v1", () => {
    const provider = new OpenRouterProvider({
      apiKey: "test",
      models: ["model-a:free"],
    });
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://openrouter.ai/api/v1",
    );
  });
});

describe("конфиг каскада", () => {
  test("по умолчанию — бесплатные модели из списка патча", () => {
    const config = loadAiConfig({});
    expect(config.openrouterModels).toEqual([...OPENROUTER_FREE_MODELS]);
  });

  test("OPENROUTER_MODELS переопределяет список (через запятую)", () => {
    const config = loadAiConfig({
      OPENROUTER_MODELS: " m1:free , m2:free ",
    });
    expect(config.openrouterModels).toEqual(["m1:free", "m2:free"]);
    expect(config.openrouterModel).toBe("m1:free");
  });

  test("OPENROUTER_MODEL идёт первым, за ним бесплатные", () => {
    const config = loadAiConfig({ OPENROUTER_MODEL: "paid/model" });
    expect(config.openrouterModels[0]).toBe("paid/model");
    expect(config.openrouterModels).toContain(...OPENROUTER_FREE_MODELS);
  });
});

/* Совместимость интерфейса: OpenRouterProvider — это AiProvider. */
test("OpenRouterProvider реализует AiProvider", () => {
  const provider: AiProvider = new OpenRouterProvider({
    apiKey: "test",
    models: ["m:free"],
  });
  expect(provider.name).toBe("openrouter");
});

/* ФИКС аудита прода 25.11.2026: кириллица в значении заголовка (было
   X-Title: "АгроПост") валилась мгновенно «Cannot convert argument to
   a ByteString» — undici требует Latin-1. Мок ниже прогоняет init через
   настоящий конструктор Request: он сериализует заголовки так же
   строго, как реальный fetch, — кириллица упадёт и в тесте. */
describe("заголовки запроса — валидный ByteString (регрессия кириллицы)", () => {
  test("все заголовки проходят сериализацию Request (без не-ByteString)", async () => {
    const seen: string[] = [];
    const provider = new OpenRouterProvider({
      apiKey: "test",
      models: ["m:free"],
      fetchImpl: async (_input, init) => {
        /* new Request валидирует заголовки строго как реальный fetch. */
        const req = new Request("https://openrouter.ai/api/v1/chat/completions", init);
        seen.push(...[...req.headers.entries()].map(([k]) => k));
        return okResponse('{"ok":true}');
      },
    });
    const result = await provider.complete({
      system: "система с кириллицей в ТЕЛЕ — ок",
      user: "пользователь",
      model: "m:free",
      jsonMode: true,
    });
    expect(result.content).toBe('{"ok":true}');
    expect(seen).toContain("x-title");
  });
});
