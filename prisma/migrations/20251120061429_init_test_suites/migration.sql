-- CreateTable
CREATE TABLE "TestSuite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "corePrompt" TEXT NOT NULL,
    "toolIds" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB,
    "variables" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestSuite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestSuite_workspaceId_idx" ON "TestSuite"("workspaceId");

-- AddForeignKey
ALTER TABLE "TestSuite" ADD CONSTRAINT "TestSuite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
