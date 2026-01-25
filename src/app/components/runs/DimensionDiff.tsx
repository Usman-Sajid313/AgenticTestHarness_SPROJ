"use client";

import { useState } from "react";

type DimensionDiffProps = {
  dimension: {
    name: string;
    scores: Array<{ runId: string; score: number | null; delta: number | null }>;
    baseline: number | null;
  };
  runs: Array<{
    id: string;
    evaluation: {
      metricBreakdown: {
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
  }>;
};

export default function DimensionDiff({ dimension, runs }: DimensionDiffProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between text-left"
        >
          <h3 className="text-base font-semibold text-white">{dimension.name}</h3>
          <svg
            className={`h-5 w-5 text-white/50 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Score bars */}
      <div className="space-y-3">
        {dimension.scores.map((item, index) => {
          const score = item.score ?? 0;
          const delta = item.delta;

          return (
            <div key={item.runId}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-white/60">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">
                    {item.score !== null ? Math.round(score) : "—"}
                  </span>
                  {delta !== null && index > 0 && (
                    <span
                      className={`text-xs font-semibold ${
                        delta > 0
                          ? "text-emerald-400"
                          : delta < 0
                          ? "text-rose-400"
                          : "text-white/40"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {Math.round(delta)}
                    </span>
                  )}
                </div>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`absolute left-0 top-0 h-full transition-all ${
                    index === 0
                      ? "bg-purple-500"
                      : delta && delta > 0
                      ? "bg-emerald-500"
                      : delta && delta < 0
                      ? "bg-rose-500"
                      : "bg-purple-400"
                  }`}
                  style={{ width: `${item.score ?? 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {runs.map((run, index) => {
            const dimensionKey = Object.keys(
              run.evaluation?.metricBreakdown?.dimensions || {}
            ).find(
              (key) =>
                key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ===
                dimension.name
            );

            const dimData = dimensionKey
              ? run.evaluation?.metricBreakdown?.dimensions?.[dimensionKey]
              : null;

            if (!dimData) {
              return (
                <div key={run.id} className="text-xs text-white/40">
                  <p className="mb-1 font-semibold text-white/50">
                    {index === 0 ? "Baseline" : `Run ${index + 1}`}
                  </p>
                  <p>No evaluation data available</p>
                </div>
              );
            }

            return (
              <div key={run.id} className="text-xs">
                <p className="mb-2 font-semibold text-white/70">
                  {index === 0 ? "Baseline" : `Run ${index + 1}`}
                </p>
                {dimData.summary && (
                  <div className="mb-2">
                    <p className="text-white/50 mb-1">Summary:</p>
                    <p className="text-white/80">{dimData.summary}</p>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {dimData.strengths && (
                    <div>
                      <p className="text-emerald-300 mb-1">Strengths:</p>
                      <p className="text-white/70">{dimData.strengths}</p>
                    </div>
                  )}
                  {dimData.weaknesses && (
                    <div>
                      <p className="text-rose-300 mb-1">Weaknesses:</p>
                      <p className="text-white/70">{dimData.weaknesses}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
