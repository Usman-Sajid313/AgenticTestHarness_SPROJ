"use client";

import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

type RunData = {
  id: string;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  evaluations?: Array<{
    id: string;
    status: string;
    totalScore: number | null;
  }>;
};

type ScoreTrendChartProps = {
  runs: RunData[];
};

type ChartDataPoint = {
  date: string;
  score: number;
  runId: string;
  timestamp: number;
};

export default function ScoreTrendChart({ runs }: ScoreTrendChartProps) {
  const chartData: ChartDataPoint[] = runs
    .filter((run) => {
      const evaluation = run.evaluations?.[0];
      return (
        evaluation &&
        evaluation.status === "COMPLETED" &&
        evaluation.totalScore !== null &&
        evaluation.totalScore !== undefined
      );
    })
    .map((run) => {
      const evaluation = run.evaluations![0];
      const completedDate = run.completedAt || run.createdAt;
      return {
        date: new Date(completedDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        score: Math.round(evaluation.totalScore!),
        runId: run.id,
        timestamp: new Date(completedDate).getTime(),
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  if (chartData.length === 0) {
    return (
      <div className="mt-10 rounded-2xl bg-white/5 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-white/70">No completed evaluations yet. Run evaluations will appear here.</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg bg-black/90 border border-white/20 p-3 shadow-xl backdrop-blur-sm">
          <p className="text-xs text-white/60 mb-1">{data.date}</p>
          <p className="text-sm font-semibold text-purple-300">
            Score: <span className="text-white">{data.score}/100</span>
          </p>
          <p className="text-xs text-white/40 mt-1 font-mono">{data.runId.slice(0, 8)}...</p>
        </div>
      );
    }
    return null;
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
            Overall score progression over time
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/40">Average</p>
          <p className="text-lg font-semibold text-purple-300">{avgScore}/100</p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
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
              dataKey="date"
              stroke="rgba(255, 255, 255, 0.4)"
              style={{ fontSize: "12px" }}
              tick={{ fill: "rgba(255, 255, 255, 0.6)" }}
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
              stroke="#a855f7"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              dot={{ fill: "#a855f7", r: 4, strokeWidth: 2, stroke: "#000" }}
              activeDot={{ r: 6, fill: "#f472b6", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center gap-6 text-xs text-white/60">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-purple-500" />
          <span>Score</span>
        </div>
        <div className="ml-auto text-white/40">
          {chartData.length} {chartData.length === 1 ? "evaluation" : "evaluations"}
        </div>
      </div>
    </div>
  );
}

