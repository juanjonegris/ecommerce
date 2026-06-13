-- CreateEnum
CREATE TYPE "ProductImageStatus" AS ENUM ('PENDING_UPLOAD', 'READY');

-- AlterTable (add columns nullable; status/createdAt/updatedAt have defaults so they can be NOT NULL upfront)
ALTER TABLE "ProductImage"
    ADD COLUMN "storageKey" TEXT,
    ADD COLUMN "mimeType" VARCHAR(64),
    ADD COLUMN "sizeBytes" INTEGER,
    ADD COLUMN "width" INTEGER,
    ADD COLUMN "height" INTEGER,
    ADD COLUMN "status" "ProductImageStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill legacy rows so the NOT NULL pass + unique index don't break
UPDATE "ProductImage"
SET "storageKey" = 'legacy/' || "id",
    "mimeType"   = 'image/jpeg',
    "sizeBytes"  = 0,
    "status"     = 'READY';

-- AlterTable (tighten the just-backfilled columns)
ALTER TABLE "ProductImage"
    ALTER COLUMN "storageKey" SET NOT NULL,
    ALTER COLUMN "mimeType" SET NOT NULL,
    ALTER COLUMN "sizeBytes" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_storageKey_key" ON "ProductImage"("storageKey");

-- CreateIndex
CREATE INDEX "ProductImage_status_idx" ON "ProductImage"("status");
