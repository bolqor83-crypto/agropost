import type { FastifyInstance } from "fastify";

/**
 * /api/ai/* — пять use cases (этап 3.0).
 * Все ответы — { ok: true, data, warnings, meta }. AI-ошибка не роняет
 * приложение: gateway возвращает шаблонный fallback с status=fallback.
 * Не найденная позиция — обычный 404, это не AI-ошибка.
 */

import { notFound } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import {
  aiAdviceInputSchema,
  aiListingInputSchema,
  aiLogisticsInputSchema,
  aiPriceAnalysisInputSchema,
  aiReplyInputSchema,
} from "../ai/schemas.js";
import {
  analyzePrice,
  generateAdvice,
  generateListing,
  generateReply,
  planLogistics,
} from "../ai/service.js";

async function withPosition<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === "POSITION_NOT_FOUND") {
      throw notFound("Позиция не найдена");
    }
    throw err;
  }
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  /* 1. Текст объявления под площадку. */
  app.post("/api/ai/listing", async (req) => {
    const input = parseOrThrow(aiListingInputSchema, req.body);
    const result = await withPosition(() => generateListing(input));
    return { ok: true, ...result };
  });

  /* 2. Черновик ответа покупателю. */
  app.post("/api/ai/reply", async (req) => {
    const input = parseOrThrow(aiReplyInputSchema, req.body);
    const result = await withPosition(() => generateReply(input));
    return { ok: true, ...result };
  });

  /* 3. «Что сделать?» — 0–3 действия на сегодня. */
  app.post("/api/ai/advice", async (req) => {
    const input = parseOrThrow(aiAdviceInputSchema, req.body ?? {});
    const result = await generateAdvice(input);
    return { ok: true, ...result };
  });

  /* 4. Проверка цены относительно рынка. */
  app.post("/api/ai/price_analysis", async (req) => {
    const input = parseOrThrow(aiPriceAnalysisInputSchema, req.body);
    const result = await withPosition(() => analyzePrice(input));
    return { ok: true, ...result };
  });

  /* 5. Подбор доставки (без оценки рисков). */
  app.post("/api/ai/logistics", async (req) => {
    const input = parseOrThrow(aiLogisticsInputSchema, req.body);
    const result = await planLogistics(input);
    return { ok: true, ...result };
  });
}
