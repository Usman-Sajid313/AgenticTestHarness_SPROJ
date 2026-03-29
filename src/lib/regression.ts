import type { RunUsageSummary } from "@/lib/runUsage";
import { resolveMetricBreakdown } from "@/lib/evaluationSummary";

export type RegressionScope = "project" | "suite";
export type RegressionVerdict =
  | "IMPROVED"
  | "REGRESSED"
  | "WITHIN_NOISE";

export type RegressionConfig = {
  maxDimensionDrop: number;
  maxCostIncreasePct: number;
  blockErrorIncrease: boolean;
  blockRetryIncrease: boolean;
  noiseThreshold: number;
};

export type RegressionMetricDelta = {
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type RegressionDimensionDelta = {
  key: string;
  label: string;
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
};

export type RegressionGateResult = {
  key: "dimension_drop" | "cost_increase" | "error_increase" | "retry_increase";
  label: string;
  passed: boolean;
  detail: string;
};

export type RegressionAssessment = {
  verdict: RegressionVerdict;
  summary: string;
  gatePassed: boolean;
  deltas: {
    overallScore: RegressionMetricDelta;
    totalErrors: RegressionMetricDelta;
    totalRetries: RegressionMetricDelta;
    totalDurationMs: RegressionMetricDelta;
    totalModelTokens: RegressionMetricDelta;
    totalCostUsd: RegressionMetricDelta;
  };
  dimensionDeltas: RegressionDimensionDelta[];
  gateResults: RegressionGateResult[];
};

export type RegressionBaselineSummary = {
  runId: string;
  createdAt: string;
  totalScore: number | null;
};

export type RegressionContext = {
  scope: RegressionScope;
  scopeId: string;
  scopeName: string;
  config: RegressionConfig;
  baseline: RegressionBaselineSummary | null;
  isBaselineRun: boolean;
  assessment: RegressionAssessment | null;
};

type EvaluationLike = {
  totalScore?: number | null;
  summary?: string | null;
  metricBreakdown?: unknown;
  finalScorecard?: unknown;
};

type MetricsLike = {
  totalErrors?: number | null;
  totalRetries?: number | null;
  totalDurationMs?: number | null;
};

type ComparableRunInput = {
  id: string;
  createdAt?: Date | string;
  evaluation: EvaluationLike | null;
  metrics: MetricsLike | null;
  usageSummary: RunUsageSummary | null;
};

const DEFAULT_CONFIG: RegressionConfig = {
  maxDimensionDrop: 5,
  maxCostIncreasePct: 20,
  blockErrorIncrease: true,
  blockRetryIncrease: true,
  noiseThreshold: 2,
};

export function resolveRegressionConfig(value: unknown): RegressionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_CONFIG;
  }

  const raw = value as Record<string, unknown>;

  return {
    maxDimensionDrop: coerceNumber(raw.maxDimensionDrop, DEFAULT_CONFIG.maxDimensionDrop),
    maxCostIncreasePct: coerceNumber(
      raw.maxCostIncreasePct,
      DEFAULT_CONFIG.maxCostIncreasePct
    ),
    blockErrorIncrease: coerceBoolean(
      raw.blockErrorIncrease,
      DEFAULT_CONFIG.blockErrorIncrease
    ),
    blockRetryIncrease: coerceBoolean(
      raw.blockRetryIncrease,
      DEFAULT_CONFIG.blockRetryIncrease
    ),
    noiseThreshold: coerceNumber(raw.noiseThreshold, DEFAULT_CONFIG.noiseThreshold),
  };
}

export function buildRegressionContext(args: {
  scope: RegressionScope;
  scopeId: string;
  scopeName: string;
  config: unknown;
  baselineRun: ComparableRunInput | null;
  candidateRun: ComparableRunInput;
}): RegressionContext {
  const config = resolveRegressionConfig(args.config);
  const baseline = args.baselineRun
    ? {
        runId: args.baselineRun.id,
        createdAt: toIsoString(args.baselineRun.createdAt),
        totalScore: args.baselineRun.evaluation?.totalScore ?? null,
      }
    : null;

  if (!args.baselineRun) {
    return {
      scope: args.scope,
      scopeId: args.scopeId,
      scopeName: args.scopeName,
      config,
      baseline,
      isBaselineRun: false,
      assessment: null,
    };
  }

  if (args.baselineRun.id === args.candidateRun.id) {
    return {
      scope: args.scope,
      scopeId: args.scopeId,
      scopeName: args.scopeName,
      config,
      baseline,
      isBaselineRun: true,
      assessment: null,
    };
  }

  return {
    scope: args.scope,
    scopeId: args.scopeId,
    scopeName: args.scopeName,
    config,
    baseline,
    isBaselineRun: false,
    assessment: evaluateRegression({
      baselineRun: args.baselineRun,
      candidateRun: args.candidateRun,
      config,
    }),
  };
}

function evaluateRegression(args: {
  baselineRun: ComparableRunInput;
  candidateRun: ComparableRunInput;
  config: RegressionConfig;
}): RegressionAssessment | null {
  const baseline = toComparableSnapshot(args.baselineRun);
  const candidate = toComparableSnapshot(args.candidateRun);

  if (!baseline || !candidate) {
    return null;
  }

  const overallScore = buildDelta(baseline.totalScore, candidate.totalScore);
  const totalErrors = buildDelta(baseline.totalErrors, candidate.totalErrors);
  const totalRetries = buildDelta(baseline.totalRetries, candidate.totalRetries);
  const totalDurationMs = buildDelta(
    baseline.totalDurationMs,
    candidate.totalDurationMs
  );
  const totalModelTokens = buildDelta(
    baseline.totalModelTokens,
    candidate.totalModelTokens
  );
  const totalCostUsd = buildDelta(baseline.totalCostUsd, candidate.totalCostUsd);

  const dimensionKeys = Array.from(
    new Set([
      ...Object.keys(baseline.dimensionScores),
      ...Object.keys(candidate.dimensionScores),
    ])
  ).sort();

  const dimensionDeltas = dimensionKeys.map((key) => {
    const baselineScore = baseline.dimensionScores[key] ?? null;
    const candidateScore = candidate.dimensionScores[key] ?? null;
    return {
      key,
      label: humanizeKey(key),
      baseline: baselineScore,
      candidate: candidateScore,
      delta:
        baselineScore != null && candidateScore != null
          ? roundMetric(candidateScore - baselineScore)
          : null,
    };
  });

  const worstDimensionDrop =
    dimensionDeltas
      .map((entry) => entry.delta)
      .filter((entry): entry is number => entry != null)
      .reduce<number | null>(
        (worst, entry) => (worst == null ? entry : Math.min(worst, entry)),
        null
      ) ?? null;

  const gateResults: RegressionGateResult[] = [
    {
      key: "dimension_drop",
      label: `No dimension drops by more than ${args.config.maxDimensionDrop}`,
      passed:
        worstDimensionDrop == null || worstDimensionDrop >= -args.config.maxDimensionDrop,
      detail:
        worstDimensionDrop == null
          ? "No comparable dimension scores."
          : `Worst dimension delta ${formatSignedNumber(worstDimensionDrop)}.`,
    },
    {
      key: "cost_increase",
      label: `Cost increase stays within ${args.config.maxCostIncreasePct}%`,
      passed:
        totalCostUsd.deltaPct == null ||
        totalCostUsd.deltaPct <= args.config.maxCostIncreasePct,
      detail:
        totalCostUsd.deltaPct == null
          ? "No comparable cost estimate."
          : `Cost change ${formatSignedPercent(totalCostUsd.deltaPct)}.`,
    },
    {
      key: "error_increase",
      label: "Error count cannot increase",
      passed:
        !args.config.blockErrorIncrease ||
        totalErrors.delta == null ||
        totalErrors.delta <= 0,
      detail:
        totalErrors.delta == null
          ? "No comparable error totals."
          : `Error delta ${formatSignedNumber(totalErrors.delta)}.`,
    },
    {
      key: "retry_increase",
      label: "Retry count cannot increase",
      passed:
        !args.config.blockRetryIncrease ||
        totalRetries.delta == null ||
        totalRetries.delta <= 0,
      detail:
        totalRetries.delta == null
          ? "No comparable retry totals."
          : `Retry delta ${formatSignedNumber(totalRetries.delta)}.`,
    },
  ];

  const gatePassed = gateResults.every((gate) => gate.passed);
  const improvedByScore =
    (overallScore.delta ?? 0) > args.config.noiseThreshold ||
    dimensionDeltas.some((entry) => (entry.delta ?? 0) > args.config.noiseThreshold);
  const regressedByScore =
    (overallScore.delta ?? 0) < -args.config.noiseThreshold ||
    dimensionDeltas.some((entry) => (entry.delta ?? 0) < -args.config.noiseThreshold);

  const verdict: RegressionVerdict = !gatePassed
    ? "REGRESSED"
    : regressedByScore
    ? "REGRESSED"
    : improvedByScore
    ? "IMPROVED"
    : "WITHIN_NOISE";

  return {
    verdict,
    summary: buildSummary(verdict, overallScore.delta),
    gatePassed,
    deltas: {
      overallScore,
      totalErrors,
      totalRetries,
      totalDurationMs,
      totalModelTokens,
      totalCostUsd,
    },
    dimensionDeltas,
    gateResults,
  };
}

function toComparableSnapshot(
  input: ComparableRunInput
): {
  totalScore: number | null;
  dimensionScores: Record<string, number>;
  totalErrors: number | null;
  totalRetries: number | null;
  totalDurationMs: number | null;
  totalModelTokens: number | null;
  totalCostUsd: number | null;
} | null {
  const breakdown = resolveMetricBreakdown(input.evaluation);

  return {
    totalScore: input.evaluation?.totalScore ?? null,
    dimensionScores: Object.fromEntries(
      Object.entries(breakdown?.dimensions ?? {}).map(([key, value]) => [
        key,
        value.score,
      ])
    ),
    totalErrors: input.metrics?.totalErrors ?? null,
    totalRetries: input.metrics?.totalRetries ?? null,
    totalDurationMs: input.metrics?.totalDurationMs ?? null,
    totalModelTokens: input.usageSummary?.totalModelTokens ?? null,
    totalCostUsd: input.usageSummary?.totalCostUsd ?? null,
  };
}

function buildDelta(
  baseline: number | null,
  candidate: number | null
): RegressionMetricDelta {
  if (baseline == null || candidate == null) {
    return {
      baseline,
      candidate,
      delta: null,
      deltaPct: null,
    };
  }

  const delta = roundMetric(candidate - baseline);
  const deltaPct =
    baseline === 0 ? (candidate === 0 ? 0 : null) : roundMetric((delta / baseline) * 100);

  return {
    baseline,
    candidate,
    delta,
    deltaPct,
  };
}

function buildSummary(
  verdict: RegressionVerdict,
  overallDelta: number | null
): string {
  const overallText =
    overallDelta == null
      ? "overall score delta unavailable"
      : `overall ${formatSignedNumber(overallDelta)} pts`;

  if (verdict === "IMPROVED") {
    return `Improved against baseline with ${overallText}.`;
  }

  if (verdict === "REGRESSED") {
    return `Regressed against baseline with ${overallText}.`;
  }

  return `Within noise against baseline with ${overallText}.`;
}

function coerceNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function toIsoString(value: Date | string | undefined) {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function humanizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${roundMetric(value)}`;
}

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${roundMetric(value)}%`;
}
