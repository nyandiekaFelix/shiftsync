-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT';
