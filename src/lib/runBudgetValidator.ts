import { prisma } from '@/lib/prisma';

/**
 * Configuration for run budget limits
 * These can be configured per project or workspace
 */
export interface RunBudgetConfig {
  /** Maximum budget for judge operations (in USD) */
  maxJudgeBudget?: number;
  /** Maximum budget for parse operations (in USD) */
  maxParseBudget?: number;
  /** Cost per million tokens (in USD) */
  costPerMillionTokens?: number;
}

/**
 * Default budget limits for different operations
 */
const DEFAULT_JUDGE_BUDGET = 2.0; // $2 per judge operation
const DEFAULT_PARSE_BUDGET = 1.0; // $1 per parse operation
const DEFAULT_COST_PER_MILLION = 0.1; // $0.10 per million tokens

/**
 * Get budget configuration from environment or use defaults
 */
export function getRunBudgetConfig(): RunBudgetConfig {
  return {
    maxJudgeBudget: process.env.MAX_JUDGE_BUDGET 
      ? parseFloat(process.env.MAX_JUDGE_BUDGET) 
      : DEFAULT_JUDGE_BUDGET,
    maxParseBudget: process.env.MAX_PARSE_BUDGET 
      ? parseFloat(process.env.MAX_PARSE_BUDGET) 
      : DEFAULT_PARSE_BUDGET,
    costPerMillionTokens: process.env.MODEL_COST_PER_MILLION_TOKENS
      ? parseFloat(process.env.MODEL_COST_PER_MILLION_TOKENS)
      : DEFAULT_COST_PER_MILLION,
  };
}

/**
 * Estimate tokens for a judge operation
 * This is a rough estimate based on typical judge packet sizes
 */
function estimateJudgeTokens(run: {
  taskDefinition?: unknown;
  inputPayload?: unknown;
}): number {
  // Estimate based on typical judge packet size
  // Judge packets typically include system prompt, run data, and expected response
  const baseJudgePrompt = 2000; // Base system prompt and instructions
  const taskSize = run.taskDefinition 
    ? JSON.stringify(run.taskDefinition).length / 4 // Rough token estimate
    : 500;
  const payloadSize = run.inputPayload
    ? JSON.stringify(run.inputPayload).length / 4
    : 500;
  const expectedResponse = 1500; // Expected response size for scorecard
  
  return Math.ceil(baseJudgePrompt + taskSize + payloadSize + expectedResponse);
}

/**
 * Estimate tokens for a parse operation
 */
function estimateParseTokens(logfileSize?: number): number {
  // Parse operations analyze log files
  const baseParsePrompt = 1500; // Base system prompt
  const logAnalysis = logfileSize 
    ? Math.min(logfileSize / 4, 10000) // Cap at 10k tokens for log content
    : 3000;
  const expectedResponse = 2000; // Expected response size for parsed events
  
  return Math.ceil(baseParsePrompt + logAnalysis + expectedResponse);
}

/**
 * Calculate estimated cost based on tokens
 */
function calculateCost(tokens: number, costPerMillion: number): number {
  return Number(((tokens / 1_000_000) * costPerMillion).toFixed(6));
}

/**
 * Validate if a judge operation can proceed within budget
 */
export async function validateJudgeBudget(runId: string): Promise<{
  allowed: boolean;
  estimatedCost: number;
  estimatedTokens: number;
  budgetLimit: number;
  reason?: string;
}> {
  const config = getRunBudgetConfig();
  const budgetLimit = config.maxJudgeBudget ?? DEFAULT_JUDGE_BUDGET;

  try {
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      select: {
        taskDefinition: true,
        inputPayload: true,
      },
    });

    if (!run) {
      return {
        allowed: false,
        estimatedCost: 0,
        estimatedTokens: 0,
        budgetLimit,
        reason: 'Run not found',
      };
    }

    const estimatedTokens = estimateJudgeTokens(run);
    const estimatedCost = calculateCost(
      estimatedTokens, 
      config.costPerMillionTokens ?? DEFAULT_COST_PER_MILLION
    );

    if (estimatedCost > budgetLimit) {
      return {
        allowed: false,
        estimatedCost,
        estimatedTokens,
        budgetLimit,
        reason: `Estimated cost ($${estimatedCost.toFixed(4)}) exceeds judge budget limit ($${budgetLimit.toFixed(2)})`,
      };
    }

    return {
      allowed: true,
      estimatedCost,
      estimatedTokens,
      budgetLimit,
    };
  } catch (error) {
    console.error('Error validating judge budget:', error);
    return {
      allowed: false,
      estimatedCost: 0,
      estimatedTokens: 0,
      budgetLimit,
      reason: `Budget validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validate if a parse operation can proceed within budget
 */
export async function validateParseBudget(runId: string): Promise<{
  allowed: boolean;
  estimatedCost: number;
  estimatedTokens: number;
  budgetLimit: number;
  reason?: string;
}> {
  const config = getRunBudgetConfig();
  const budgetLimit = config.maxParseBudget ?? DEFAULT_PARSE_BUDGET;

  try {
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      include: {
        logfiles: {
          select: {
            sizeBytes: true,
          },
        },
      },
    });

    if (!run) {
      return {
        allowed: false,
        estimatedCost: 0,
        estimatedTokens: 0,
        budgetLimit,
        reason: 'Run not found',
      };
    }

    const logfileSize = run.logfiles?.[0]?.sizeBytes;
    const estimatedTokens = estimateParseTokens(logfileSize);
    const estimatedCost = calculateCost(
      estimatedTokens,
      config.costPerMillionTokens ?? DEFAULT_COST_PER_MILLION
    );

    if (estimatedCost > budgetLimit) {
      return {
        allowed: false,
        estimatedCost,
        estimatedTokens,
        budgetLimit,
        reason: `Estimated cost ($${estimatedCost.toFixed(4)}) exceeds parse budget limit ($${budgetLimit.toFixed(2)})`,
      };
    }

    return {
      allowed: true,
      estimatedCost,
      estimatedTokens,
      budgetLimit,
    };
  } catch (error) {
    console.error('Error validating parse budget:', error);
    return {
      allowed: false,
      estimatedCost: 0,
      estimatedTokens: 0,
      budgetLimit,
      reason: `Budget validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
