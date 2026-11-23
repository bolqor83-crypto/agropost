-- CreateEnum
CREATE TYPE "SupplierLocation" AS ENUM ('PAVLOVSKAYA', 'LENINGRADSKAYA', 'TIHORETSK', 'OTHER');

-- CreateEnum
CREATE TYPE "ShippingMode" AS ENUM ('SELF_LOADS', 'FROM_WAREHOUSE', 'BOTH');

-- CreateEnum
CREATE TYPE "CultureType" AS ENUM ('SEED', 'NUT');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('IP', 'SELF_EMPLOYED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "location" "SupplierLocation" NOT NULL,
    "shippingMode" "ShippingMode" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CultureTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CultureType" NOT NULL,
    "attributesSchema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CultureTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPosition" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "cultureId" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "volumeKg" INTEGER NOT NULL,
    "bagWeightKg" INTEGER NOT NULL,
    "supplierPrice" DECIMAL(10,2) NOT NULL,
    "markupPercent" DECIMAL(5,2) NOT NULL,
    "salePrice" DECIMAL(10,2) NOT NULL,
    "minLotKg" INTEGER NOT NULL,
    "hasCertificate" BOOLEAN NOT NULL DEFAULT false,
    "status" "PositionStatus" NOT NULL DEFAULT 'IN_STOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "taxMode" "TaxMode" NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_location_idx" ON "Supplier"("location");

-- CreateIndex
CREATE UNIQUE INDEX "CultureTemplate_name_key" ON "CultureTemplate"("name");

-- CreateIndex
CREATE INDEX "CultureTemplate_type_idx" ON "CultureTemplate"("type");

-- CreateIndex
CREATE INDEX "SupplierPosition_supplierId_idx" ON "SupplierPosition"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPosition_cultureId_idx" ON "SupplierPosition"("cultureId");

-- CreateIndex
CREATE INDEX "SupplierPosition_status_idx" ON "SupplierPosition"("status");

-- CreateIndex
CREATE INDEX "SupplierPosition_updatedAt_idx" ON "SupplierPosition"("updatedAt");

-- CreateIndex
CREATE INDEX "Media_positionId_idx" ON "Media"("positionId");

-- CreateIndex
CREATE INDEX "Certificate_positionId_idx" ON "Certificate"("positionId");

-- AddForeignKey
ALTER TABLE "SupplierPosition" ADD CONSTRAINT "SupplierPosition_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPosition" ADD CONSTRAINT "SupplierPosition_cultureId_fkey" FOREIGN KEY ("cultureId") REFERENCES "CultureTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "SupplierPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "SupplierPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
