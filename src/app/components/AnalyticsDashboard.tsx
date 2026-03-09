'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  Bar,
  ComposedChart,
  BarChart,
} from 'recharts';

/* ---------- API types ---------- */

type SummaryData = {
  totalProjects: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  inProgressRuns: number;
  avgScore: number | null;
  scoreDistribution: { bucket: string; count: number }[];
  lowConfidenceRuns: number;
};

type TrendPoint = {
  date: string;
  completedRuns: number;
  failedRuns: number;
  totalRuns: number;
  avgScore: number | null;
};

type Activity = {
  id: string;
  action: string;
  label: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
};

/* ---------- Helpers ---------- */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  subValue,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color ?? 'text-zinc-100'}`}>{value}</p>
      {subValue && <p className="mt-1 text-xs text-zinc-500">{subValue}</p>}
    </div>
  );
}

/* ---------- Main Dashboard ---------- */

export default function AnalyticsDashboard() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendDays, setTrendDays] = useState(30);

  const fetchAll = useCallback(async (days: number) => {
    setError(null);
    try {
      const [summaryRes, trendsRes, activityRes] = await Promise.all([
        fetch('/api/analytics/summary', { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/analytics/trends?days=${days}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/analytics/activity?limit=15', { credentials: 'include', cache: 'no-store' }),
      ]);

      if (!summaryRes.ok || !trendsRes.ok || !activityRes.ok) {
        // If 401, just don't render analytics (user not logged in)
        if (summaryRes.status === 401) return;
        setError('Failed to load analytics data.');
        return;
      }

      const [summaryData, trendsData, activityData] = await Promise.all([
        summaryRes.json() as Promise<SummaryData>,
        trendsRes.json() as Promise<{ trends: TrendPoint[] }>,
        activityRes.json() as Promise<{ activities: Activity[] }>,
      ]);

      setSummary(summaryData);
      setTrends(trendsData.trends);
      setActivities(activityData.activities);
    } catch {
      setError('Network error loading analytics.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchAll(trendDays);
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fetchAll, trendDays]);

  /* Chart data: only show dates that have some activity, or last N points */
  const chartData = useMemo(() => {
    return trends.map((t) => ({
      ...t,
      label: formatShortDate(t.date),
      avgScore: t.avgScore !== null ? Math.round(t.avgScore) : null,
    }));
  }, [trends]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-zinc-800" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-zinc-900 border border-zinc-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!summary) return null;

  const scoreDisplay =
    summary.avgScore !== null ? `${Math.round(summary.avgScore)}/100` : '--';

  /* Tooltip components */
  type TrendPayloadItem = {
    payload: Record<string, unknown>;
    dataKey: string;
    color?: string;
    value?: number;
  };

  const TrendTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: TrendPayloadItem[];
  }) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload as TrendPoint & { label: string };
    return (
      <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-3 shadow-xl min-w-[160px]">
        <p className="text-xs text-zinc-500 mb-1">{data.label}</p>
        <p className="text-sm text-zinc-100">
          Runs: <span className="font-semibold text-white">{data.totalRuns}</span>
        </p>
        {data.avgScore !== null && (
          <p className="text-sm text-zinc-100">
            Avg score: <span className="font-semibold text-indigo-400">{Math.round(data.avgScore)}</span>
          </p>
        )}
        <p className="text-xs text-emerald-400 mt-0.5">
          Completed: {data.completedRuns}
        </p>
        <p className="text-xs text-rose-400">Failed: {data.failedRuns}</p>
      </div>
    );
  };

  type DistPayloadItem = {
    payload: Record<string, unknown>;
    dataKey: string;
    value?: number;
  };

  const DistributionTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: DistPayloadItem[];
  }) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload as { bucket: string; count: number };
    return (
      <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-3 shadow-xl">
        <p className="text-xs text-zinc-500">Score range: {data.bucket}</p>
        <p className="text-sm font-semibold text-zinc-100">{data.count} evaluations</p>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-100">Workspace Analytics</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Overview of your workspace performance and activity
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Projects"
          value={String(summary.totalProjects)}
        />
        <StatCard
          label="Total Runs"
          value={String(summary.totalRuns)}
          subValue={`${summary.completedRuns} completed · ${summary.inProgressRuns} in progress`}
        />
        <StatCard
          label="Average Score"
          value={scoreDisplay}
          color={
            summary.avgScore !== null
              ? summary.avgScore >= 70
                ? 'text-emerald-400'
                : summary.avgScore >= 40
                  ? 'text-amber-400'
                  : 'text-rose-400'
              : 'text-zinc-400'
          }
        />
        <StatCard
          label="Failed Runs"
          value={String(summary.failedRuns)}
          subValue={
            summary.lowConfidenceRuns > 0
              ? `${summary.lowConfidenceRuns} low confidence`
              : undefined
          }
          color={summary.failedRuns > 0 ? 'text-rose-400' : 'text-zinc-100'}
        />
      </div>

      {/* Charts row */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trend chart — 2 cols */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Run Trends</h3>
              <p className="text-xs text-zinc-500">Daily run volume and average score</p>
            </div>
            <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTrendDays(d)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    trendDays === d
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="h-64 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="runGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(63, 63, 70, 0.4)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="rgba(161, 161, 170, 0.4)"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: 'rgba(161, 161, 170, 0.6)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="runs"
                    stroke="rgba(161, 161, 170, 0.4)"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: 'rgba(161, 161, 170, 0.6)' }}
                    width={35}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="score"
                    orientation="right"
                    domain={[0, 100]}
                    stroke="rgba(161, 161, 170, 0.2)"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: 'rgba(161, 161, 170, 0.4)' }}
                    width={35}
                    hide
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Bar
                    yAxisId="runs"
                    dataKey="totalRuns"
                    name="Total Runs"
                    fill="rgba(99, 102, 241, 0.4)"
                    radius={[4, 4, 0, 0]}
                    barSize={trendDays <= 14 ? 18 : 8}
                  />
                  <Area
                    yAxisId="score"
                    type="monotone"
                    dataKey="avgScore"
                    name="Avg Score"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill="none"
                    dot={false}
                    activeDot={{ r: 4, fill: '#22d3ee', stroke: '#fff', strokeWidth: 1 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No trend data available
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-sm bg-indigo-500/60" />
              <span>Run volume</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-0.5 w-3 rounded bg-cyan-400" />
              <span>Avg score</span>
            </div>
          </div>
        </div>

        {/* Score distribution — 1 col */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-1 text-base font-semibold text-zinc-100">Score Distribution</h3>
          <p className="mb-4 text-xs text-zinc-500">Evaluation scores by range</p>
          <div className="h-64 w-full">
            {summary.scoreDistribution.some((b) => b.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={summary.scoreDistribution}
                  margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(63, 63, 70, 0.4)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="bucket"
                    stroke="rgba(161, 161, 170, 0.4)"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: 'rgba(161, 161, 170, 0.6)' }}
                  />
                  <YAxis
                    stroke="rgba(161, 161, 170, 0.4)"
                    style={{ fontSize: '11px' }}
                    tick={{ fill: 'rgba(161, 161, 170, 0.6)' }}
                    width={30}
                    allowDecimals={false}
                  />
                  <Tooltip content={<DistributionTooltip />} />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No evaluations yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity feed */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-1 text-base font-semibold text-zinc-100">Recent Activity</h3>
        <p className="mb-4 text-xs text-zinc-500">Latest actions in your workspace</p>
        {activities.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            No activity recorded yet.
          </p>
        ) : (
          <div className="space-y-0 divide-y divide-zinc-800/50">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400">
                    {activity.label.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-zinc-200">{activity.label}</p>
                    {activity.targetType && (
                      <p className="text-xs text-zinc-500">{activity.targetType}</p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">
                  {relativeTime(activity.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
