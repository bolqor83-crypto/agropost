-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TELEGRAM_CHAT', 'TELEGRAM_CHANNEL', 'AVITO', 'AGROSERVER', 'MAX', 'YOULA', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountPlatform" AS ENUM ('TELEGRAM', 'AVITO', 'MAX', 'YOULA', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'LIMITED', 'PAUSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'COPIED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "platform" "AccountPlatform" NOT NULL,
    "phone" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "usedToday" INTEGER NOT NULL DEFAULT 0,
    "usedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "url" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "tags" TEXT[],
    "subscribersCount" INTEGER,
    "averageReach" INTEGER,
    "lastActivityAt" TIMESTAMP(3),
    "accountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_platform_idx" ON "Account"("platform");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE INDEX "Channel_type_idx" ON "Channel"("type");

-- CreateIndex
CREATE INDEX "Channel_region_idx" ON "Channel"("region");

-- CreateIndex
CREATE INDEX "Listing_positionId_idx" ON "Listing"("positionId");

-- CreateIndex
CREATE INDEX "Listing_channelId_idx" ON "Listing"("channelId");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "SupplierPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
