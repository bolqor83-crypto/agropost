/*
 * ЭТАП 5.2 (release-аудит) — восполнение истории миграций, часть 2.
 *
 * ДЕФЕКТ, найденный проверкой на ЧИСТОЙ базе (см. STAGE_5_2_RELEASE_AUDIT.md):
 * колонки этапов 2.1/3.2 — Channel.city, Listing.publishedCount, Listing.url —
 * есть в schema.prisma и на проде (появились через prisma db push), но НИ ОДНА
 * миграция их не создаёт. Идемпотентный baseline этапа 5.1 закрыл объекты
 * 2.5/3.0/3.2, но пропустил эти три колонки. Итог: migrate deploy на чистой
 * базе (render.yaml прогоняет его при каждом деплое) оставлял БД БЕЗ них —
 * Prisma Client падал на первом же SELECT «column "Channel_city" does not
 * exist», стейджинг/новые окружения не поднимались.
 *
 * Эта миграция добавляет недостающие колонки идемпотентно (IF NOT EXISTS):
 *  - на существующем проде колонки уже есть → операции тихо пропускаются;
 *  - на чистой базе колонки создаются ДО старта приложения.
 * Ничего не удаляет, не перезаписывает и не обнуляет данные.
 * publishedCount: NOT NULL DEFAULT 0 — на существующих строках значение
 * уже проставлено (db push), на чистой базе таблица пуста при применении.
 */

ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "publishedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "url" TEXT;
