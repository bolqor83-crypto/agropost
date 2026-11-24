/**
 * ЭТАП 9 — OAuth2 Авито: получение access_token.
 *
 * POST {apiBase}/token, Content-Type: application/x-www-form-urlencoded,
 * body: grant_type=client_credentials&client_id=…&client_secret=… (спека
 * Access API Авито, GetTokenRequest: grant_type/client_id/client_secret).
 * Ответ: { access_token, expires_in (сек), token_type: "Bearer" }.
 *
 * fetch инъекцируется — тесты подменяют без сети.
 */

import { AvitoApiError, type AvitoTokenResponse } from "./types.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AvitoAuthInput {
  clientId: string;
  clientSecret: string;
  apiBase: string;
}

export async function fetchAvitoToken(
  input: AvitoAuthInput,
  fetchImpl: FetchLike = fetch,
): Promise<AvitoTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });

  const res = await fetchImpl(`${input.apiBase}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Авито API: авторизация не удалась (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string; error_description?: string };
      if (parsed.error_description || parsed.error) {
        message = `Авито API: ${parsed.error_description ?? parsed.error}`;
      }
    } catch {
      /* не JSON — оставляем общий текст */
    }
    throw new AvitoApiError(res.status, message);
  }

  const json = (await res.json()) as AvitoTokenResponse;
  if (!json.access_token) {
    throw new AvitoApiError(res.status, "Авито API: ответ без access_token");
  }
  return json;
}
