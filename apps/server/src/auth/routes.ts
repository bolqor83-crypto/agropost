/**
 * /api/auth/* — вход, выход, состояние сессии (этап 5.1).
 *
 * login: проверка логина + Argon2id-пароля из env, лимит попыток,
 * создание серверной сессии (в БД — SHA-256 токена) и HttpOnly cookie.
 * Неверный логин и неверный пароль отвечают одинаково (без раскрытия,
 * существует ли пароль). logout: уничтожение серверной сессии.
 * session: состояние авторизации (публичный маршрут).
 * refresh: продление сессии (только с действующей сессией).
 *
 * Ответ login никогда не раскрывает, настроен ли пароль (503 только
 * когда вход реально не настроен — для владельца это видимый сбой).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { parseOrThrow } from "../validation.js";
import { verifyPassword } from "./passwords.js";
import { clearSessionCookie, readCookie, sessionCookie, SESSION_COOKIE } from "./cookies.js";
import type { LoginRateLimiter } from "./rate-limit.js";
import type { SessionStore } from "./sessions.js";
import type { AuthConfig } from "./config.js";

const loginSchema = z.object({
  login: z.string().min(1, "Укажите логин").max(100),
  password: z.string().min(1, "Укажите пароль").max(200),
});

export interface AuthDeps {
  config: AuthConfig;
  store: SessionStore;
  limiter: LoginRateLimiter;
}

/** IP для лимитера: первый x-forwarded-for либо адрес сокета. */
function clientIp(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (
    (typeof first === "string" && first.split(",")[0].trim()) ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function readToken(req: FastifyRequest): string | null {
  const cookie = req.headers.cookie;
  const header = Array.isArray(cookie) ? cookie[0] : cookie;
  return readCookie(typeof header === "string" ? header : undefined, SESSION_COOKIE);
}

export function authRoutes(deps: AuthDeps) {
  return async (app: FastifyInstance): Promise<void> => {
    const ttlMs = deps.config.sessionTtlHours * 3600_000;

    app.post("/api/auth/login", async (req, reply) => {
      const ip = clientIp(req);
      const now = Date.now();

      if (!deps.config.passwordHash) {
        throw new ApiError(
          503,
          "AUTH_NOT_CONFIGURED",
          "Вход не настроен: задайте OWNER_PASSWORD_HASH (см. README — «bun run hash-password»)",
        );
      }
      if (!deps.limiter.canAttempt(ip, now)) {
        const seconds = deps.limiter.retryAfterSeconds(ip, now);
        reply.code(429);
        return {
          error: {
            code: "TOO_MANY_ATTEMPTS",
            message: `Слишком много попыток входа — подождите ${seconds} с`,
          },
        };
      }

      const input = parseOrThrow(loginSchema, req.body ?? {}) as { login: string; password: string };

      /* Логин и пароль проверяются вместе; ошибки неотличимы. */
      const loginOk = input.login === deps.config.login;
      const passwordOk = await verifyPassword(deps.config.passwordHash, input.password);
      if (!loginOk || !passwordOk) {
        deps.limiter.recordFailure(ip, now);
        throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
      }

      deps.limiter.reset(ip);
      const { token } = await deps.store.create(ttlMs);

      /* Ленивая чистка истёкших сессий — не чаще раза на вход. */
      void deps.store.deleteExpired().catch(() => undefined);

      reply.header(
        "Set-Cookie",
        sessionCookie(token, { ttlMs, secure: deps.config.secureCookie }),
      );
      return { ok: true, authenticated: true, expiresAt: new Date(now + ttlMs).toISOString() };
    });

    app.post("/api/auth/logout", async (req, reply) => {
      const token = readToken(req);
      if (token) await deps.store.delete(token);
      reply.header("Set-Cookie", clearSessionCookie(deps.config.secureCookie));
      return { ok: true, authenticated: false };
    });

    /* Публичный маршрут состояния: проверяет cookie без редиректа. */
    app.get("/api/auth/session", async (req) => {
      const token = readToken(req);
      const session = token ? await deps.store.find(token) : null;
      return {
        ok: true,
        authenticated: session !== null,
        ...(session
          ? {
              expiresAt: session.expiresAt.toISOString(),
              login: deps.config.login,
            }
          : {}),
        configured: deps.config.passwordHash !== null,
      };
    });

    /* Продление сессии — только для уже авторизованного. */
    app.post("/api/auth/refresh", async (req, reply) => {
      const token = readToken(req);
      const session = token ? await deps.store.find(token) : null;
      if (!session) {
        throw new ApiError(401, "UNAUTHORIZED", "Нет действующей сессии");
      }
      await deps.store.extend(session.id, ttlMs);
      reply.header(
        "Set-Cookie",
        sessionCookie(token as string, { ttlMs, secure: deps.config.secureCookie }),
      );
      return { ok: true, authenticated: true, expiresAt: new Date(Date.now() + ttlMs).toISOString() };
    });
  };
}
