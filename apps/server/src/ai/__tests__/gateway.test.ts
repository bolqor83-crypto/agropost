import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { AiCache } from "../cache.js";
import type { AiConfig } from "../config.js";
import { AiGateway, aiInputHash } from "../gateway.js";
import { MemoryAiLogger } from "../logger.js";
import type { AiCompletion, AiProvider } from "../providers/types.js";

const config: AiConfig = {
  provider: "glm",
  glmApiKey: "test-key",
  glmBaseUrl: "http://localhost:9999",
  glmModelFlash: "glm-test-flash",
  glmModelPro: "glm-test-pro",
  openrouterApiKey: null,
  openrouterModel: "test/openrouter",
  openrouterModels: [],
  timeoutMs: 1000,
};

class MockProvider implements AiProvider {
  readonly name = "mock" as const;
  calls = 0;
  constructor(private readonly responses: Array<string | Error>) {}

  async complete(): Promise<AiCompletion> {
    const response = this.responses[Math.min(this.calls, this.responses.length - 1)];
    this.calls += 1;
    if (response instanceof Error) throw response;
    return { content: response, tokensIn: 11, tokensOut: 7, latencyMs: 2 };
  }
}

const schema = z.object({ a: z.string() }).strict();
const fallback = () => ({ a: "fallback" });

function makeGateway(
  primary: AiProvider | null,
  secondary: AiProvider | null = null,
  cache = new AiCache({ ttlMs: 60_000 }),
  logger = new MemoryAiLogger(),
): { gateway: AiGateway; logger: MemoryAiLogger; cache: AiCache } {
  return {
    gateway: new AiGateway({ primary, secondary, cache, logger, config }),
    logger,
    cache,
  };
}

describe("AiGateway", () => {
  test("валидный JSON → status ok, схема применена", async () => {
    const provider = new MockProvider(['{"a":"hello"}']);
    const { gateway, logger } = makeGateway(provider);
    const result = await gateway.run({
      useCase: "listing",
      input: { x: 1 },
      schema,
      system: "sys",
      user: "user",
      fallback,
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ a: "hello" });
    expect(result.meta.status).toBe("ok");
    expect(result.meta.provider).toBe("mock");
    expect(provider.calls).toBe(1);
    expect(logger.entries).toHaveLength(1);
    expect(logger.last?.tokensIn).toBe(11);
  });

  test("невалидный JSON → retry, вторая попытка успешна", async () => {
    const provider = new MockProvider(["не json", '{"a":"ok"}']);
    const { gateway } = makeGateway(provider);
    const result = await gateway.run({
      useCase: "reply",
      input: { y: 2 },
      schema,
      system: "sys",
      user: "user",
      fallback,
    });
    expect(result.data).toEqual({ a: "ok" });
    expect(result.meta.status).toBe("retry");
    expect(provider.calls).toBe(2);
    expect(result.warnings.some((w) => w.includes("переформулировал"))).toBe(true);
  });

  test("JSON не по схеме → retry", async () => {
    const provider = new MockProvider(['{"a":123}', '{"a":"fine"}']);
    const { gateway } = makeGateway(provider);
    const result = await gateway.run({
      useCase: "advice",
      input: { z: 3 },
      schema,
      system: "sys",
      user: "user",
      fallback,
    });
    expect(result.data).toEqual({ a: "fine" });
    expect(result.meta.status).toBe("retry");
  });

  test("провайдер упал дважды → fallback, приложение не падает", async () => {
    const provider = new MockProvider([new Error("network"), new Error("network 2")]);
    const { gateway, logger } = makeGateway(provider);
    const result = await gateway.run({
      useCase: "logistics",
      input: { q: 4 },
      schema,
      system: "sys",
      user: "user",
      fallback,
    });
    expect(result.data).toEqual({ a: "fallback" });
    expect(result.meta.status).toBe("fallback");
    expect(result.meta.provider).toBe("fallback");
    expect(result.warnings.some((w) => w.includes("AI недоступен"))).toBe(true);
    expect(logger.last?.status).toBe("fallback");
    expect(logger.last?.errorMessage).toContain("network 2");
  });

  test("кэш: повторный запрос не тратит токены", async () => {
    const provider = new MockProvider(['{"a":"cached"}']);
    const { gateway } = makeGateway(provider);
    const opts = {
      useCase: "listing" as const,
      input: { positionId: "pos-1", platform: "avito" },
      schema,
      system: "sys",
      user: "user",
      fallback,
    };
    const first = await gateway.run(opts);
    const second = await gateway.run(opts);
    expect(first.meta.cached).toBeUndefined();
    expect(second.meta.cached).toBe(true);
    expect(second.meta.tokensIn).toBe(0);
    expect(provider.calls).toBe(1);
  });

  test("white-label нарушение → retry с усиленным промптом", async () => {
    const provider = new MockProvider(['{"a":"Павловская склад"}', '{"a":"чисто"}']);
    const { gateway } = makeGateway(provider);
    const result = await gateway.run({
      useCase: "reply",
      input: { positionId: "pos-1" },
      schema,
      system: "sys",
      user: "user",
      validate: (data) => (/Павловская|склад/i.test(data.a) ? ["упоминание города"] : []),
      fallback,
    });
    expect(result.data).toEqual({ a: "чисто" });
    expect(result.meta.status).toBe("retry");
  });

  test("white-label нарушение дважды → fallback", async () => {
    const provider = new MockProvider(['{"a":"Павловская"}', '{"a":"склад"}']);
    const { gateway } = makeGateway(provider);
    const result = await gateway.run({
      useCase: "reply",
      input: { positionId: "pos-1" },
      schema,
      system: "sys",
      user: "user",
      validate: (data) => (/Павловская|склад/i.test(data.a) ? ["упоминание"] : []),
      fallback,
    });
    expect(result.data).toEqual({ a: "fallback" });
    expect(result.meta.status).toBe("fallback");
  });

  test("сбой GLM → резервный OpenRouter отвечает", async () => {
    const primary = new MockProvider([new Error("GLM down"), new Error("GLM down 2")]);
    const secondary = new MockProvider(['{"a":"reserve"}']);
    const { gateway } = makeGateway(primary, secondary);
    const result = await gateway.run({
      useCase: "listing",
      input: { p: 1 },
      schema,
      system: "sys",
      user: "user",
      fallback,
    });
    expect(result.data).toEqual({ a: "reserve" });
    expect(result.meta.status).toBe("retry");
    expect(result.meta.provider).toBe("mock");
  });

  test("провайдер не настроен → честный fallback", async () => {
    const { gateway } = makeGateway(null, null);
    const result = await gateway.run({
      useCase: "price_analysis",
      input: { p: 2 },
      schema,
      system: "sys",
      user: "user",
      fallback,
    });
    expect(result.data).toEqual({ a: "fallback" });
    expect(result.meta.status).toBe("fallback");
  });

  test("inputHash стабилен и зависит от useCase", () => {
    const a = aiInputHash("listing", { positionId: "pos-1" });
    const b = aiInputHash("listing", { positionId: "pos-1" });
    const c = aiInputHash("reply", { positionId: "pos-1" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
