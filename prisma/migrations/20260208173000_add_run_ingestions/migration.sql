-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('CREATED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "RunIngestion" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "formatHint" TEXT,
    "mappingConfig" JSONB,
    "fileRef" TEXT,
    "parserVersion" TEXT,
    "parserConfidence" DOUBLE PRECISION,
    "strictReport" JSONB,
    "sourceMeta" JSONB,
    "status" "IngestionStatus" NOT NULL DEFAULT 'CREATED',
    "failureDetails" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunIngestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RunIngestion" ADD CONSTRAINT "RunIngestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunIngestion" ADD CONSTRAINT "RunIngestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "RunIngestion_runId_idx" ON "RunIngestion"("runId");

-- CreateIndex
CREATE INDEX "RunIngestion_projectId_idx" ON "RunIngestion"("projectId");

-- CreateIndex
CREATE INDEX "RunIngestion_status_idx" ON "RunIngestion"("status");

-- CreateIndex
CREATE INDEX "RunIngestion_createdAt_idx" ON "RunIngestion"("createdAt");
