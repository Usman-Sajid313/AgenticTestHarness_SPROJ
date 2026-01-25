-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "testSuiteId" TEXT,
    "triggeredById" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "taskName" TEXT,
    "taskDefinition" JSONB,
    "inputPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunLogfile" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "RunLogfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvaluation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "testSuiteId" TEXT,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "totalScore" DOUBLE PRECISION,
    "metricBreakdown" JSONB,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_projectId_idx" ON "AgentRun"("projectId");

-- CreateIndex
CREATE INDEX "AgentRun_testSuiteId_idx" ON "AgentRun"("testSuiteId");

-- CreateIndex
CREATE INDEX "AgentRun_triggeredById_idx" ON "AgentRun"("triggeredById");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE INDEX "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");

-- CreateIndex
CREATE INDEX "RunLogfile_runId_idx" ON "RunLogfile"("runId");

-- CreateIndex
CREATE INDEX "RunLogfile_projectId_idx" ON "RunLogfile"("projectId");

-- CreateIndex
CREATE INDEX "RunLogfile_uploadedById_idx" ON "RunLogfile"("uploadedById");

-- CreateIndex
CREATE INDEX "RunEvaluation_runId_idx" ON "RunEvaluation"("runId");

-- CreateIndex
CREATE INDEX "RunEvaluation_projectId_idx" ON "RunEvaluation"("projectId");

-- CreateIndex
CREATE INDEX "RunEvaluation_testSuiteId_idx" ON "RunEvaluation"("testSuiteId");

-- CreateIndex
CREATE INDEX "RunEvaluation_status_idx" ON "RunEvaluation"("status");

-- CreateIndex
CREATE INDEX "RunEvaluation_createdAt_idx" ON "RunEvaluation"("createdAt");

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- CreateIndex
CREATE INDEX "Project_isArchived_idx" ON "Project"("isArchived");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunLogfile" ADD CONSTRAINT "RunLogfile_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunLogfile" ADD CONSTRAINT "RunLogfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunLogfile" ADD CONSTRAINT "RunLogfile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvaluation" ADD CONSTRAINT "RunEvaluation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvaluation" ADD CONSTRAINT "RunEvaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvaluation" ADD CONSTRAINT "RunEvaluation_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
