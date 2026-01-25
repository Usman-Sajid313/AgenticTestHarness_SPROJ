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

  return (
    <div className="space-y-8">
      {/* Run Overview Cards */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {runs.map((run, index) => (
          <div
            key={run.id}
            className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </p>
                <p className="mt-1 font-mono text-xs text-purple-300">
                  {run.id.slice(0, 12)}...
                </p>
              </div>
              {index > 0 && (
                <button
                  onClick={() => onRemoveRun(run.id)}
                  className="text-white/40 hover:text-red-400 transition"
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
                <p className="text-xs text-white/50">Project</p>
                <p className="text-sm text-white/90">{run.projectName || "—"}</p>
              </div>

              <div>
                <p className="text-xs text-white/50">Overall Score</p>
                {run.evaluation?.totalScore !== null &&
                run.evaluation?.totalScore !== undefined ? (
                  <p className="text-2xl font-semibold text-purple-300">
                    {Math.round(run.evaluation.totalScore)}
                    <span className="text-sm text-white/40">/100</span>
                  </p>
                ) : (
                  <p className="text-sm text-white/40">No evaluation</p>
                )}
              </div>

              <div>
                <p className="text-xs text-white/50">Status</p>
                <p className="text-sm text-white/90">{run.status}</p>
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
      <section className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
        <h2 className="mb-6 text-xl font-semibold text-white">
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
                <p className="mb-2 text-xs text-white/50">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-white">
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
                          : "text-white/40"
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
      <section className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
        <h2 className="mb-6 text-xl font-semibold text-white">
          Dimension Breakdown
        </h2>
        <div className="space-y-4">
          {Object.entries(dimensionComparison).map(([key, dimension]) => (
            <DimensionDiff key={key} dimension={dimension} runs={runs} />
          ))}
        </div>
      </section>

      {/* Metrics Comparison */}
      <section className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
        <h2 className="mb-6 text-xl font-semibold text-white">
          Execution Metrics
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-white/70">
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
                <tr key={metricKey} className="border-b border-white/5">
                  <td className="px-4 py-3 text-sm text-white/90">
                    {formatMetricName(metricKey)}
                  </td>
                  {values.map((item, index) => (
                    <td
                      key={item.runId}
                      className="px-4 py-3 text-center text-sm"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-white/90">
                          {metricKey === "totalDurationMs"
                            ? formatDuration(item.value)
                            : item.value ?? "—"}
                        </span>
                        {item.delta !== null && index > 0 && (
                          <span
                            className={`text-xs font-semibold ${
                              item.delta > 0
                                ? metricKey === "totalErrors" ||
                                  metricKey === "totalRetries"
                                  ? "text-rose-400"
                                  : "text-emerald-400"
                                : item.delta < 0
                                ? metricKey === "totalErrors" ||
                                  metricKey === "totalRetries"
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                                : "text-white/40"
                            }`}
                          >
                            {item.delta > 0 ? "+" : ""}
                            {metricKey === "totalDurationMs"
                              ? formatDuration(item.delta)
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
        <section className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
          <h2 className="mb-6 text-xl font-semibold text-white">Rule Flags</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {runs.map((run, index) => (
              <div key={run.id}>
                <p className="mb-3 text-xs text-white/50">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </p>
                {run.ruleFlags.length === 0 ? (
                  <p className="text-sm text-white/40">No flags</p>
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
                            : "border-white/20 bg-white/5 text-white/70"
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
