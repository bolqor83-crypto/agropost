import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
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
import { registerErrorHandler } from "./errors.js";

/**
 * АгроПост API.
 * Этап 1: поставщики, шаблоны культур, позиции (JSONB-атрибуты),
 * медиа и сертификаты (presigned uploads в R2), профиль пользователя.
 * Этап 2: каналы, аккаунты, умный подбор и размещения (шаблонный текст).
 * Этап 3 добавит /api/ai/* (OpenRouter, ключ только здесь).
 *
 * Все ошибки — единый формат { error: { code, message } }.
 * Стек: tsx в рантайме (shared/ лежит вне apps/server, emit не нужен).
 */

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
});

/* Обработчик ошибок — ДО маршрутов: единый формат {error:{code,message}} */
registerErrorHandler(app);

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

const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
