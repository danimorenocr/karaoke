-- CreateEnum
CREATE TYPE "SearchMode" AS ENUM ('KARAOKE', 'ANY');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "searchMode" "SearchMode" NOT NULL DEFAULT 'KARAOKE';
