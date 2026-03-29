-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "baselineRunId" TEXT,
ADD COLUMN     "regressionConfig" JSONB;

-- AlterTable
ALTER TABLE "TestSuite" ADD COLUMN     "baselineRunId" TEXT,
ADD COLUMN     "regressionConfig" JSONB;

-- AlterTable
ALTER TABLE "WorkspaceModelConfig" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Project_baselineRunId_idx" ON "Project"("baselineRunId");

-- CreateIndex
CREATE INDEX "TestSuite_baselineRunId_idx" ON "TestSuite"("baselineRunId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_baselineRunId_fkey" FOREIGN KEY ("baselineRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_baselineRunId_fkey" FOREIGN KEY ("baselineRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
