/**
 * ЭТАП 10 — Long Polling апдейтов MAX (poller.ts).
 *
 * Официальный транспорт GET /updates (marker → marker): работает без
 * публичного webhook-домена и настройки сертификатов — стартует сам,
 * когда задан MAX_BOT_TOKEN. Документация MAX рекомендует webhook для
 * production (POST /subscriptions с HTTPS-сертификатом доверенного ЦС);
 * polling для наших объёмов (несколько сообщений в день) достаточен и
 * проще в обслуживании — вариант webhook остаётся в README.
 *
 * Ошибки не роняют сервис: экспоненциальный backoff до 60 с.
 * Обработчик глушит исключения — апдейт не теряется: marker двигается
 * только после успешной итерации dispatch.
 */

import { handleMaxUpdate } from "./handlers.js";
import type { MaxDeps } from "./types.js";

export interface PollerLog {
  info: (msg: string) => void;
  error: (err: unknown) => void;
}

const POLL_TIMEOUT_SEC = 30;
const ERRORS_BEFORE_60S = 5;

let stopped = false;

export function stopMaxPolling(): void {
  stopped = true;
}

export function startMaxPolling(deps: MaxDeps, log: PollerLog): void {
  stopped = false;
  let marker: number | null = null;
  let errors = 0;

  const loop = async (): Promise<void> => {
    log.info("MAX: long polling запущен (GET /updates)");
    while (!stopped) {
      try {
        const res = await deps.api.getUpdates(marker, POLL_TIMEOUT_SEC);
        errors = 0;
        for (const update of res.updates) {
          /* Ошибка одного апдейта не валит цикл — как в webhook. */
          try {
            await handleMaxUpdate(update, deps);
          } catch (err) {
            log.error(err);
          }
        }
        marker = res.marker ?? marker;
      } catch (err) {
        errors += 1;
        /* Backoff: 2, 4, 8, 16, 32, 60 с — не душим площадку. */
        const waitMs = Math.min(2000 * 2 ** Math.min(errors - 1, 6), 60_000);
        log.error(err);
        log.info(`MAX: polling ошибка #${errors}, жду ${waitMs / 1000} c`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        if (errors >= ERRORS_BEFORE_60S * 4) {
          /* Токен отозван/платформа недоступна надолго — отдыхаем 5 минут. */
          await new Promise((resolve) => setTimeout(resolve, 5 * 60_000));
        }
      }
    }
    log.info("MAX: long polling остановлен");
  };

  void loop().catch((err) => log.error(err));
}
