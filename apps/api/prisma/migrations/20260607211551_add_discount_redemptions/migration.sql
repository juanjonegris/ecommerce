-- AlterTable
ALTER TABLE "Order" ADD COLUMN "discountCodeId" TEXT,
ADD COLUMN "discountAmount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" TEXT NOT NULL,
    "discountCodeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountApplied" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_discountCodeId_idx" ON "Order"("discountCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_discountCodeId_orderId_key" ON "DiscountRedemption"("discountCodeId", "orderId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_orderId_idx" ON "DiscountRedemption"("orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
