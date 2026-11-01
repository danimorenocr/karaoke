-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('QR_SCANNED', 'SEARCH_PERFORMED', 'REQUEST_CREATED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'PLAYBACK_STARTED', 'PLAYBACK_COMPLETED', 'PLAYBACK_SKIPPED', 'PLAYBACK_FAILED', 'FEEDBACK_SUBMITTED');

-- AlterTable
ALTER TABLE "SongRequest" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KaraokeEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sessionId" TEXT,
    "tableId" TEXT,
    "type" "EventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "KaraokeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KaraokeEvent_businessId_type_occurredAt_idx" ON "KaraokeEvent"("businessId", "type", "occurredAt");

-- AddForeignKey
ALTER TABLE "KaraokeEvent" ADD CONSTRAINT "KaraokeEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

