import type { FastifyInstance } from "fastify";

/**
 * /api/parser — прокси на Python-сервис парсера цен (этап 2.5).
 *
 * Этап 5.1 (безопасность):
 * - оба маршрута закрыты авторизацией владельца (глобальный guard);
 * - Node → Python ходит с внутренним секретом PARSER_SECRET
 *   (заголовок X-Parser-Secret, только сервер-сервер);
 * - если PARSER_URL не задан явно — честный 503 PARSER_NOT_CONFIGURED
 *   («Парсер не настроен»), а не молчаливый localhost;
 * - секрет не логируется и не уходит в клиент.
 *
 * Сам парсер — services/parser (FastAPI + Telethon + httpx): он ходит
 * на Агросервер и в Telegram, пишет строки в CompetitorPrice (Neon).
 * PARSER_URL (env): адрес сервиса, по умолчанию в разработке
 * http://127.0.0.1:8000; в production без переменной — «не настроен».
 */

import { ApiError } from "../errors.js";
import { parseOrThrow, parserRunSchema } from "../validation.js";
import { invalidateMarketCache } from "./positions.js";

const PARSER_TIMEOUT_MS = 15_000;

/** Адрес парсера; null — не настроен (в production без PARSER_URL). */
function parserBaseUrl(): string | null {
  const fromEnv = process.env.PARSER_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return null;
  return "http://127.0.0.1:8000"; /* локальная разработка */
}

/** Внутренний секрет сервер-сервер; null — не задан. */
function parserSecret(): string | null {
  const value = process.env.PARSER_SECRET?.trim();
  return value || null;
}

async function callParser(
  path: string,
  init?: { method: "POST"; body: unknown },
): Promise<unknown> {
  const base = parserBaseUrl();
  if (!base) {
    throw new ApiError(
      503,
      "PARSER_NOT_CONFIGURED",
      "Парсер не настроен: задайте PARSER_URL (адрес сервиса services/parser) в переменных окружения",
    );
  }
  const secret = parserSecret();
  if (!secret) {
    throw new ApiError(
      503,
      "PARSER_NOT_CONFIGURED",
      "Не задан PARSER_SECRET — запуск парсера запрещён (внутренний секрет Node → Python)",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      ...(init
        ? {
            method: init.method,
            headers: { "Content-Type": "application/json", "X-Parser-Secret": secret },
            body: JSON.stringify(init.body),
          }
        : { method: "GET", headers: { "X-Parser-Secret": secret } }),
      signal: controller.signal,
    });
    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const err = (body as { error?: { message?: string } } | null)?.error;
      throw new ApiError(
        res.status === 404 ? 503 : 502,
        "PARSER_UNAVAILABLE",
        err?.message ?? `Сервис парсера вернул ошибку ${res.status}`,
      );
    }
    return body;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      503,
      "PARSER_UNAVAILABLE",
      "Сервис парсера недоступен — запустите services/parser (см. README: uvicorn app.main:app)",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function parserRoutes(app: FastifyInstance): Promise<void> {
  /** Ручной запуск сбора цен (для теста; cron в самом сервисе — раз в 12 ч). */
  app.post("/api/parser/run", async (req) => {
    const data = parseOrThrow(parserRunSchema, req.body ?? {});
    const result = (await callParser("/run", { method: "POST", body: data })) as {
      ok?: boolean;
    };
    if (result?.ok) invalidateMarketCache();
    return result;
  });

  /** Статус парсера: запущен ли сбор, итоги последнего прогона. */
  app.get("/api/parser/status", async () => {
    return (await callParser("/status")) as unknown;
  });
}
