-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "rubricId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE "RunEvaluation" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "finalScorecard" JSONB,
ADD COLUMN     "geminiJudgement" JSONB,
ADD COLUMN     "groqJudgement" JSONB;

-- AlterTable
ALTER TABLE "TestSuite" ADD COLUMN     "rubricId" TEXT;

-- CreateTable
CREATE TABLE "EvaluationRubric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dimensions" JSONB NOT NULL,
    "weights" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunTraceSummary" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "normalizedTrace" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "parseReport" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunTraceSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunMetrics" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "totalSteps" INTEGER NOT NULL,
    "totalToolCalls" INTEGER NOT NULL,
    "totalErrors" INTEGER NOT NULL,
    "totalRetries" INTEGER NOT NULL,
    "totalDurationMs" INTEGER,
    "parserVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunRuleFlag" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "flagType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "evidenceEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunRuleFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunJudgePacket" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "packet" TEXT NOT NULL,
    "packetSizeBytes" INTEGER NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "rubricVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunJudgePacket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationRubric_workspaceId_idx" ON "EvaluationRubric"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRubric_workspaceId_name_key" ON "EvaluationRubric"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "RunEvent_runId_idx" ON "RunEvent"("runId");

-- CreateIndex
CREATE INDEX "RunEvent_runId_sequence_idx" ON "RunEvent"("runId", "sequence");

-- CreateIndex
CREATE INDEX "RunEvent_eventType_idx" ON "RunEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "RunTraceSummary_runId_key" ON "RunTraceSummary"("runId");

-- CreateIndex
CREATE INDEX "RunTraceSummary_runId_idx" ON "RunTraceSummary"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "RunMetrics_runId_key" ON "RunMetrics"("runId");

-- CreateIndex
CREATE INDEX "RunMetrics_runId_idx" ON "RunMetrics"("runId");

-- CreateIndex
CREATE INDEX "RunRuleFlag_runId_idx" ON "RunRuleFlag"("runId");

-- CreateIndex
CREATE INDEX "RunRuleFlag_flagType_idx" ON "RunRuleFlag"("flagType");

-- CreateIndex
CREATE INDEX "RunRuleFlag_severity_idx" ON "RunRuleFlag"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "RunJudgePacket_runId_key" ON "RunJudgePacket"("runId");

-- CreateIndex
CREATE INDEX "RunJudgePacket_runId_idx" ON "RunJudgePacket"("runId");

-- CreateIndex
CREATE INDEX "AgentRun_rubricId_idx" ON "AgentRun"("rubricId");

-- CreateIndex
CREATE INDEX "TestSuite_rubricId_idx" ON "TestSuite"("rubricId");

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "EvaluationRubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRubric" ADD CONSTRAINT "EvaluationRubric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "EvaluationRubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunTraceSummary" ADD CONSTRAINT "RunTraceSummary_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunMetrics" ADD CONSTRAINT "RunMetrics_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunRuleFlag" ADD CONSTRAINT "RunRuleFlag_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunJudgePacket" ADD CONSTRAINT "RunJudgePacket_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
