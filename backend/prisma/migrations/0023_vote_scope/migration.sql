-- Modo competencia: SONG = puntaje por cancion; TABLE = acumulado por mesa durante la sesion
ALTER TABLE "Business" ADD COLUMN "voteScope" TEXT NOT NULL DEFAULT 'SONG';
