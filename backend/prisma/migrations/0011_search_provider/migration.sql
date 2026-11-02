CREATE TYPE "SearchProvider" AS ENUM ('YOUTUBE', 'GOOGLE');

ALTER TABLE "Business" ADD COLUMN "searchProvider" "SearchProvider" NOT NULL DEFAULT 'YOUTUBE';
