/*
 * ЭТАП 9 — автоматизация публикации: YML-фиды и Авито API.
 *
 * 1) Channel.automationLevel (enum AUTO / SEMI / MANUAL) — бейджи
 *    автоматизации в мастере «Разместить»:
 *    - AUTO — фид/API обновляют объявления сами (Зерно Он-Лайн, Своё
 *      Фермерство, Авито API, свой бот-админ);
 *    - SEMI (default) — чужие чаты и Агросервер: текст готовит приложение;
 *    - MANUAL — только точка входа (НССиС).
 *    DEFAULT 'SEMI' покрывает существующие 20 каналов (все чужие).
 * 2) AppSetting — ключ-значение настроек приложения: ключи Авито API
 *    (client_id/secret/user_id/phone), если их задали через UI
 *    («Ещё» → «Настройки» → «Авито API»), а не через env.
 *
 * Идемпотентность (IF NOT EXISTS) — как в этапе 5.2: на существующем
 * проде повторный migrate deploy ничего не меняет, на чистой базе
 * создаёт объекты до старта приложения. Ничего не удаляет и не обнуляет.
 */

-- Enum типа уже может существовать (db push/ручное создание) — обходим DO-блоком.
DO $$
BEGIN
  CREATE TYPE "AutomationLevel" AS ENUM ('AUTO', 'SEMI', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "automationLevel" "AutomationLevel" NOT NULL DEFAULT 'SEMI';

CREATE INDEX IF NOT EXISTS "Channel_automationLevel_idx" ON "Channel"("automationLevel");

CREATE TABLE IF NOT EXISTS "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");
