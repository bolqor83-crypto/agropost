import type { FastifyInstance } from "fastify";

/**
 * /api/parser — прокси на Python-сервис парсера цен (этап 2.5).
 *
 * Сам парсер — services/parser (FastAPI + Telethon + httpx): он ходит
 * на Агросервер и в Telegram, пишет строки в CompetitorPrice (Neon).
 * Node-бэкенд только запускает его по HTTP и отдаёт статус — тяжёлый
 * MTProto/HTML-код в основной API не тащим.
 *
 * PARSER_URL (env): адрес сервиса, по умолчанию http://127.0.0.1:8000.
 * Сервис не поднят → честный 503 PARSER_UNAVAILABLE, приложение живёт.
 */

import { ApiError } from "../errors.js";
import { parseOrThrow, parserRunSchema } from "../validation.js";
import { invalidateMarketCache } from "./positions.js";

const PARSER_URL = (process.env.PARSER_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const PARSER_TIMEOUT_MS = 15_000;

async function callParser(
  path: string,
  init?: { method: "POST"; body: unknown },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARSER_TIMEOUT_MS);
  try {
    const res = await fetch(`${PARSER_URL}${path}`, {
      ...(init
        ? { method: init.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
        : {}),
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
