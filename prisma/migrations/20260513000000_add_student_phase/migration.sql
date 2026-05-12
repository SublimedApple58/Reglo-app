-- CreateEnum
CREATE TYPE "AutoscuolaStudentPhase" AS ENUM ('TEORIA', 'PRATICA', 'PATENTATO');

-- AlterTable
ALTER TABLE "CompanyMember" ADD COLUMN     "studentPhase" "AutoscuolaStudentPhase" NOT NULL DEFAULT 'PRATICA';
