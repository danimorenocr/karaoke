ALTER TABLE "Plan" ADD COLUMN "perks" TEXT[];

-- Los planes existentes arrancan con todas las funcionalidades habilitadas
UPDATE "Plan" SET "perks" = ARRAY['stats','history','staff','branding','tvBanner','designs','autoApprove','searchAny','autoDj'];
