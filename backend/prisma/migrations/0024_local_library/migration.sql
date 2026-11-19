-- Biblioteca local: videos del PC del bar servidos por el agente
ALTER TABLE "Business" ADD COLUMN "agentToken" TEXT;
CREATE UNIQUE INDEX "Business_agentToken_key" ON "Business"("agentToken");
ALTER TABLE "SongRequest" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'YOUTUBE';
