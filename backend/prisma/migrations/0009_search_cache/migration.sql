CREATE TABLE "SearchCache" (
    "key" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "SearchCache_updatedAt_idx" ON "SearchCache"("updatedAt");
