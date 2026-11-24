-- AlterTable
ALTER TABLE "SupplierPosition" ADD COLUMN     "stockSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "firstChannelId" TEXT,
ADD COLUMN     "firstListingId" TEXT,
ADD COLUMN     "lastChannelId" TEXT,
ADD COLUMN     "lastListingId" TEXT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryToTerminalCost" DECIMAL(12,2),
ADD COLUMN     "itemAttributes" JSONB,
ADD COLUMN     "itemCulture" TEXT,
ADD COLUMN     "itemName" TEXT,
ADD COLUMN     "shippingMode" TEXT,
ADD COLUMN     "supplierLocation" TEXT,
ADD COLUMN     "supplierName" TEXT;

-- CreateTable
CREATE TABLE "LeadTouch" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadTouch_leadId_idx" ON "LeadTouch"("leadId");

-- CreateIndex
CREATE INDEX "LeadTouch_channelId_idx" ON "LeadTouch"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadTouch_leadId_listingId_key" ON "LeadTouch"("leadId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerSession_tokenHash_key" ON "OwnerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "OwnerSession_expiresAt_idx" ON "OwnerSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Lead_lastChannelId_idx" ON "Lead"("lastChannelId");

-- CreateIndex
CREATE INDEX "Lead_firstChannelId_idx" ON "Lead"("firstChannelId");

-- CreateIndex
CREATE INDEX "Deal_closedAt_idx" ON "Deal"("closedAt");

-- AddForeignKey
ALTER TABLE "LeadTouch" ADD CONSTRAINT "LeadTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;


/*
 * Этап 5.1 — безопасность и аналитика (только добавляющие изменения):
 * - OwnerSession: серверные сессии владельца (хеш токена);
 * - Lead: first/last каналы и объявления для настоящей аттрибуции;
 * - LeadTouch: история касаний лида объявлениями;
 * - Deal: closedAt + снимок условий сделки + доставка до терминала;
 * - SupplierPosition: stockSince (фактическое начало наличия).
 *
 * Исторические данные не выдумываем: closedAt/stockSince для старых
 * записей остаются NULL (учёт только в периоде «всё время»).
 */
