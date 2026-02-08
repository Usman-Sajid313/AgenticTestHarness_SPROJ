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
  projectId: string;
};

const DIMENSION_COLORS = [
  "#a855f7", // purple
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

const BASELINE_KEY = (projectId: string) => `baselineRunId_${projectId}`;
const BASELINE_SCORE_KEY = (projectId: string) => `baselineScore_${projectId}`;

export default function ScoreTrendChart({ runs, projectId }: ScoreTrendChartProps) {
  const [showDimensions, setShowDimensions] = useState(true);

  const { chartData, dimensionKeys, baselineScore } = useMemo(() => {
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

    let baselineScore: number | null = null;
    if (typeof window !== "undefined") {
      const storedId = localStorage.getItem(BASELINE_KEY(projectId));
      const storedScore = localStorage.getItem(BASELINE_SCORE_KEY(projectId));
      if (storedId && storedScore) {
        const parsed = Number(storedScore);
        if (!Number.isNaN(parsed)) baselineScore = parsed;
      }
    }

    return { chartData, dimensionKeys, baselineScore };
  }, [runs, projectId]);

  if (chartData.length === 0) {
    return (
      <div className="mt-10 rounded-2xl bg-white/5 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-white/70">No completed evaluations yet. Run evaluations will appear here.</p>
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
      <div className="rounded-lg bg-black/90 border border-white/20 p-3 shadow-xl backdrop-blur-sm min-w-[180px]">
        <p className="text-xs text-white/60 mb-1">{data.date}</p>
        <p className="text-sm font-semibold text-purple-300">
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
            <p key={key} className="text-xs text-white/70 mt-0.5">
              {humanizeDimensionKey(key)}: {(data[key] ?? "—") as number}/100
            </p>
          ))}
        <p className="text-xs text-white/40 mt-1 font-mono">{data.runId.slice(0, 8)}...</p>
      </div>
    );
  };

  const avgScore = Math.round(
    chartData.reduce((sum, point) => sum + point.score, 0) / chartData.length
  );

  return (
    <div className="mt-10 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Score Trend</h2>
          <p className="mt-1 text-sm text-white/60">
            Overall and per-dimension progression over time
          </p>
        </div>
        <div className="flex items-center gap-8">
          {dimensionKeys.length > 0 && (
            <label className="flex items-center gap-2.5 text-sm text-white/70 cursor-pointer select-none">
              <span className="relative inline-flex h-5 w-9 shrink-0">
                <input
                  type="checkbox"
                  checked={showDimensions}
                  onChange={(e) => setShowDimensions(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/20 transition-colors peer-checked:bg-purple-500/80 peer-checked:ring-purple-400/50" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white/90 shadow transition-transform peer-checked:translate-x-4" />
              </span>
              <span className="text-white/80">Show dimensions</span>
            </label>
          )}
          <div className="text-right pl-2 border-l border-white/10">
            <p className="text-xs text-white/40">Average</p>
            <p className="text-lg font-semibold text-purple-300">{avgScore}/100</p>
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
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.1)"
              vertical={false}
            />
            <XAxis
              dataKey="index"
              stroke="rgba(255, 255, 255, 0.4)"
              style={{ fontSize: "12px" }}
              tick={{ fill: "rgba(255, 255, 255, 0.6)" }}
              allowDuplicatedCategory={false}
            />
            <YAxis
              domain={[0, 100]}
              stroke="rgba(255, 255, 255, 0.4)"
              style={{ fontSize: "12px" }}
              tick={{ fill: "rgba(255, 255, 255, 0.6)" }}
              width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="score"
              name="Overall"
              stroke="#a855f7"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              dot={{ fill: "#a855f7", r: 4, strokeWidth: 2, stroke: "#000" }}
              activeDot={{ r: 6, fill: "#f472b6", stroke: "#fff", strokeWidth: 2 }}
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-y-2 text-xs text-white/60">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-2 w-2 rounded-full bg-purple-500" aria-hidden />
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
        <div className="shrink-0 text-white/40">
          {chartData.length} {chartData.length === 1 ? "evaluation" : "evaluations"}
          {baselineScore != null && " · Baseline set"}
        </div>
      </div>
    </div>
  );
}

