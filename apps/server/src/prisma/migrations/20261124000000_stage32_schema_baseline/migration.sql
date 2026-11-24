/*
 * Этап 5.1 — восстановление целостности истории миграций.
 *
 * ДЕФЕКТ (найден честной проверкой на чистой БД): объекты этапов
 * 2.5/3.0/3.2 (Submission-поля Channel, AiCall, CompetitorPrice,
 * Lead/Message/BotConfig и их enum'ы) были применены на проде через
 * prisma db push и НЕ попали в migration-историю. deploy на ЧИСТОЙ
 * базе падал на этапе 4 («relation "Lead" does not exist»).
 *
 * Эта миграция — ИДЕМПОТЕНТНЫЙ базлайн: на проде всё уже существует и
 * операции пропускаются (IF NOT EXISTS / DO-блоки), на чистой базе
 * объекты создаются ДО этапа 4, который на них ссылается. Старые
 * миграции не тронуты (контрольные суммы в _prisma_migrations валидны).
 */

-- ---------- Enums (CREATE TYPE не имеет IF NOT EXISTS — DO-блоки) ----------

DO $$ BEGIN
  CREATE TYPE "SubmissionMethod" AS ENUM ('BOT', 'ADMIN_CONTACT', 'SITE_FORM', 'CABINET', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConfirmationStatus" AS ENUM ('CONFIRMED', 'REQUIRES_CHECK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AudienceType" AS ENUM ('B2B', 'B2C', 'REGIONAL', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PriceSource" AS ENUM ('AGROSERVER', 'TELEGRAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AiCallStatus" AS ENUM ('OK', 'RETRY', 'FALLBACK', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadSource" AS ENUM ('TELEGRAM_BOT', 'TELEGRAM_CHAT', 'AVITO', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'ANSWERED', 'CLOSED', 'SPAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Channel: submission-поля этапа 2.5 ----------

ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "submissionMethod" "SubmissionMethod" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "submissionBotUsername" TEXT;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "adminContact" TEXT;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "frequencyLimit" TEXT;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "confirmationStatus" "ConfirmationStatus" NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "mirrorOf" TEXT;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "audienceType" "AudienceType";

DO $$ BEGIN
  ALTER TABLE "Channel" ADD CONSTRAINT "Channel_mirrorOf_fkey"
    FOREIGN KEY ("mirrorOf") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Channel_submissionMethod_idx" ON "Channel"("submissionMethod");
CREATE INDEX IF NOT EXISTS "Channel_audienceType_idx" ON "Channel"("audienceType");
CREATE INDEX IF NOT EXISTS "Channel_mirrorOf_idx" ON "Channel"("mirrorOf");

-- ---------- Этап 3.0: AiCall (журнал вызовов AI) ----------

CREATE TABLE IF NOT EXISTS "AiCall" (
    "id" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "outputJson" JSONB,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" "AiCallStatus" NOT NULL,
    "errorMessage" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiCall_useCase_createdAt_idx" ON "AiCall"("useCase", "createdAt");
CREATE INDEX IF NOT EXISTS "AiCall_inputHash_idx" ON "AiCall"("inputHash");

-- ---------- Этап 3.2: Lead, Message, BotConfig ----------

CREATE TABLE IF NOT EXISTS "Lead" (
    "id" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'TELEGRAM_BOT',
    "externalId" TEXT,
    "externalUsername" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "region" TEXT,
    "interest" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "positionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiCallId" TEXT,
    "telegramMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BotConfig" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_positionId_fkey"
    FOREIGN KEY ("positionId") REFERENCES "SupplierPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BotConfig" ADD CONSTRAINT "BotConfig_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Lead_source_idx" ON "Lead"("source");
CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status");
CREATE INDEX IF NOT EXISTS "Lead_externalId_idx" ON "Lead"("externalId");
CREATE INDEX IF NOT EXISTS "Lead_positionId_idx" ON "Lead"("positionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_source_externalId_key" ON "Lead"("source", "externalId");
CREATE INDEX IF NOT EXISTS "Message_leadId_sentAt_idx" ON "Message"("leadId", "sentAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Message_leadId_telegramMessageId_key" ON "Message"("leadId", "telegramMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "BotConfig_channelId_key" ON "BotConfig"("channelId");

-- ---------- Этап 2.5: CompetitorPrice (обезличенные цены) ----------

CREATE TABLE IF NOT EXISTS "CompetitorPrice" (
    "id" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "query" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "region" TEXT,
    "sellerName" TEXT,
    "link" TEXT NOT NULL,
    "rawSnippet" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompetitorPrice_source_idx" ON "CompetitorPrice"("source");
CREATE INDEX IF NOT EXISTS "CompetitorPrice_query_idx" ON "CompetitorPrice"("query");
CREATE INDEX IF NOT EXISTS "CompetitorPrice_fetchedAt_idx" ON "CompetitorPrice"("fetchedAt");
CREATE INDEX IF NOT EXISTS "CompetitorPrice_source_query_fetchedAt_idx" ON "CompetitorPrice"("source", "query", "fetchedAt");
