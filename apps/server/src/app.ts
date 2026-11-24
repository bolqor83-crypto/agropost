/**
 * Сборка приложения АгроПост (без listen — для тестов и прод-старта).
 *
 * Этап 5.1: всё под /api (кроме allowlist) закрыто авторизацией
 * владельца — см. auth/guard.ts. Публичные маршруты: health, meta,
 * auth/session и Telegram-webhook (защитён своим секретом).
 *
 * Все ошибки — единый формат { error: { code, message } }.
 * Стек: tsx в рантайме (shared/ лежит вне apps/server, emit не нужен).
 */

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerErrorHandler } from "./errors.js";
import { corsOptions } from "./auth/cors.js";
import { loadAuthConfig } from "./auth/config.js";
import { MemoryLoginRateLimiter, type LoginRateLimiter } from "./auth/rate-limit.js";
import { authRoutes } from "./auth/routes.js";
import { registerAuthGuard, parseTrustedOrigins, type GuardDeps } from "./auth/guard.js";
import {
  prismaSessionStore,
  type SessionStore,
} from "./auth/sessions.js";
import { healthRoutes } from "./routes/health.js";
import { metaRoutes } from "./routes/meta.js";
import { supplierRoutes } from "./routes/suppliers.js";
import { cultureRoutes } from "./routes/cultures.js";
import { positionRoutes } from "./routes/positions.js";
import { mediaRoutes } from "./routes/media.js";
import { userRoutes } from "./routes/user.js";
import { channelRoutes } from "./routes/channels.js";
import { accountRoutes } from "./routes/accounts.js";
import { listingRoutes } from "./routes/listings.js";
import { parserRoutes } from "./routes/parser.js";
import { aiRoutes } from "./routes/ai.js";
import { leadsRoutes } from "./routes/leads.js";
import { telegramRoutes } from "./routes/telegram.js";
import { telegramWebhookRoutes } from "./routes/telegramWebhook.js";
import { dealsRoutes } from "./routes/deals.js";
import { claimsRoutes } from "./routes/claims.js";
import { carrierRoutes } from "./routes/carriers.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { getTelegram } from "./telegram/index.js";

export interface BuildAppOptions {
  /**
   * Подмена хранилища сессий — для интеграционных тестов
   * (в проде используется Prisma/OwnerSession).
   */
  sessionStore?: SessionStore;
  /**
   * Подмена лимитера входа — для тестов (сброс между тестами).
   */
  loginLimiter?: LoginRateLimiter;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  /* ЭТАП 5.2 (аудит): пустое JSON-тело = валидный запрос без данных.
   *
   * ДЕФЕКТ, найденный реальным браузером: клиент всегда посылает
   * Content-Type: application/json — в том числе на POST без тела
   * (logout, refresh, pay/close/deliver/cancel, suggest-channels).
   * Fastify по умолчанию отвечает 400 FST_ERR_CTP_EMPTY_JSON_BODY:
   * logout НЕ уничтожал серверную сессию (cookie жил дальше —
   * приватные данные оставались доступными без повторного входа),
   * а действия сделок падали. Тесты через inject() без content-type
   * дефект не ловили. Допускаем пустое тело как {} — как GET. */
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      const raw = body as string;
      if (!raw || raw.trim().length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

  /* CORS: только доверенные origin, credentials для них. */
  await app.register(cors, corsOptions());

  /* Обработчик ошибок — ДО маршрутов: единый формат {error:{code,message}} */
  registerErrorHandler(app);

  /* Авторизация владельца: guard всего /api + маршруты входа. */
  const authConfig = loadAuthConfig();
  const store = options.sessionStore ?? prismaSessionStore;
  const limiter =
    options.loginLimiter ??
    new MemoryLoginRateLimiter(
      authConfig.loginMaxAttempts,
      authConfig.loginWindowMinutes * 60_000,
    );
  const guardDeps: GuardDeps = {
    store,
    trustedOrigins: parseTrustedOrigins(trustedOriginsList()),
  };
  registerAuthGuard(app, guardDeps);
  await app.register(
    authRoutes({
      config: authConfig,
      store,
      limiter,
    }),
  );

  await app.register(healthRoutes);
  await app.register(metaRoutes);
  await app.register(supplierRoutes);
  await app.register(cultureRoutes);
  await app.register(positionRoutes);
  await app.register(mediaRoutes);
  await app.register(userRoutes);
  await app.register(channelRoutes);
  await app.register(accountRoutes);
  await app.register(listingRoutes);
  await app.register(parserRoutes);
  await app.register(aiRoutes);
  await app.register(leadsRoutes);
  await app.register(telegramRoutes);
  await app.register(dealsRoutes);
  await app.register(claimsRoutes);
  await app.register(carrierRoutes);
  await app.register(analyticsRoutes);

  /* Webhook бота: маршруты зависят от собранного модуля (токен/секрет из env). */
  const telegram = getTelegram();
  await app.register(telegramWebhookRoutes(telegram.deps));

  return app;
}

/* trustedOrigins() импортирован лениво — чтобы env можно было
   выставить в тестах ДО сборки приложения. */
import { trustedOrigins as trustedOriginsList } from "./auth/cors.js";
