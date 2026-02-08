"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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

export type PanelEntry = {
  model: string;
  scorecard: { overallScore: number; dimensions?: Record<string, { score: number }> };
};

export type GeminiJudgement = {
  panel?: PanelEntry[];
  verifier?: unknown;
};

export type Evaluation = {
  id: string;
  status: string;
  totalScore: number | null;
  summary: string | null;
  metricBreakdown: MetricBreakdown | null;
  confidence?: number | null;
  geminiJudgement?: GeminiJudgement | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Run = {
  id: string;
  status: string;
  project?: {
    name: string;
  } | null;
};

interface RunViewProps {
  initialRun: Run;
  initialEvaluation: Evaluation | null;
}

export default function RunView({
  initialRun,
  initialEvaluation,
}: RunViewProps) {
  const [run, setRun] = useState<Run>(initialRun);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(
    initialEvaluation
  );

  const evalTriggeredRef = useRef(false);
  const judgeTriggerInFlightRef = useRef(false);
  const lastJudgeAttemptAtRef = useRef(0);
  const JUDGE_RETRY_COOLDOWN_MS = 30000;

  const runId = run.id;

  const triggerJudge = useCallback(async () => {
    if (judgeTriggerInFlightRef.current) return;

    const now = Date.now();
    if (now - lastJudgeAttemptAtRef.current < JUDGE_RETRY_COOLDOWN_MS) return;

    judgeTriggerInFlightRef.current = true;
    lastJudgeAttemptAtRef.current = now;
    try {
      await fetch(`/api/runs/${runId}/judge`, { method: "POST" });
    } catch (err) {
      console.error("Failed to trigger judge", err);
    } finally {
      judgeTriggerInFlightRef.current = false;
    }
  }, [runId]);

  useEffect(() => {
    if (evalTriggeredRef.current) return;

    evalTriggeredRef.current = true;

    (async () => {
      try {
        const statusRes = await fetch(`/api/runs/${runId}`);
        if (!statusRes.ok) return;

        const { run: currentRun } = await statusRes.json();

        if (
          currentRun.status === "COMPLETED" ||
          currentRun.status === "COMPLETED_LOW_CONFIDENCE" ||
          currentRun.status === "FAILED"
        ) {
          return;
        }

        if (currentRun.status === "UPLOADED") {
          await fetch(`/api/runs/${runId}/parse`, { method: "POST" });
          return;
        }
        if (currentRun.status === "READY_FOR_JUDGING") {
          await triggerJudge();
          return;
        }

      } catch (err) {
        console.error("Failed to trigger processing", err);
      }
    })();
  }, [runId, triggerJudge]);

  useEffect(() => {
    const isDone =
      run.status === "COMPLETED" ||
      run.status === "COMPLETED_LOW_CONFIDENCE" ||
      run.status === "FAILED";

    if (isDone && evaluation?.status === "COMPLETED") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) return;

        const data = await res.json();
        setRun(data.run);

        if (data.evaluation) {
          setEvaluation(data.evaluation as Evaluation);
        }

        if (data.run.status === "READY_FOR_JUDGING") {
          triggerJudge();
        }
      } catch (err) {
        console.error("Failed to poll run/evaluation", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [runId, run.status, evaluation?.status, triggerJudge]);

  const isDone = evaluation?.status === "COMPLETED";

  return (
    <div>
      <h1 className="text-3xl font-semibold text-white mb-2">Run Evaluation</h1>

      <p className="text-white/60 mb-8">
        Project: {run.project?.name ?? "Unknown"} · Run ID:{" "}
        <span className="font-mono text-xs">{run.id}</span>
      </p>

      {!isDone ? <AnalyzingState status={run.status} /> : <ResultState evaluation={evaluation!} run={run} />}
    </div>
  );
}

function AnalyzingState({ status }: { status: string }) {
  const statusMessages: Record<string, { title: string; description: string }> = {
    CREATED: { title: "Creating run...", description: "Initializing your run." },
    UPLOADING: { title: "Uploading logfile...", description: "Uploading your log file to storage." },
    UPLOADED: { title: "Upload complete", description: "Preparing to parse the logfile." },
    PARSING: {
      title: "Parsing logfile...",
      description: "We're parsing the agent's actions, tool calls, and reasoning to build the evaluation packet.",
    },
    READY_FOR_JUDGING: {
      title: "Ready for evaluation",
      description: "Starting AI evaluation with Gemini and Groq.",
    },
    JUDGING: {
      title: "Evaluating with AI judges...",
      description: "Gemini and Groq are analyzing the run and computing scores.",
    },
  };

  const message = statusMessages[status] || {
    title: "Processing...",
    description: "Your run is being processed.",
  };

  return (
    <div className="mt-10 rounded-2xl bg-white/5 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
      <h2 className="text-xl font-semibold text-white mb-2">{message.title}</h2>
      <p className="text-white/70">{message.description}</p>
      <p className="text-white/40 text-sm mt-2">Status: {status}</p>
    </div>
  );
}

function ResultState({ evaluation }: { evaluation: Evaluation; run: Run }) {
  const breakdown = evaluation.metricBreakdown;

  if (!breakdown) {
    return (
      <div className="rounded-2xl bg-white/5 p-8 mt-6 ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-white/70">
          Evaluation completed, but breakdown data is missing.
        </p>
      </div>
    );
  }

  const score = Math.round(evaluation.totalScore ?? 0);

  return (
    <div className="space-y-8 mt-6">
      {evaluation.confidence !== null && evaluation.confidence !== undefined && evaluation.confidence < 0.7 && (
        <div className="rounded-2xl bg-yellow-500/10 p-4 ring-1 ring-yellow-500/20">
          <p className="text-yellow-300 text-sm">
            ⚠️ Low confidence evaluation ({Math.round((evaluation.confidence || 0) * 100)}%).
            Judges disagreed significantly. Results should be interpreted with caution.
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-semibold text-white">Overall Score</h2>
          <div className="relative h-20 w-20 shrink-0">
            <div className="absolute inset-0 rounded-full bg-white/10" />
            <div
              className="absolute inset-1 rounded-full bg-gradient-to-tr from-purple-500 to-fuchsia-400 flex items-center justify-center"
              style={{ clipPath: `inset(${100 - score}% 0 0 0)` }}
            >
              <span className="text-2xl font-bold text-white">{score}</span>
            </div>
          </div>
        </div>

        <p className="text-white/70 text-sm leading-relaxed max-w-none">
          {breakdown.overallComment ??
            "No summary is available for this evaluation."}
        </p>
      </div>

      {Object.keys(breakdown.dimensions).length > 0 && (
        <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Dimension overview</h2>
          <p className="text-sm text-white/60 mb-4">Strength profile across evaluation dimensions</p>
          <div className="h-72 w-full max-w-md">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={Object.entries(breakdown.dimensions).map(([name, dim]) => ({
                  dimension: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                  score: Math.round(dim.score),
                  fullMark: 100,
                }))}
              >
                <PolarGrid stroke="rgba(255,255,255,0.15)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: "rgba(255,255,255,0.8)", fontSize: 11 }}
                  tickLine={{ stroke: "rgba(255,255,255,0.2)" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#a855f7"
                  fill="#a855f7"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.9)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.9)" }}
                  formatter={(value: number | undefined) => [`${value ?? 0}/100`, "Score"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {evaluation.geminiJudgement?.panel && evaluation.geminiJudgement.panel.length > 0 && (
        <PanelScoresCard panel={evaluation.geminiJudgement.panel} finalScore={score} />
      )}

      <div className="space-y-4">
        {Object.entries(breakdown.dimensions).map(
          ([key, dim]: [string, DimensionResult]) => (
            <div
              key={key}
              className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {humanizeKey(key)}
                </h3>
                <span className="text-sm font-semibold text-purple-300 shrink-0 ml-3">
                  {dim.score} / 100
                </span>
              </div>

              {dim.summary && (
                <p className="text-sm text-white/80 mb-6 leading-relaxed">
                  {dim.summary}
                </p>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-300 mb-2">
                    What went well
                  </p>
                  <ProsConsList value={dim.strengths} />
                </div>

                <div>
                  <p className="text-xs font-semibold text-rose-300 mb-2">
                    Where to improve
                  </p>
                  <ProsConsList value={dim.weaknesses} />
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** Renders pros or cons as a list; backend may send multiple items joined by "; " */
function ProsConsList({ value }: { value?: string }) {
  if (!value || !value.trim()) return <p className="text-sm text-white/50">—</p>;
  const items = value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length <= 1) return <p className="text-sm text-white/70 leading-relaxed">{value}</p>;
  return (
    <ul className="list-disc list-inside space-y-1.5 text-sm text-white/70 leading-relaxed">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function humanizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const AGREEMENT_THRESHOLD = 5;

function PanelScoresCard({
  panel,
  finalScore,
}: {
  panel: PanelEntry[];
  finalScore: number;
}) {
  const withinThreshold = panel.filter(
    (p) => Math.abs((p.scorecard.overallScore ?? 0) - finalScore) <= AGREEMENT_THRESHOLD
  ).length;
  const agreementLabel =
    panel.length <= 1
      ? "Single model"
      : `${withinThreshold}/${panel.length} models within ${AGREEMENT_THRESHOLD} pts`;

  return (
    <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
      <h2 className="text-lg font-semibold text-white mb-2">Judge panel</h2>
      <p className="text-sm text-white/60 mb-4">
        Per-model overall scores and agreement with the combined result
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {panel.map((entry) => {
          const s = Math.round(entry.scorecard.overallScore ?? 0);
          const diff = s - finalScore;
          return (
            <div
              key={entry.model}
              className="rounded-xl bg-white/5 px-4 py-2 ring-1 ring-white/10 flex items-center gap-3"
            >
              <span className="text-white/80 font-medium truncate max-w-[120px]" title={entry.model}>
                {entry.model}
              </span>
              <span className="text-purple-300 font-semibold">{s}/100</span>
              {diff !== 0 && (
                <span className={diff > 0 ? "text-emerald-400 text-xs" : "text-rose-400 text-xs"}>
                  {diff > 0 ? "+" : ""}{diff}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-white/50">{agreementLabel}</p>
    </div>
  );
}
