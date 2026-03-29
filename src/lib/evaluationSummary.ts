export type DimensionResult = {
  score: number;
  summary?: string;
  strengths?: string;
  weaknesses?: string;
};

export type MetricBreakdown = {
  overallComment: string;
  dimensions: Record<string, DimensionResult>;
};

type ScorecardDimension = {
  score: number;
  reasoning?: string;
  strengths?: string[];
  weaknesses?: string[];
};

type FinalScorecardShape = {
  overallScore?: number;
  dimensions?: Record<string, ScorecardDimension>;
  strengths?: string[];
  weaknesses?: string[];
};

type EvaluationLike = {
  summary?: string | null;
  metricBreakdown?: unknown;
  finalScorecard?: unknown;
};

export function resolveMetricBreakdown(
  evaluation: EvaluationLike | null | undefined
): MetricBreakdown | null {
  if (!evaluation) return null;

  const persisted = parseMetricBreakdown(evaluation.metricBreakdown);
  if (persisted && Object.keys(persisted.dimensions).length > 0) {
    return persisted;
  }

  return deriveMetricBreakdownFromScorecard(
    evaluation.summary ?? null,
    evaluation.finalScorecard
  );
}

function parseMetricBreakdown(value: unknown): MetricBreakdown | null {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const candidate = parsed as {
      overallComment?: unknown;
      dimensions?: Record<string, DimensionResult>;
    };

    return {
      overallComment:
        typeof candidate.overallComment === "string"
          ? candidate.overallComment
          : "",
      dimensions:
        candidate.dimensions && typeof candidate.dimensions === "object"
          ? candidate.dimensions
          : {},
    };
  } catch {
    return null;
  }
}

function deriveMetricBreakdownFromScorecard(
  summary: string | null,
  finalScorecard: unknown
): MetricBreakdown | null {
  const scorecard = parseFinalScorecard(finalScorecard);
  if (!scorecard) return null;

  const dimensions: Record<string, DimensionResult> = {};

  for (const [key, rawDimension] of Object.entries(scorecard.dimensions ?? {})) {
    dimensions[key] = {
      score: rawDimension.score,
      summary: rawDimension.reasoning,
      strengths:
        rawDimension.strengths && rawDimension.strengths.length > 0
          ? rawDimension.strengths.join("; ")
          : undefined,
      weaknesses:
        rawDimension.weaknesses && rawDimension.weaknesses.length > 0
          ? rawDimension.weaknesses.join("; ")
          : undefined,
    };
  }

  const overallScoreText =
    typeof scorecard.overallScore === "number"
      ? `Score: ${scorecard.overallScore}/100. `
      : "";

  return {
    overallComment:
      summary ||
      `${overallScoreText}${
        scorecard.strengths?.length
          ? `Strengths: ${scorecard.strengths.join("; ")}. `
          : ""
      }${
        scorecard.weaknesses?.length
          ? `Areas for improvement: ${scorecard.weaknesses.join("; ")}.`
          : ""
      }`.trim(),
    dimensions,
  };
}

function parseFinalScorecard(value: unknown): FinalScorecardShape | null {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as FinalScorecardShape;
  } catch {
    return null;
  }
}
