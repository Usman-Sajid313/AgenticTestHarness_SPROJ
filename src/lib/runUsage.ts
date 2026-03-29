import { prisma } from "@/lib/prisma";
import { getRunBudgetConfig } from "@/lib/runBudgetValidator";

const DEFAULT_PANEL_MODEL_COUNT = 6;
const JUDGE_PROMPT_OVERHEAD_TOKENS = 2000;
const JUDGE_RESPONSE_TOKENS = 1500;

export type RunUsageSummary = {
  parseModelTokens: number;
  parseCostUsd: number;
  judgeModelTokens: number | null;
  judgeCostUsd: number | null;
  totalModelTokens: number | null;
  totalCostUsd: number | null;
  costPerMillionTokens: number;
  isEstimated: boolean;
  note: string;
};

export type RunUsageSummarySource = {
  judgePacket?: {
    packetSizeBytes: number;
  } | null;
  evaluation?: {
    geminiJudgement?: unknown;
  } | null;
  workspace?: {
    modelConfig?: {
      judgePanelModels?: string[];
      judgeVerifierModel?: string | null;
    } | null;
  } | null;
};

export async function getRunUsageSummary(runId: string): Promise<RunUsageSummary> {
  const config = getRunBudgetConfig();
  const costPerMillionTokens = config.costPerMillionTokens ?? 0.1;

  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: {
      judgePacket: {
        select: {
          packetSizeBytes: true,
        },
      },
      evaluations: {
        select: {
          geminiJudgement: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      project: {
        select: {
          workspace: {
            select: {
              modelConfig: {
                select: {
                  judgePanelModels: true,
                  judgeVerifierModel: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return buildRunUsageSummary(
    run
      ? {
          judgePacket: run.judgePacket,
          evaluation: run.evaluations[0] ?? null,
          workspace: run.project.workspace,
        }
      : null,
    costPerMillionTokens
  );
}

export function buildRunUsageSummary(
  run: RunUsageSummarySource | null | undefined,
  costPerMillionTokens = getRunBudgetConfig().costPerMillionTokens ?? 0.1
): RunUsageSummary {
  if (!run) {
    return {
      parseModelTokens: 0,
      parseCostUsd: 0,
      judgeModelTokens: null,
      judgeCostUsd: null,
      totalModelTokens: null,
      totalCostUsd: null,
      costPerMillionTokens,
      isEstimated: true,
      note: "Run not found.",
    };
  }

  const parseModelTokens = 0;
  const parseCostUsd = 0;
  const packetSizeBytes = run.judgePacket?.packetSizeBytes ?? null;

  if (packetSizeBytes == null) {
    return {
      parseModelTokens,
      parseCostUsd,
      judgeModelTokens: null,
      judgeCostUsd: null,
      totalModelTokens: null,
      totalCostUsd: null,
      costPerMillionTokens,
      isEstimated: true,
      note:
        "Parsing is in-process and uses 0 model tokens. Judge token/cost totals are shown after a judge packet exists.",
    };
  }

  const configuredPanelCount =
    run.workspace?.modelConfig?.judgePanelModels?.length ?? DEFAULT_PANEL_MODEL_COUNT;
  const configuredVerifierCount =
    run.workspace?.modelConfig?.judgeVerifierModel ? 1 : 1;
  const persistedJudgement = parseStoredJson(run.evaluation?.geminiJudgement);
  const persistedPanelCount = Array.isArray(persistedJudgement?.panel)
    ? persistedJudgement.panel.length
    : null;
  const panelModelCount = Math.max(configuredPanelCount, persistedPanelCount ?? 0);
  const totalJudgeCalls = panelModelCount + configuredVerifierCount;
  const packetTokens = Math.ceil(packetSizeBytes / 4);
  const judgeModelTokens =
    totalJudgeCalls *
    (JUDGE_PROMPT_OVERHEAD_TOKENS + packetTokens + JUDGE_RESPONSE_TOKENS);
  const judgeCostUsd = calculateUsd(judgeModelTokens, costPerMillionTokens);

  return {
    parseModelTokens,
    parseCostUsd,
    judgeModelTokens,
    judgeCostUsd,
    totalModelTokens: parseModelTokens + judgeModelTokens,
    totalCostUsd: roundUsd(parseCostUsd + judgeCostUsd),
    costPerMillionTokens,
    isEstimated: true,
    note:
      "Parsing runs in-process and uses 0 model tokens. Judge usage is estimated from the stored judge packet size and configured judge panel",
  };
}

function parseStoredJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function calculateUsd(tokens: number, costPerMillionTokens: number) {
  return roundUsd((tokens / 1_000_000) * costPerMillionTokens);
}

function roundUsd(value: number) {
  return Number(value.toFixed(6));
}
