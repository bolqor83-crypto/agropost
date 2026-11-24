/**
 * ЭТАП 9 — типы интеграции Авито API (OAuth2 + Автозагрузка).
 */

/** Ответ POST /token (OAuth2, grant_type=client_credentials). */
export interface AvitoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/** Ошибка вызова API Авито: HTTP-код + сообщение площадки. */
export class AvitoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AvitoApiError";
  }
}

/** Ответ загрузки (POST /autoload/v1/upload — фид по ссылке). */
export interface AvitoUploadResult {
  ok: boolean;
  /** Id/состояние загрузки со стороны Авито (если площадка ответила телом). */
  status: string | null;
}

/** Удалённая валидация (POST /autoload/v2/validate). */
export interface AvitoValidateResult {
  remote: "passed" | "unavailable" | "failed";
  errors: string[];
}
