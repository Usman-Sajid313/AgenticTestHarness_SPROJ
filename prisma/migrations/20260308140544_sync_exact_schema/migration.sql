-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "RunStatus" ADD VALUE 'CREATED';
ALTER TYPE "RunStatus" ADD VALUE 'UPLOADING';
ALTER TYPE "RunStatus" ADD VALUE 'UPLOADED';
ALTER TYPE "RunStatus" ADD VALUE 'PARSING';
ALTER TYPE "RunStatus" ADD VALUE 'READY_FOR_JUDGING';
ALTER TYPE "RunStatus" ADD VALUE 'JUDGING';
ALTER TYPE "RunStatus" ADD VALUE 'COMPLETED_LOW_CONFIDENCE';
