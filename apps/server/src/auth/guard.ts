/**
 * Guard приватных API-маршрутов (этап 5.1).
 *
 * Единый onRequest-хук: всё под /api закрыто, кроме явного allowlist
 * (health/meta/auth/telegram-webhook). Защита «только на frontend»
 * исключена: проверка на сервере до любого хендлера, для всех методов
 * (GET/POST/PATCH/PUT/DELETE).
 *
 * Отказ — через ApiError (эджект в setErrorHandler): возврат reply
 * из хука не останавливает жизненный цикл надёжно, throw — останавливает.
 *
 * Дополнительно: Origin-проверка изменяющих запросов — если Origin
 * задан и не входит в доверенные, запрос отклоняется (CSRF-глубже
 * SameSite=Lax: даже скомпрометированный origin не пройдёт).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "../errors.js";
import { readCookie, SESSION_COOKIE } from "./cookies.js";
import type { SessionStore } from "./sessions.js";

export interface GuardDeps {
  store: SessionStore;
  /** Доверенные origin (scheme+host+port) из конфигурации CORS. */
  trustedOrigins: Set<string>;
}

/** Публичные маршруты: без сессии. Webhook закрыт своим секретом. */
export const PUBLIC_API_PATHS = new Set<string>([
  "/api/health",
  "/api/meta",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/telegram/webhook",
]);

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "").toLowerCase();
}

export function parseTrustedOrigins(raw: string[]): Set<string> {
  return new Set(raw.map((o) => normalizeOrigin(o.trim())).filter(Boolean));
}

declare module "fastify" {
  interface FastifyRequest {
    /** Установлено guard-ом: запрос прошёл авторизацию владельца. */
    ownerAuthenticated: boolean;
  }
}

export function registerAuthGuard(app: FastifyInstance, deps: GuardDeps): void {
  app.addHook("onRequest", async (req: FastifyRequest, _reply: FastifyReply) => {
    const method = req.method.toUpperCase();
    if (method === "OPTIONS") return; /* preflight — отдаёт CORS-плагин */
    const url = req.url ?? "";
    if (!url.startsWith("/api")) return; /* статика вне guard */

    /* Путь без query: /api/positions?x=1 → /api/positions. */
    const path = url.split("?")[0];

    /* CSRF-глубина: изменяющий запрос с посторонним Origin — отказ. */
    if (MUTATING.has(method) && path !== "/api/telegram/webhook") {
      const origin = req.headers.origin;
      if (typeof origin === "string" && origin && !deps.trustedOrigins.has(normalizeOrigin(origin))) {
        throw new ApiError(403, "FORBIDDEN_ORIGIN", "Запрос с недоверенного источника");
      }
    }

    if (PUBLIC_API_PATHS.has(path)) return;

    /* Приватный маршрут: без действующей сессии — 401. */
    const cookie = req.headers.cookie;
    const header = Array.isArray(cookie) ? cookie[0] : cookie;
    const token = readCookie(typeof header === "string" ? header : undefined, SESSION_COOKIE);
    const session = token ? await deps.store.find(token) : null;
    if (!session) {
      throw new ApiError(401, "UNAUTHORIZED", "Требуется вход владельца");
    }
    req.ownerAuthenticated = true;

    /* Скользящий TTL: прошёл половину срока — тихо продлеваем. */
    const halfTtl = (session.expiresAt.getTime() - session.createdAt.getTime()) / 2;
    if (Date.now() - session.lastSeenAt.getTime() > halfTtl) {
      const ttlMs = session.expiresAt.getTime() - session.lastSeenAt.getTime();
      await deps.store.extend(session.id, ttlMs).catch(() => undefined);
    }
  });
}
