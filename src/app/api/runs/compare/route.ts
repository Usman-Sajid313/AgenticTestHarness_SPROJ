import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json(
      { error: "ids parameter is required" },
      { status: 400 }
    );
  }

  const runIds = idsParam.split(",").filter((id) => id.trim());

  if (runIds.length < 2) {
    return NextResponse.json(
      { error: "At least 2 run IDs are required for comparison" },
      { status: 400 }
    );
  }

  if (runIds.length > 4) {
    return NextResponse.json(
      { error: "Maximum 4 runs can be compared at once" },
      { status: 400 }
    );
  }

  try {
    // Fetch runs with evaluations, metrics, and tool calls
    const runs = await prisma.agentRun.findMany({
      where: {
        id: { in: runIds },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
          },
        },
        evaluations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        metrics: true,
        traceSummary: true,
        ruleFlags: {
          orderBy: { severity: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Verify user has access to all runs (via workspace membership)
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 403 }
      );
    }

    // Check all runs belong to user's workspace
    const invalidRuns = runs.filter(
      (run) => run.project?.workspaceId !== membership.workspaceId
    );
    if (invalidRuns.length > 0) {
      return NextResponse.json(
        { error: "Access denied to some runs" },
        { status: 403 }
      );
    }

    if (runs.length !== runIds.length) {
      return NextResponse.json(
        {
          error: "Some runs not found",
          found: runs.length,
          requested: runIds.length,
        },
        { status: 404 }
      );
    }

    // Extract and structure comparison data (derive metricBreakdown from finalScorecard when missing)
    const comparison = runs.map((run) => {
      const evaluation = run.evaluations[0] || null;
      let metricBreakdown = evaluation?.metricBreakdown as
        | {
            overallComment?: string;
            dimensions?: Record<
              string,
              {
                score: number;
                summary?: string;
                strengths?: string;
                weaknesses?: string;
              }
            >;
          }
        | null;

      if (evaluation && (!metricBreakdown?.dimensions || Object.keys(metricBreakdown.dimensions || {}).length === 0) && evaluation.finalScorecard) {
        metricBreakdown = deriveMetricBreakdownFromScorecard(evaluation);
      }

      return {
        id: run.id,
        projectId: run.projectId,
        projectName: run.project?.name,
        status: run.status,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        evaluation: evaluation
          ? {
              id: evaluation.id,
              status: evaluation.status,
              totalScore: evaluation.totalScore,
              confidence: evaluation.confidence,
              summary: evaluation.summary,
              metricBreakdown,
            }
          : null,
        metrics: run.metrics
          ? {
              totalSteps: run.metrics.totalSteps,
              totalToolCalls: run.metrics.totalToolCalls,
              totalErrors: run.metrics.totalErrors,
              totalRetries: run.metrics.totalRetries,
              totalDurationMs: run.metrics.totalDurationMs,
            }
          : null,
        ruleFlags: run.ruleFlags.map((flag) => ({
          flagType: flag.flagType,
          severity: flag.severity,
          message: flag.message,
        })),
      };
    });

    // Compute comparison insights
    const dimensionComparison = computeDimensionComparison(comparison);
    const metricComparison = computeMetricComparison(comparison);

    return NextResponse.json({
      runs: comparison,
      dimensionComparison,
      metricComparison,
      comparedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Comparison error:", error);
    return NextResponse.json(
      {
        error: "Failed to compare runs",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function deriveMetricBreakdownFromScorecard(evaluation: {
  summary: string | null;
  finalScorecard: unknown;
}): {
  overallComment: string;
  dimensions: Record<string, { score: number; summary?: string; strengths?: string; weaknesses?: string }>;
} {
  try {
    const scorecard = typeof evaluation.finalScorecard === "string"
      ? JSON.parse(evaluation.finalScorecard)
      : evaluation.finalScorecard as {
          overallScore: number;
          dimensions?: Record<string, {
            score: number;
            reasoning: string;
            strengths?: string[];
            weaknesses?: string[];
          }>;
          strengths?: string[];
          weaknesses?: string[];
        };
    const dimensions: Record<string, { score: number; summary?: string; strengths?: string; weaknesses?: string }> = {};
    for (const [key, dim] of Object.entries(scorecard.dimensions || {})) {
      const d = dim as { score: number; reasoning: string; strengths?: string[]; weaknesses?: string[] };
      dimensions[key] = {
        score: d.score,
        summary: d.reasoning,
        strengths: d.strengths?.length ? d.strengths.join("; ") : undefined,
        weaknesses: d.weaknesses?.length ? d.weaknesses.join("; ") : undefined,
      };
    }
    return {
      overallComment: evaluation.summary ||
        `Score: ${scorecard.overallScore}/100. ` +
        (scorecard.strengths?.length ? `Strengths: ${scorecard.strengths.join("; ")}. ` : "") +
        (scorecard.weaknesses?.length ? `Areas for improvement: ${scorecard.weaknesses.join("; ")}.` : ""),
      dimensions,
    };
  } catch {
    return { overallComment: "", dimensions: {} };
  }
}

function computeDimensionComparison(
  runs: Array<{
    id: string;
    evaluation: {
      totalScore: number | null;
      metricBreakdown: {
        dimensions?: Record<
          string,
          { score: number; summary?: string; strengths?: string; weaknesses?: string }
        >;
      } | null;
    } | null;
  }>
) {
  // Collect all unique dimension names across runs
  const allDimensions = new Set<string>();
  runs.forEach((run) => {
    if (run.evaluation?.metricBreakdown?.dimensions) {
      Object.keys(run.evaluation.metricBreakdown.dimensions).forEach((dim) =>
        allDimensions.add(dim)
      );
    }
  });

  // Build comparison matrix
  const dimensions: Record<
    string,
    {
      name: string;
      scores: Array<{ runId: string; score: number | null; delta: number | null }>;
      baseline: number | null;
    }
  > = {};

  Array.from(allDimensions).forEach((dimKey) => {
    const scores = runs.map((run, index) => {
      const score =
        run.evaluation?.metricBreakdown?.dimensions?.[dimKey]?.score ?? null;
      const baselineScore =
        runs[0].evaluation?.metricBreakdown?.dimensions?.[dimKey]?.score ?? null;
      const delta =
        score !== null && baselineScore !== null && index > 0
          ? score - baselineScore
          : null;

      return { runId: run.id, score, delta };
    });

    dimensions[dimKey] = {
      name: dimKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      scores,
      baseline: scores[0]?.score ?? null,
    };
  });

  return dimensions;
}

function computeMetricComparison(
  runs: Array<{
    id: string;
    metrics: {
      totalSteps: number;
      totalToolCalls: number;
      totalErrors: number;
      totalRetries: number;
      totalDurationMs: number | null;
    } | null;
  }>
) {
  const metricKeys = [
    "totalSteps",
    "totalToolCalls",
    "totalErrors",
    "totalRetries",
    "totalDurationMs",
  ] as const;

  const comparison: Record<
    string,
    Array<{ runId: string; value: number | null; delta: number | null }>
  > = {};

  metricKeys.forEach((metricKey) => {
    comparison[metricKey] = runs.map((run, index) => {
      const value = run.metrics?.[metricKey] ?? null;
      const baselineValue = runs[0].metrics?.[metricKey] ?? null;
      const delta =
        value !== null && baselineValue !== null && index > 0
          ? value - baselineValue
          : null;

      return { runId: run.id, value, delta };
    });
  });

  return comparison;
}
