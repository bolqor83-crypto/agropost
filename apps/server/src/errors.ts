import type { FastifyInstance, FastifyError } from "fastify";

/**
 * Единый формат ошибок API: { error: { code, message } }.
 * Коды: VALIDATION_ERROR, NOT_FOUND, CONFLICT, R2_NOT_CONFIGURED,
 * DATABASE_UNAVAILABLE, INTERNAL.
 */

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string): ApiError =>
  new ApiError(400, "VALIDATION_ERROR", message);

export const notFound = (message = "Не найдено"): ApiError =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message: string): ApiError => new ApiError(409, "CONFLICT", message);

/** Prisma-ошибки → понятные коды (Neon может просыпаться — это норма). */
function mapPrisma(err: { code?: string; message?: string }): ApiError | null {
  switch (err.code) {
    case "P2025":
      return notFound("Запись не найдена");
    case "P2002":
      return conflict("Такая запись уже существует");
    case "P2003":
      return conflict("Нельзя удалить: есть связанные записи");
    case "P2021":
    case "P2022":
      return new ApiError(
        503,
        "DATABASE_UNAVAILABLE",
        "База данных не готова — выполните миграцию (npm run db:migrate)",
      );
    case "P1001":
    case "P1002":
      return new ApiError(
        503,
        "DATABASE_UNAVAILABLE",
        "База данных не отвечает (возможно, Neon просыпается) — повторите через несколько секунд",
      );
    default:
      return null;
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ApiError | Error, _req, reply) => {
    if (err instanceof ApiError) {
      reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }
    /* Ошибка валидации атрибутов по шаблону (shared/attributes) — это 400 */
    if ((err as Error).name === "AttributesValidationError") {
      reply
        .code(400)
        .send({ error: { code: "VALIDATION_ERROR", message: (err as Error).message } });
      return;
    }
    const prismaErr = mapPrisma(err as { code?: string });
    if (prismaErr) {
      reply
        .code(prismaErr.statusCode)
        .send({ error: { code: prismaErr.code, message: prismaErr.message } });
      return;
    }
    /* Некорректный JSON в теле запроса */
    const anyErr = err as FastifyError;
    if (anyErr.statusCode === 400 && (anyErr as Error).name === "SyntaxError") {
      reply
        .code(400)
        .send({ error: { code: "VALIDATION_ERROR", message: "Некорректный JSON в запросе" } });
      return;
    }
    app.log.error(err);
    reply.code(500).send({ error: { code: "INTERNAL", message: "Внутренняя ошибка сервера" } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "Маршрут не найден" } });
  });
}
