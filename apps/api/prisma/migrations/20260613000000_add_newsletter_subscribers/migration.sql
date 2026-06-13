-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "NewsletterSource" AS ENUM ('FOOTER', 'CHECKOUT', 'POPUP', 'ADMIN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NewsletterSyncState" AS ENUM ('SYNCED', 'PENDING_SYNC', 'FAILED', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'PENDING',
    "source" "NewsletterSource" NOT NULL DEFAULT 'UNKNOWN',
    "locale" VARCHAR(8),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerSubscriberId" TEXT,
    "provider" VARCHAR(20),
    "syncState" "NewsletterSyncState" NOT NULL DEFAULT 'PENDING_SYNC',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "confirmationToken" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_confirmationToken_key" ON "NewsletterSubscriber"("confirmationToken");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_syncState_idx" ON "NewsletterSubscriber"("syncState");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_provider_idx" ON "NewsletterSubscriber"("provider");
