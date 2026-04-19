import "server-only";

import { prisma } from "@/lib/prisma";

export const DEFAULT_EVALUATOR_PROVIDER = "gemini";
export const DEFAULT_EVALUATOR_MODEL = "gemini-2.5-flash";
export const DEFAULT_JUDGE_PROVIDER = "groq";
export const DEFAULT_JUDGE_PRIMARY_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_JUDGE_VERIFIER_MODEL = "llama-3.1-8b-instant";
export const DEFAULT_JUDGE_PANEL_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "groq/compound-mini",
  "groq/compound",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
] as const;

export type WorkspaceModelConfigValues = {
  evaluatorProvider: string;
  evaluatorModel: string;
  judgeProvider: string;
  judgePrimaryModel: string;
  judgeVerifierModel: string;
  judgePanelModels: string[];
};

export type EffectiveWorkspaceModelConfig = WorkspaceModelConfigValues & {
  source: "default" | "workspace";
  isCustomized: boolean;
};

export function getDefaultWorkspaceModelConfig(): WorkspaceModelConfigValues {
  return {
    evaluatorProvider: DEFAULT_EVALUATOR_PROVIDER,
    evaluatorModel: DEFAULT_EVALUATOR_MODEL,
    judgeProvider: DEFAULT_JUDGE_PROVIDER,
    judgePrimaryModel: DEFAULT_JUDGE_PRIMARY_MODEL,
    judgeVerifierModel: DEFAULT_JUDGE_VERIFIER_MODEL,
    judgePanelModels: [...DEFAULT_JUDGE_PANEL_MODELS],
  };
}

export async function resolveWorkspaceModelConfig(
  workspaceId?: string | null
): Promise<EffectiveWorkspaceModelConfig> {
  const defaults = getDefaultWorkspaceModelConfig();

  if (!workspaceId) {
    return {
      ...defaults,
      source: "default",
      isCustomized: false,
    };
  }

  const savedConfig = await prisma.workspaceModelConfig.findUnique({
    where: { workspaceId },
    select: {
      evaluatorProvider: true,
      evaluatorModel: true,
      judgeProvider: true,
      judgePrimaryModel: true,
      judgeVerifierModel: true,
      judgePanelModels: true,
    },
  });

  if (!savedConfig) {
    return {
      ...defaults,
      source: "default",
      isCustomized: false,
    };
  }

  const judgePanelModels = savedConfig.judgePanelModels.filter(
    (modelId: string) => modelId.trim().length > 0
  );

  return {
    evaluatorProvider: savedConfig.evaluatorProvider || defaults.evaluatorProvider,
    evaluatorModel: savedConfig.evaluatorModel || defaults.evaluatorModel,
    judgeProvider: savedConfig.judgeProvider || defaults.judgeProvider,
    judgePrimaryModel: savedConfig.judgePrimaryModel || defaults.judgePrimaryModel,
    judgeVerifierModel: savedConfig.judgeVerifierModel || defaults.judgeVerifierModel,
    judgePanelModels:
      judgePanelModels.length > 0 ? judgePanelModels : [...defaults.judgePanelModels],
    source: "workspace",
    isCustomized: true,
  };
}

export async function getWorkspaceIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });

  return membership?.workspaceId ?? null;
}
