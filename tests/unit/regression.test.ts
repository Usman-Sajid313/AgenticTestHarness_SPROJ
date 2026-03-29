import { describe, expect, it } from "vitest";
import { buildRegressionContext } from "@/lib/regression";

describe("regression verdicts", () => {
  it("marks a candidate as regressed when a dimension drop breaches the gate", () => {
    const context = buildRegressionContext({
      scope: "project",
      scopeId: "proj_1",
      scopeName: "Project",
      config: {
        maxDimensionDrop: 5,
        maxCostIncreasePct: 20,
        blockErrorIncrease: true,
        blockRetryIncrease: true,
        noiseThreshold: 2,
      },
      baselineRun: {
        id: "baseline",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        evaluation: {
          totalScore: 86,
          metricBreakdown: {
            overallComment: "Baseline",
            dimensions: {
              accuracy: { score: 90 },
              tool_use: { score: 82 },
            },
          },
        },
        metrics: {
          totalErrors: 0,
          totalRetries: 0,
          totalDurationMs: 4_000,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 1_200,
          judgeCostUsd: 0.12,
          totalModelTokens: 1_200,
          totalCostUsd: 0.12,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
      candidateRun: {
        id: "candidate",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        evaluation: {
          totalScore: 80,
          metricBreakdown: {
            overallComment: "Candidate",
            dimensions: {
              accuracy: { score: 82 },
              tool_use: { score: 81 },
            },
          },
        },
        metrics: {
          totalErrors: 1,
          totalRetries: 0,
          totalDurationMs: 4_300,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 1_500,
          judgeCostUsd: 0.15,
          totalModelTokens: 1_500,
          totalCostUsd: 0.15,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
    });

    expect(context.assessment?.verdict).toBe("REGRESSED");
    expect(context.assessment?.gatePassed).toBe(false);
    expect(
      context.assessment?.gateResults.find((gate) => gate.key === "dimension_drop")?.passed
    ).toBe(false);
  });

  it("marks a candidate as improved when scores move beyond the noise band without failing gates", () => {
    const context = buildRegressionContext({
      scope: "project",
      scopeId: "proj_1",
      scopeName: "Project",
      config: null,
      baselineRun: {
        id: "baseline",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        evaluation: {
          totalScore: 84,
          metricBreakdown: {
            overallComment: "Baseline",
            dimensions: {
              planning: { score: 83 },
            },
          },
        },
        metrics: {
          totalErrors: 1,
          totalRetries: 1,
          totalDurationMs: 5_000,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 2_000,
          judgeCostUsd: 0.2,
          totalModelTokens: 2_000,
          totalCostUsd: 0.2,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
      candidateRun: {
        id: "candidate",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        evaluation: {
          totalScore: 88,
          metricBreakdown: {
            overallComment: "Candidate",
            dimensions: {
              planning: { score: 88 },
            },
          },
        },
        metrics: {
          totalErrors: 1,
          totalRetries: 1,
          totalDurationMs: 4_600,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 2_200,
          judgeCostUsd: 0.21,
          totalModelTokens: 2_200,
          totalCostUsd: 0.21,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
    });

    expect(context.assessment?.verdict).toBe("IMPROVED");
    expect(context.assessment?.gatePassed).toBe(true);
  });

  it("marks a candidate as within noise when changes stay inside the configured band", () => {
    const context = buildRegressionContext({
      scope: "project",
      scopeId: "proj_1",
      scopeName: "Project",
      config: {
        maxDimensionDrop: 5,
        maxCostIncreasePct: 20,
        blockErrorIncrease: true,
        blockRetryIncrease: true,
        noiseThreshold: 3,
      },
      baselineRun: {
        id: "baseline",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        evaluation: {
          totalScore: 84,
          metricBreakdown: {
            overallComment: "Baseline",
            dimensions: {
              planning: { score: 84 },
            },
          },
        },
        metrics: {
          totalErrors: 0,
          totalRetries: 0,
          totalDurationMs: 5_000,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 2_000,
          judgeCostUsd: 0.2,
          totalModelTokens: 2_000,
          totalCostUsd: 0.2,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
      candidateRun: {
        id: "candidate",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        evaluation: {
          totalScore: 85,
          metricBreakdown: {
            overallComment: "Candidate",
            dimensions: {
              planning: { score: 85 },
            },
          },
        },
        metrics: {
          totalErrors: 0,
          totalRetries: 0,
          totalDurationMs: 5_050,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 2_050,
          judgeCostUsd: 0.205,
          totalModelTokens: 2_050,
          totalCostUsd: 0.205,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
    });

    expect(context.assessment?.verdict).toBe("WITHIN_NOISE");
    expect(context.assessment?.gatePassed).toBe(true);
  });

  it("treats an equal overall score as same even when one dimension improves", () => {
    const context = buildRegressionContext({
      scope: "project",
      scopeId: "proj_1",
      scopeName: "Project",
      config: null,
      baselineRun: {
        id: "baseline",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        evaluation: {
          totalScore: 84,
          metricBreakdown: {
            overallComment: "Baseline",
            dimensions: {
              planning: { score: 80 },
              reliability: { score: 88 },
            },
          },
        },
        metrics: {
          totalErrors: 0,
          totalRetries: 0,
          totalDurationMs: 5_000,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 2_000,
          judgeCostUsd: 0.2,
          totalModelTokens: 2_000,
          totalCostUsd: 0.2,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
      candidateRun: {
        id: "candidate",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        evaluation: {
          totalScore: 84,
          metricBreakdown: {
            overallComment: "Candidate",
            dimensions: {
              planning: { score: 84 },
              reliability: { score: 84 },
            },
          },
        },
        metrics: {
          totalErrors: 0,
          totalRetries: 0,
          totalDurationMs: 4_900,
        },
        usageSummary: {
          parseModelTokens: 0,
          parseCostUsd: 0,
          judgeModelTokens: 2_000,
          judgeCostUsd: 0.2,
          totalModelTokens: 2_000,
          totalCostUsd: 0.2,
          costPerMillionTokens: 100,
          isEstimated: true,
          note: "estimated",
        },
      },
    });

    expect(context.assessment?.deltas.overallScore.delta).toBe(0);
    expect(context.assessment?.verdict).toBe("WITHIN_NOISE");
  });
});
