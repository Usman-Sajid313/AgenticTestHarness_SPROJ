"use client";

import DimensionDiff from "./DimensionDiff";

type ComparisonViewProps = {
  data: {
    runs: Array<{
      id: string;
      projectId: string;
      projectName?: string;
      status: string;
      createdAt: string | Date;
      completedAt?: string | Date | null;
      evaluation: {
        id: string;
        status: string;
        totalScore: number | null;
        confidence: number | null;
        summary: string | null;
        metricBreakdown: {
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
        } | null;
      } | null;
      metrics: {
        totalSteps: number;
        totalToolCalls: number;
        totalErrors: number;
        totalRetries: number;
        totalDurationMs: number | null;
      } | null;
      usageSummary?: {
        totalModelTokens: number | null;
        totalCostUsd: number | null;
      } | null;
      ruleFlags: Array<{
        flagType: string;
        severity: string;
        message: string;
      }>;
    }>;
    dimensionComparison: Record<
      string,
      {
        name: string;
        scores: Array<{ runId: string; score: number | null; delta: number | null }>;
        baseline: number | null;
      }
    >;
    metricComparison: Record<
      string,
      Array<{ runId: string; value: number | null; delta: number | null }>
    >;
    comparedAt: string;
  };
  onRemoveRun: (runId: string) => void;
};

export default function ComparisonView({ data, onRemoveRun }: ComparisonViewProps) {
  const { runs, dimensionComparison, metricComparison } = data;

  const formatMetricName = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatUsd = (value: number | null) => {
    if (value === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: value < 0.01 ? 4 : 2,
      maximumFractionDigits: value < 0.01 ? 6 : 2,
    }).format(value);
  };

  // Build 2-run comparison insights
  const twoRunInsights =
    runs.length === 2 &&
    runs[0].evaluation?.totalScore != null &&
    runs[1].evaluation?.totalScore != null
      ? (() => {
          const scoreA = Math.round(runs[0].evaluation!.totalScore!);
          const scoreB = Math.round(runs[1].evaluation!.totalScore!);
          const overallDelta = scoreB - scoreA;
          const improvedDims: string[] = [];
          const regressedDims: string[] = [];
          Object.entries(dimensionComparison).forEach(([, dim]) => {
            const delta = dim.scores[1]?.delta;
            if (delta == null) return;
            const name = dim.name;
            if (delta > 0) improvedDims.push(`${name} (+${Math.round(delta)})`);
            if (delta < 0) regressedDims.push(`${name} (${Math.round(delta)})`);
          });
          const stepsA = runs[0].metrics?.totalSteps ?? null;
          const stepsB = runs[1].metrics?.totalSteps ?? null;
          const toolsA = runs[0].metrics?.totalToolCalls ?? null;
          const toolsB = runs[1].metrics?.totalToolCalls ?? null;
          const durationA = runs[0].metrics?.totalDurationMs ?? null;
          const durationB = runs[1].metrics?.totalDurationMs ?? null;
          const errorsA = runs[0].metrics?.totalErrors ?? null;
          const errorsB = runs[1].metrics?.totalErrors ?? null;
          const tokensA = runs[0].usageSummary?.totalModelTokens ?? null;
          const tokensB = runs[1].usageSummary?.totalModelTokens ?? null;
          const costA = runs[0].usageSummary?.totalCostUsd ?? null;
          const costB = runs[1].usageSummary?.totalCostUsd ?? null;
          return {
            overallDelta,
            scoreA,
            scoreB,
            improvedDims,
            regressedDims,
            stepsDelta: stepsB != null && stepsA != null ? stepsB - stepsA : null,
            toolsDelta: toolsB != null && toolsA != null ? toolsB - toolsA : null,
            durationDelta: durationB != null && durationA != null ? durationB - durationA : null,
            errorsDelta: errorsB != null && errorsA != null ? errorsB - errorsA : null,
            tokensDelta: tokensB != null && tokensA != null ? tokensB - tokensA : null,
            costDelta: costB != null && costA != null ? costB - costA : null,
          };
        })()
      : null;

  return (
    <div className="space-y-8">
      {/* Two-run comparison insights */}
      {twoRunInsights && (
        <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h2 className="mb-4 text-xl font-semibold text-zinc-100">Comparison insights</h2>
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-zinc-400">Overall score:</span>
              <span className="font-semibold text-zinc-100">
                Run 2 is{" "}
                {twoRunInsights.overallDelta > 0 && (
                  <span className="text-emerald-400">+{twoRunInsights.overallDelta} pts</span>
                )}
                {twoRunInsights.overallDelta < 0 && (
                  <span className="text-rose-400">{twoRunInsights.overallDelta} pts</span>
                )}
                {twoRunInsights.overallDelta === 0 && (
                  <span className="text-zinc-500">unchanged</span>
                )}
                <span className="text-zinc-400"> ({twoRunInsights.scoreA} → {twoRunInsights.scoreB})</span>
              </span>
            </div>
            {(twoRunInsights.improvedDims.length > 0 || twoRunInsights.regressedDims.length > 0) && (
              <div className="flex flex-wrap gap-4">
                {twoRunInsights.improvedDims.length > 0 && (
                  <div>
                    <span className="text-zinc-500">Improved: </span>
                    <span className="text-emerald-300">{twoRunInsights.improvedDims.join(", ")}</span>
                  </div>
                )}
                {twoRunInsights.regressedDims.length > 0 && (
                  <div>
                    <span className="text-zinc-500">Regressed: </span>
                    <span className="text-rose-300">{twoRunInsights.regressedDims.join(", ")}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-500">
              {twoRunInsights.stepsDelta != null && (
                <span>Steps: {twoRunInsights.stepsDelta >= 0 ? "+" : ""}{twoRunInsights.stepsDelta}</span>
              )}
              {twoRunInsights.toolsDelta != null && (
                <span>Tool calls: {twoRunInsights.toolsDelta >= 0 ? "+" : ""}{twoRunInsights.toolsDelta}</span>
              )}
              {twoRunInsights.durationDelta != null && (
                <span>Duration: {twoRunInsights.durationDelta >= 0 ? "+" : ""}{formatDuration(twoRunInsights.durationDelta)}</span>
              )}
              {twoRunInsights.errorsDelta != null && (
                <span>Errors: {twoRunInsights.errorsDelta >= 0 ? "+" : ""}{twoRunInsights.errorsDelta}</span>
              )}
              {twoRunInsights.tokensDelta != null && (
                <span>Tokens: {twoRunInsights.tokensDelta >= 0 ? "+" : ""}{Math.round(twoRunInsights.tokensDelta)}</span>
              )}
              {twoRunInsights.costDelta != null && (
                <span>Cost: {twoRunInsights.costDelta > 0 ? "+" : ""}{formatUsd(twoRunInsights.costDelta)}</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Run Overview Cards */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {runs.map((run, index) => (
          <div
            key={run.id}
            className="rounded-xl bg-zinc-900 border border-zinc-800 p-6"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </p>
                <p className="mt-1 font-mono text-xs text-indigo-400">
                  {run.id.slice(0, 12)}...
                </p>
              </div>
              {index > 0 && (
                <button
                  onClick={() => onRemoveRun(run.id)}
                  className="text-zinc-500 hover:text-red-400 transition"
                  title="Remove from comparison"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-500">Project</p>
                <p className="text-sm text-zinc-300">{run.projectName || "—"}</p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Overall Score</p>
                {run.evaluation?.totalScore !== null &&
                run.evaluation?.totalScore !== undefined ? (
                  <p className="text-2xl font-semibold text-indigo-400">
                    {Math.round(run.evaluation.totalScore)}
                    <span className="text-sm text-zinc-500">/100</span>
                  </p>
                ) : (
                  <p className="text-sm text-zinc-500">No evaluation</p>
                )}
              </div>

              <div>
                <p className="text-xs text-zinc-500">Status</p>
                <p className="text-sm text-zinc-300">{run.status}</p>
              </div>

              {run.evaluation?.confidence !== null &&
                run.evaluation?.confidence !== undefined &&
                run.evaluation.confidence < 0.7 && (
                  <div className="rounded-lg bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300">
                    Low confidence ({Math.round(run.evaluation.confidence * 100)}%)
                  </div>
                )}
            </div>
          </div>
        ))}
      </section>

      {/* Overall Score Comparison */}
      <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-zinc-100">
          Overall Score Comparison
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {runs.map((run, index) => {
            const score = run.evaluation?.totalScore;
            const baselineScore = runs[0].evaluation?.totalScore;
            const delta =
              score !== null &&
              score !== undefined &&
              baselineScore !== null &&
              baselineScore !== undefined &&
              index > 0
                ? score - baselineScore
                : null;

            return (
              <div key={run.id}>
                <p className="mb-2 text-xs text-zinc-500">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-zinc-100">
                    {score !== null && score !== undefined
                      ? Math.round(score)
                      : "—"}
                  </p>
                  {delta !== null && (
                    <p
                      className={`text-sm font-semibold ${
                        delta > 0
                          ? "text-emerald-400"
                          : delta < 0
                          ? "text-rose-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {Math.round(delta)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Dimension Comparison */}
      <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-zinc-100">
          Dimension Breakdown
        </h2>
        <div className="space-y-4">
          {Object.entries(dimensionComparison).map(([key, dimension]) => (
            <DimensionDiff key={key} dimension={dimension} runs={runs} />
          ))}
        </div>
      </section>

      {/* Metrics Comparison */}
      <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
        <h2 className="mb-6 text-xl font-semibold text-zinc-100">
          Execution Metrics
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="px-4 py-3 text-sm font-medium">Metric</th>
                {runs.map((run, index) => (
                  <th
                    key={run.id}
                    className="px-4 py-3 text-sm font-medium text-center"
                  >
                    {index === 0 ? "Baseline" : `Run ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(metricComparison).map(([metricKey, values]) => (
                <tr key={metricKey} className="border-b border-zinc-800/50">
                  <td className="px-4 py-3 text-sm text-zinc-300">
                    {formatMetricName(metricKey)}
                  </td>
                  {values.map((item, index) => (
                    <td
                      key={item.runId}
                      className="px-4 py-3 text-center text-sm"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-zinc-300">
                          {metricKey === "totalDurationMs"
                            ? formatDuration(item.value)
                            : metricKey === "totalCostUsd"
                            ? formatUsd(item.value)
                            : metricKey === "totalModelTokens" && item.value != null
                            ? Math.round(item.value).toLocaleString()
                            : item.value ?? "—"}
                        </span>
                        {item.delta !== null && index > 0 && (
                          <span
                            className={`text-xs font-semibold ${
                              item.delta > 0
                                ? metricKey === "totalErrors" ||
                                  metricKey === "totalRetries" ||
                                  metricKey === "totalDurationMs" ||
                                  metricKey === "totalModelTokens" ||
                                  metricKey === "totalCostUsd"
                                  ? "text-rose-400"
                                  : "text-emerald-400"
                                : item.delta < 0
                                ? metricKey === "totalErrors" ||
                                  metricKey === "totalRetries" ||
                                  metricKey === "totalDurationMs" ||
                                  metricKey === "totalModelTokens" ||
                                  metricKey === "totalCostUsd"
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                                : "text-zinc-500"
                            }`}
                          >
                            {item.delta > 0 ? "+" : ""}
                            {metricKey === "totalDurationMs"
                              ? formatDuration(item.delta)
                              : metricKey === "totalCostUsd"
                              ? formatUsd(item.delta)
                              : item.delta}
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rule Flags Comparison */}
      {runs.some((run) => run.ruleFlags.length > 0) && (
        <section className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h2 className="mb-6 text-xl font-semibold text-zinc-100">Rule Flags</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {runs.map((run, index) => (
              <div key={run.id}>
                <p className="mb-3 text-xs text-zinc-500">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </p>
                {run.ruleFlags.length === 0 ? (
                  <p className="text-sm text-zinc-500">No flags</p>
                ) : (
                  <div className="space-y-2">
                    {run.ruleFlags.map((flag, flagIndex) => (
                      <div
                        key={flagIndex}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          flag.severity === "high"
                            ? "border-red-500/40 bg-red-500/10 text-red-200"
                            : flag.severity === "medium"
                            ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
                            : "border-zinc-700 bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        <p className="font-semibold">{flag.flagType}</p>
                        <p className="mt-1 opacity-80">{flag.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
