-- Cuenta regresiva al vaciarse la cola: pasados N segundos sin canciones, las nuevas esperan al boton del DJ
ALTER TABLE "Business" ADD COLUMN "queueResumeSec" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "KaraokeSession" ADD COLUMN "queueEmptyAt" TIMESTAMP(3);
