CREATE TABLE "WorkspaceModelConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "evaluatorProvider" TEXT NOT NULL DEFAULT 'gemini',
    "evaluatorModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "judgeProvider" TEXT NOT NULL DEFAULT 'groq',
    "judgePrimaryModel" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    "judgeVerifierModel" TEXT NOT NULL DEFAULT 'llama-3.1-8b-instant',
    "judgePanelModels" TEXT[] NOT NULL DEFAULT ARRAY[
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'groq/compound-mini',
        'groq/compound',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'qwen/qwen3-32b'
    ]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceModelConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceModelConfig_workspaceId_key" ON "WorkspaceModelConfig"("workspaceId");

CREATE INDEX "WorkspaceModelConfig_workspaceId_idx" ON "WorkspaceModelConfig"("workspaceId");

ALTER TABLE "WorkspaceModelConfig"
ADD CONSTRAINT "WorkspaceModelConfig_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
