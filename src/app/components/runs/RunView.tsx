"use client";

import { useEffect, useState, useRef } from "react";

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

export type Evaluation = {
  id: string;
  status: string;
  totalScore: number | null;
  summary: string | null;
  metricBreakdown: MetricBreakdown | null;
  confidence?: number | null;
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

  const runId = run.id;

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
          await fetch(`/api/runs/${runId}/judge`, { method: "POST" });
          return;
        }

      } catch (err) {
        console.error("Failed to trigger processing", err);
      }
    })();
  }, [runId]);

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
          fetch(`/api/runs/${runId}/judge`, { method: "POST" }).catch(console.error);
        }
      } catch (err) {
        console.error("Failed to poll run/evaluation", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [runId, run.status, evaluation?.status]);

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
        <h2 className="text-xl font-semibold text-white mb-4">Overall Score</h2>

        <div className="flex items-center gap-6">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full bg-white/10" />
            <div
              className="absolute inset-1 rounded-full bg-gradient-to-tr from-purple-500 to-fuchsia-400 flex items-center justify-center"
              style={{ clipPath: `inset(${100 - score}% 0 0 0)` }}
            >
              <span className="text-2xl font-bold text-white">{score}</span>
            </div>
          </div>

          <p className="text-white/70 max-w-xl">
            {breakdown.overallComment ??
              "No summary is available for this evaluation."}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(breakdown.dimensions).map(
          ([key, dim]: [string, DimensionResult]) => (
            <div
              key={key}
              className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">
                  {humanizeKey(key)}
                </h3>
                <span className="text-sm font-semibold text-purple-300">
                  {dim.score} / 100
                </span>
              </div>

              {dim.summary && (
                <p className="text-sm text-white/80 mb-4 leading-relaxed">
                  {dim.summary}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-300 mb-1">
                    What went well
                  </p>
                  <p className="text-sm text-white/70">
                    {dim.strengths || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-rose-300 mb-1">
                    Where to improve
                  </p>
                  <p className="text-sm text-white/70">
                    {dim.weaknesses || "—"}
                  </p>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function humanizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
