ALTER TABLE "Business" ADD COLUMN "voteMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "voteSec" INTEGER NOT NULL DEFAULT 15;

CREATE TABLE "SongVote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SongVote_requestId_clientId_key" ON "SongVote"("requestId", "clientId");
CREATE INDEX "SongVote_businessId_createdAt_idx" ON "SongVote"("businessId", "createdAt");

ALTER TABLE "SongVote" ADD CONSTRAINT "SongVote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongVote" ADD CONSTRAINT "SongVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SongRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La funcionalidad "voting" queda habilitada en los planes existentes
UPDATE "Plan" SET "perks" = array_append("perks", 'voting') WHERE NOT ('voting' = ANY("perks"));
