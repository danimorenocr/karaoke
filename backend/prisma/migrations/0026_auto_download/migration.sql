-- Descarga automatica (agente local + yt-dlp) de videos que YouTube no deja incrustar
ALTER TABLE "Business" ADD COLUMN "autoDownload" BOOLEAN NOT NULL DEFAULT true;
