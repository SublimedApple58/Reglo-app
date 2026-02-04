-- CreateEnum
CREATE TYPE "AutoscuolaRole" AS ENUM ('OWNER', 'INSTRUCTOR', 'STUDENT');

-- AlterTable
ALTER TABLE "CompanyMember"
ADD COLUMN     "autoscuolaRole" "AutoscuolaRole" NOT NULL DEFAULT 'STUDENT';

-- Backfill existing members
UPDATE "CompanyMember"
SET "autoscuolaRole" = 'OWNER'
WHERE "role" = 'admin';
