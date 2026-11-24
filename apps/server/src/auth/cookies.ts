/**
 * Cookie сессии владельца: HttpOnly, SameSite=Lax, Secure (production),
 * Path=/, Max-Age = TTL. Чтение/парсинг — без зависимостей.
 */

export const SESSION_COOKIE = "agropost_session";

export interface CookieOptions {
  ttlMs: number;
  secure: boolean;
}

/** Значение Set-Cookie для выдачи сессии. */
export function sessionCookie(token: string, opts: CookieOptions): string {
  const maxAge = Math.floor(opts.ttlMs / 1000);
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(opts.secure ? ["Secure"] : []),
    `Max-Age=${maxAge}`,
  ].join("; ");
}

/** Значение Set-Cookie для удаления (logout). */
export function clearSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

/** Достать значение cookie из заголовка Cookie (без внешних парсеров). */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      const value = part.slice(eq + 1).trim();
      return value || null;
    }
  }
  return null;
}
