"use client";

import { useMemo, useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  Line,
  ComposedChart,
  ReferenceLine,
} from "recharts";

type ScorecardDimensions = Record<
  string,
  { score: number; reasoning?: string; evidenceEventIds?: string[] }
>;

type RunData = {
  id: string;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  evaluations?: Array<{
    id: string;
    status: string;
    totalScore: number | null;
    finalScorecard?: unknown;
  }>;
};

type ScoreTrendChartProps = {
  runs: RunData[];
  baselineRunId?: string | null;
  baselineScore?: number | null;
};

const DIMENSION_COLORS = [
  "#6366f1", // indigo
  "#e879f9", // fuchsia
  "#22d3ee", // cyan
  "#34d399", // emerald
  "#fbbf24", // amber
  "#fb7185", // rose
];

function getDimensionsFromScorecard(finalScorecard: unknown): ScorecardDimensions | null {
  if (!finalScorecard || typeof finalScorecard !== "object") return null;
  const sc = finalScorecard as { dimensions?: ScorecardDimensions };
  return sc.dimensions && typeof sc.dimensions === "object" ? sc.dimensions : null;
}

function humanizeDimensionKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ScoreTrendChart({
  runs,
  baselineRunId,
  baselineScore,
}: ScoreTrendChartProps) {
  const [showDimensions, setShowDimensions] = useState(true);

  const { chartData, dimensionKeys } = useMemo(() => {
    const filtered = runs.filter((run) => {
      const evaluation = run.evaluations?.[0];
      return (
        evaluation &&
        evaluation.status === "COMPLETED" &&
        evaluation.totalScore !== null &&
        evaluation.totalScore !== undefined
      );
    });

    const allDimKeys = new Set<string>();
    filtered.forEach((run) => {
      const scorecard = getDimensionsFromScorecard(run.evaluations?.[0]?.finalScorecard);
      if (scorecard) Object.keys(scorecard).forEach((k) => allDimKeys.add(k));
    });
    const dimensionKeys = Array.from(allDimKeys).slice(0, 6);

    const sorted = filtered
      .map((run) => {
        const evaluation = run.evaluations![0];
        const completedDate = run.completedAt || run.createdAt;
        const ts = new Date(completedDate).getTime();
        const score = Math.round(evaluation.totalScore!);
        const scorecard = getDimensionsFromScorecard(evaluation.finalScorecard);
        const dimScores: Record<string, number> = {};
        dimensionKeys.forEach((key) => {
          const d = scorecard?.[key];
          dimScores[key] = d != null && typeof d.score === "number" ? Math.round(d.score) : score;
        });
        return {
          date: new Date(completedDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          score,
          runId: run.id,
          timestamp: ts,
          ...dimScores,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    const chartData = sorted.map((point, i) => ({ ...point, index: i + 1 }));

    return { chartData, dimensionKeys };
  }, [runs]);

  if (chartData.length === 0) {
    return (
      <div className="mt-10 rounded-xl bg-zinc-900 border border-zinc-800 p-10 text-center">
        <p className="text-zinc-400">No completed evaluations yet. Run evaluations will appear here.</p>
      </div>
    );
  }

  type PayloadItem = { payload: Record<string, unknown>; dataKey: string; color?: string; value?: number };
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: PayloadItem[];
  }) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload as { date: string; score: number; runId: string; index: number } & Record<string, number>;
    const delta =
      baselineScore != null && data.score != null
        ? data.score - baselineScore
        : null;

    return (
      <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-3 shadow-xl min-w-[180px]">
        <p className="text-xs text-zinc-500 mb-1">{data.date}</p>
        <p className="text-sm font-semibold text-zinc-100">
          Score: <span className="text-white">{data.score}/100</span>
          {delta !== null && (
            <span className={delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {" "}
              ({delta >= 0 ? "+" : ""}{delta} vs baseline)
            </span>
          )}
        </p>
        {showDimensions &&
          dimensionKeys.length > 0 &&
          dimensionKeys.map((key) => (
            <p key={key} className="text-xs text-zinc-400 mt-0.5">
              {humanizeDimensionKey(key)}: {(data[key] ?? "—") as number}/100
            </p>
          ))}
        <p className="text-xs text-zinc-600 mt-1 font-mono">{data.runId.slice(0, 8)}...</p>
      </div>
    );
  };

  const avgScore = Math.round(
    chartData.reduce((sum, point) => sum + point.score, 0) / chartData.length
  );

  return (
    <div className="mt-10 rounded-xl bg-zinc-900 border border-zinc-800 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Score Trend</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Overall and per-dimension progression over time
          </p>
        </div>
        <div className="flex items-center gap-8">
          {dimensionKeys.length > 0 && (
            <label className="flex items-center gap-2.5 text-sm text-zinc-400 cursor-pointer select-none">
              <span className="relative inline-flex h-5 w-9 shrink-0">
                <input
                  type="checkbox"
                  checked={showDimensions}
                  onChange={(e) => setShowDimensions(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-zinc-700 transition-colors peer-checked:bg-indigo-500" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white/90 shadow transition-transform peer-checked:translate-x-4" />
              </span>
              <span className="text-zinc-300">Show dimensions</span>
            </label>
          )}
          <div className="text-right pl-2 border-l border-zinc-800">
            <p className="text-xs text-zinc-500">Average</p>
            <p className="text-lg font-semibold text-zinc-100">{avgScore}/100</p>
          </div>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(63, 63, 70, 0.5)"
              vertical={false}
            />
            <XAxis
              dataKey="index"
              stroke="rgba(161, 161, 170, 0.4)"
              style={{ fontSize: "12px" }}
              tick={{ fill: "rgba(161, 161, 170, 0.6)" }}
              allowDuplicatedCategory={false}
            />
            <YAxis
              domain={[0, 100]}
              stroke="rgba(161, 161, 170, 0.4)"
              style={{ fontSize: "12px" }}
              tick={{ fill: "rgba(161, 161, 170, 0.6)" }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            {baselineScore != null && (
              <ReferenceLine
                y={Math.round(baselineScore)}
                stroke="rgba(244,244,245,0.35)"
                strokeDasharray="6 4"
              />
            )}
            <Area
              type="monotone"
              dataKey="score"
              name="Overall"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              dot={{ fill: "#6366f1", r: 4, strokeWidth: 2, stroke: "#000" }}
              activeDot={{ r: 6, fill: "#818cf8", stroke: "#fff", strokeWidth: 2 }}
            />
            {showDimensions &&
              dimensionKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={humanizeDimensionKey(key)}
                  stroke={DIMENSION_COLORS[i % DIMENSION_COLORS.length]}
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-y-2 text-xs text-zinc-500">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden />
            <span>Overall</span>
          </div>
          {dimensionKeys.length > 0 &&
            showDimensions &&
            dimensionKeys.map((key, i) => (
              <div key={key} className="flex items-center gap-2 shrink-0">
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: DIMENSION_COLORS[i % DIMENSION_COLORS.length] }}
                  aria-hidden
                />
                <span>{humanizeDimensionKey(key)}</span>
              </div>
            ))}
        </div>
        <div className="shrink-0 text-zinc-600">
          {chartData.length} {chartData.length === 1 ? "evaluation" : "evaluations"}
          {baselineRunId && baselineScore != null && " · Baseline set"}
        </div>
      </div>
    </div>
  );
}
