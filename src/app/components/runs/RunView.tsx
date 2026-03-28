"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { RunUsageSummary } from "@/lib/runUsage";
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

type ScorecardDimension = {
  score: number;
  reasoning: string;
  evidenceEventIds?: string[];
  strengths?: string[];
  weaknesses?: string[];
};

type FinalScorecard = {
  overallScore: number;
  confidence?: number;
  dimensions?: Record<string, ScorecardDimension>;
  strengths?: string[];
  weaknesses?: string[];
  missingData?: string[];
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
  finalScorecard?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type TraceEvent = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  timestamp?: string;
};

type TraceStep = {
  stepNumber: number;
  description: string;
  keyEventIds: string[];
  timestamp?: string;
};

type ToolInteraction = {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  argsRaw?: string;
  result?: unknown;
  resultSummary?: string;
  status: string;
  eventIds: string[];
  timestamp?: string;
};

type TraceError = {
  message: string;
  eventIds: string[];
  timestamp?: string;
};

type TraceRetry = {
  attempt: number;
  eventIds: string[];
  timestamp?: string;
};

type RuleFlag = {
  id?: string;
  flagType: string;
  severity: string;
  message: string;
  evidenceEventIds: string[];
};

type RunMetrics = {
  totalSteps?: number;
  totalToolCalls?: number;
  totalErrors?: number;
  totalRetries?: number;
  totalDurationMs?: number | null;
};

type NormalizedTracePayload = {
  traceSummary?: { steps?: TraceStep[] };
  toolInteractions?: ToolInteraction[];
  errors?: TraceError[];
  retries?: TraceRetry[];
  metrics?: RunMetrics;
  ruleFlags?: RuleFlag[];
  trace?: TraceEvent[];
};

type JudgePacketPayload = {
  meta?: { logQuality?: { totalSteps?: number } };
  traceSummary?: { steps?: TraceStep[] };
  toolInteractions?: ToolInteraction[];
  errors?: TraceError[];
  retries?: TraceRetry[];
  metrics?: RunMetrics;
  ruleFlags?: RuleFlag[];
  trace?: TraceEvent[];
};

type RunTraceSummaryRecord = {
  normalizedTrace: string;
};

type RunJudgePacketRecord = {
  packet?: unknown;
};

export type Run = {
  id: string;
  status: string;
  project?: {
    name: string;
  } | null;
  traceSummary?: RunTraceSummaryRecord | null;
  metrics?: RunMetrics | null;
  ruleFlags?: RuleFlag[] | null;
  judgePacket?: RunJudgePacketRecord | null;
  usageSummary?: RunUsageSummary | null;
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
  const [traceSummary, setTraceSummary] = useState<RunTraceSummaryRecord | null>(
    initialRun.traceSummary ?? null
  );
  const [metrics, setMetrics] = useState<RunMetrics | null>(
    initialRun.metrics ?? null
  );
  const [ruleFlags, setRuleFlags] = useState<RuleFlag[]>(
    Array.isArray(initialRun.ruleFlags) ? initialRun.ruleFlags : []
  );
  const [judgePacket, setJudgePacket] = useState<RunJudgePacketRecord | null>(
    initialRun.judgePacket ?? null
  );
  const [usageSummary, setUsageSummary] = useState<RunUsageSummary | null>(
    initialRun.usageSummary ?? null
  );

  const evalTriggeredRef = useRef(false);
  const judgeTriggerInFlightRef = useRef(false);
  const lastJudgeAttemptAtRef = useRef(0);
  const JUDGE_RETRY_COOLDOWN_MS = 30000;

  const runId = run.id;
  const isRunTerminal =
    run.status === "COMPLETED" ||
    run.status === "COMPLETED_LOW_CONFIDENCE" ||
    run.status === "FAILED";

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
    if (isRunTerminal) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) return;

        const data = await res.json();
        setRun(data.run);

        if (data.evaluation) {
          setEvaluation(data.evaluation as Evaluation);
        }
        if ("traceSummary" in data) {
          setTraceSummary((data.traceSummary as RunTraceSummaryRecord | null) ?? null);
        }
        if ("metrics" in data) {
          setMetrics((data.metrics as RunMetrics | null) ?? null);
        }
        if (Array.isArray(data.ruleFlags)) {
          setRuleFlags(data.ruleFlags as RuleFlag[]);
        }
        if ("judgePacket" in data) {
          setJudgePacket((data.judgePacket as RunJudgePacketRecord | null) ?? null);
        }
        if ("usageSummary" in data) {
          setUsageSummary((data.usageSummary as RunUsageSummary | null) ?? null);
        }

        if (data.run.status === "READY_FOR_JUDGING") {
          triggerJudge();
        }
      } catch (err) {
        console.error("Failed to poll run/evaluation", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [runId, isRunTerminal, triggerJudge]);

  const isDone = evaluation?.status === "COMPLETED";
  const isFailed = run.status === "FAILED" && !isDone;

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-100 mb-2">Run Evaluation</h1>

      <p className="text-zinc-500 mb-8">
        Project: {run.project?.name ?? "Unknown"} · Run ID:{" "}
        <span className="font-mono text-xs">{run.id}</span>
      </p>

      {isDone ? (
        <ResultState
          evaluation={evaluation!}
          traceSummary={traceSummary}
          metrics={metrics}
          ruleFlags={ruleFlags}
          judgePacket={judgePacket}
          usageSummary={usageSummary}
        />
      ) : isFailed ? (
        <FailedState status={run.status} />
      ) : (
        <AnalyzingState status={run.status} />
      )}
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
      description: "Starting AI evaluation with the configured evaluator and judge models.",
    },
    JUDGING: {
      title: "Evaluating with AI judges...",
      description: "The configured judge models are analyzing the run and computing scores.",
    },
  };

  const message = statusMessages[status] || {
    title: "Processing...",
    description: "Your run is being processed.",
  };

  return (
    <div className="mt-10 rounded-xl bg-zinc-900 border border-zinc-800 p-10 text-center">
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      <h2 className="text-xl font-semibold text-zinc-100 mb-2">{message.title}</h2>
      <p className="text-zinc-400">{message.description}</p>
      <p className="text-zinc-600 text-sm mt-2">Status: {status}</p>
    </div>
  );
}

function FailedState({ status }: { status: string }) {
  return (
    <div className="mt-10 rounded-xl bg-red-500/10 border border-red-500/20 p-10 text-center">
      <h2 className="text-xl font-semibold text-red-400 mb-2">Run Failed</h2>
      <p className="text-zinc-400">
        Parsing or judging failed. Check the server logs for the specific error and retry the run.
      </p>
      <p className="text-zinc-600 text-sm mt-2">Status: {status}</p>
    </div>
  );
}

function ResultState({
  evaluation,
  traceSummary,
  metrics,
  ruleFlags,
  judgePacket,
  usageSummary,
}: {
  evaluation: Evaluation;
  traceSummary: RunTraceSummaryRecord | null;
  metrics: RunMetrics | null;
  ruleFlags: RuleFlag[];
  judgePacket: RunJudgePacketRecord | null;
  usageSummary: RunUsageSummary | null;
}) {
  const breakdown = evaluation.metricBreakdown;
  const scorecard = parseFinalScorecard(evaluation.finalScorecard);
  const [selectedEvidenceEventIds, setSelectedEvidenceEventIds] = useState<string[]>([]);
  const [selectedEvidenceLabel, setSelectedEvidenceLabel] = useState<string | null>(null);
  const timelineRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (!breakdown) {
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8 mt-6">
        <p className="text-zinc-400">
          Evaluation completed, but breakdown data is missing.
        </p>
      </div>
    );
  }

  const score = Math.round(evaluation.totalScore ?? 0);
  const selectEvidence = (eventIds: string[], sourceLabel: string) => {
    const normalized = uniqueNonEmptyStrings(eventIds);
    if (normalized.length === 0) return;
    setSelectedEvidenceEventIds(normalized);
    setSelectedEvidenceLabel(sourceLabel);
    const firstExistingId = normalized.find((id) => timelineRefs.current[id]);
    if (!firstExistingId) return;
    window.requestAnimationFrame(() => {
      timelineRefs.current[firstExistingId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  return (
    <div className="space-y-8 mt-6">
      {evaluation.confidence !== null && evaluation.confidence !== undefined && evaluation.confidence < 0.7 && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
          <p className="text-yellow-400 text-sm">
            Low confidence evaluation ({Math.round((evaluation.confidence || 0) * 100)}%).
            Judges disagreed significantly. Results should be interpreted with caution.
          </p>
        </div>
      )}

      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-semibold text-zinc-100">Overall Score</h2>
          <div className="relative h-20 w-20 shrink-0">
            <div className="absolute inset-0 rounded-full bg-zinc-800" />
            <div
              className="absolute inset-1 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center"
              style={{ clipPath: `inset(${100 - score}% 0 0 0)` }}
            >
              <span className="text-2xl font-bold text-white">{score}</span>
            </div>
          </div>
        </div>

        <p className="text-zinc-400 text-sm leading-relaxed max-w-none">
          {breakdown.overallComment ??
            "No summary is available for this evaluation."}
        </p>
      </div>

      {Object.keys(breakdown.dimensions).length > 0 && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Dimension overview</h2>
          <p className="text-sm text-zinc-500 mb-4">Strength profile across evaluation dimensions</p>
          <div className="h-72 w-full max-w-md">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={Object.entries(breakdown.dimensions).map(([name, dim]) => ({
                  dimension: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                  score: Math.round(dim.score),
                  fullMark: 100,
                }))}
              >
                <PolarGrid stroke="rgba(63,63,70,0.7)" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fill: "rgba(161,161,170,1)", fontSize: 11 }}
                  tickLine={{ stroke: "rgba(63,63,70,0.5)" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "rgba(113,113,122,1)", fontSize: 10 }}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(9,9,11,0.95)",
                    border: "1px solid rgba(63,63,70,0.8)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "rgba(228,228,231,0.9)" }}
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

      <RunUsageCard usageSummary={usageSummary} />

      <TraceExplorer
        traceSummary={traceSummary}
        metrics={metrics}
        ruleFlags={ruleFlags}
        judgePacket={judgePacket}
        selectedEvidenceEventIds={selectedEvidenceEventIds}
        selectedEvidenceLabel={selectedEvidenceLabel}
        onSelectEvidence={selectEvidence}
        onClearSelection={() => {
          setSelectedEvidenceEventIds([]);
          setSelectedEvidenceLabel(null);
        }}
        timelineRefs={timelineRefs}
      />

      <div className="space-y-4">
        {Object.entries(breakdown.dimensions).map(
          ([key, dim]: [string, DimensionResult]) => (
            <div
              key={key}
              className="rounded-xl bg-zinc-900 border border-zinc-800 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-100">
                  {humanizeKey(key)}
                </h3>
                <div className="flex items-center gap-3 ml-3">
                  <span className="text-sm font-semibold text-indigo-400 shrink-0">
                    {dim.score} / 100
                  </span>
                  {(scorecard?.dimensions?.[key]?.evidenceEventIds?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        selectEvidence(
                          scorecard?.dimensions?.[key]?.evidenceEventIds ?? [],
                          `Dimension: ${humanizeKey(key)}`
                        )
                      }
                      className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20"
                    >
                      View evidence ({uniqueNonEmptyStrings(scorecard?.dimensions?.[key]?.evidenceEventIds).length})
                    </button>
                  )}
                </div>
              </div>

              {dim.summary && (
                <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                  {dim.summary}
                </p>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-400 mb-2">
                    What went well
                  </p>
                  <ProsConsList value={dim.strengths} />
                </div>

                <div>
                  <p className="text-xs font-semibold text-rose-400 mb-2">
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

function TraceExplorer({
  traceSummary,
  metrics,
  ruleFlags,
  judgePacket,
  selectedEvidenceEventIds,
  selectedEvidenceLabel,
  onSelectEvidence,
  onClearSelection,
  timelineRefs,
}: {
  traceSummary: RunTraceSummaryRecord | null;
  metrics: RunMetrics | null;
  ruleFlags: RuleFlag[];
  judgePacket: RunJudgePacketRecord | null;
  selectedEvidenceEventIds: string[];
  selectedEvidenceLabel: string | null;
  onSelectEvidence: (eventIds: string[], sourceLabel: string) => void;
  onClearSelection: () => void;
  timelineRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const normalizedTrace = parseNormalizedTrace(traceSummary?.normalizedTrace);
  const packet = parseJudgePacket(judgePacket?.packet);
  const traceEvents = normalizedTrace?.trace ?? packet?.trace ?? [];
  const traceSteps = normalizedTrace?.traceSummary?.steps ?? packet?.traceSummary?.steps ?? [];
  const toolInteractions =
    normalizedTrace?.toolInteractions ?? packet?.toolInteractions ?? [];
  const errors = normalizedTrace?.errors ?? packet?.errors ?? [];
  const retries = normalizedTrace?.retries ?? packet?.retries ?? [];
  const effectiveMetrics = mergeTraceMetrics(
    metrics,
    packet?.metrics,
    normalizedTrace?.metrics,
    traceSteps.length,
    packet?.meta?.logQuality?.totalSteps
  );
  const effectiveRuleFlags =
    (normalizedTrace?.ruleFlags && normalizedTrace.ruleFlags.length > 0
      ? normalizedTrace.ruleFlags
      : ruleFlags.length > 0
        ? ruleFlags
        : packet?.ruleFlags) ?? [];
  const selectedSet = new Set(selectedEvidenceEventIds);
  const missingSelectedIds = selectedEvidenceEventIds.filter(
    (id) => !traceEvents.some((event) => event.id === id)
  );

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Trace explorer</h2>
          <p className="text-sm text-zinc-500">
            Inspect normalized timeline, tool interactions, errors/retries, and jump from evidence-linked scores to source events.
          </p>
        </div>
        {selectedEvidenceEventIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-indigo-500/10 px-3 py-2 border border-indigo-500/20">
            <span className="text-xs text-indigo-300">
              Highlighting {selectedEvidenceEventIds.length} event{selectedEvidenceEventIds.length === 1 ? "" : "s"}
              {selectedEvidenceLabel ? ` from ${selectedEvidenceLabel}` : ""}
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs text-indigo-300/80 hover:text-zinc-100"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {effectiveMetrics && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricChip label="Steps" value={effectiveMetrics.totalSteps ?? "—"} />
          <MetricChip label="Tool Calls" value={effectiveMetrics.totalToolCalls ?? "—"} />
          <MetricChip label="Errors" value={effectiveMetrics.totalErrors ?? "—"} />
          <MetricChip label="Retries" value={effectiveMetrics.totalRetries ?? "—"} />
          <MetricChip
            label="Duration"
            value={
              effectiveMetrics.totalDurationMs != null
                ? formatDurationMs(effectiveMetrics.totalDurationMs)
                : "—"
            }
          />
        </div>
      )}

      {effectiveRuleFlags.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100">Rule flags</h3>
          <div className="space-y-2">
            {effectiveRuleFlags.map((flag, index) => {
              const evidenceIds = uniqueNonEmptyStrings(flag.evidenceEventIds);
              const severityClass = getSeverityClass(flag.severity);
              return (
                <div
                  key={`${flag.flagType}-${index}`}
                  className={`rounded-lg p-3 border ${severityClass}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                        {flag.flagType.replace(/_/g, " ")} · {flag.severity}
                      </p>
                      <p className="text-sm text-zinc-400">{flag.message}</p>
                    </div>
                    {evidenceIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectEvidence(evidenceIds, `Rule flag: ${flag.flagType}`)
                        }
                        className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        Jump to evidence ({evidenceIds.length})
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <TraceSection
            title="Steps"
            emptyLabel="No normalized steps available."
            rows={traceSteps.map((step) => ({
              key: `step-${step.stepNumber}-${step.timestamp ?? ""}`,
              title: `Step ${step.stepNumber}`,
              subtitle: step.description,
              timestamp: step.timestamp,
              eventIds: step.keyEventIds,
            }))}
            onSelectEvidence={onSelectEvidence}
          />

          <TraceSection
            title="Tool interactions"
            emptyLabel="No tool interactions captured."
            rows={toolInteractions.map((interaction) => ({
              key: `${interaction.toolCallId}-${interaction.timestamp ?? ""}`,
              title: `${interaction.toolName} · ${interaction.status}`,
              subtitle:
                interaction.resultSummary ||
                previewJson(interaction.result ?? interaction.args ?? interaction.argsRaw),
              timestamp: interaction.timestamp,
              eventIds: interaction.eventIds,
            }))}
            onSelectEvidence={onSelectEvidence}
          />

          <TraceSection
            title="Errors & retries"
            emptyLabel="No errors or retries captured."
            rows={[
              ...errors.map((error, index) => ({
                key: `error-${index}-${error.timestamp ?? ""}`,
                title: "Error",
                subtitle: error.message,
                timestamp: error.timestamp,
                eventIds: error.eventIds,
              })),
              ...retries.map((retry, index) => ({
                key: `retry-${index}-${retry.timestamp ?? ""}`,
                title: `Retry attempt ${retry.attempt}`,
                subtitle: "Repeated tool call detected",
                timestamp: retry.timestamp,
                eventIds: retry.eventIds,
              })),
            ]}
            onSelectEvidence={onSelectEvidence}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">Normalized timeline</h3>
            <span className="text-xs text-zinc-500">{traceEvents.length} events</span>
          </div>

          {missingSelectedIds.length > 0 && (
            <p className="text-xs text-yellow-400 rounded-lg bg-yellow-500/10 px-3 py-2 border border-yellow-500/20">
              {missingSelectedIds.length} selected evidence event{missingSelectedIds.length === 1 ? "" : "s"} not present in the rendered trace (likely truncated in judge packet).
            </p>
          )}

          {traceEvents.length === 0 ? (
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
              <p className="text-sm text-zinc-500">
                No trace events available yet. The parser may still be processing or the packet may be missing trace data.
              </p>
            </div>
          ) : (
            <div className="max-h-[34rem] space-y-2 overflow-auto pr-1">
              {traceEvents.map((event) => {
                const isHighlighted = selectedSet.has(event.id);
                return (
                  <div
                    key={event.id}
                    ref={(node) => {
                      timelineRefs.current[event.id] = node;
                    }}
                    className={`rounded-lg p-3 border transition ${
                      isHighlighted
                        ? "bg-indigo-500/10 border-indigo-500/30"
                        : "bg-zinc-950 border-zinc-800"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-zinc-400">
                          {event.id}
                        </p>
                        <p className="text-sm font-medium text-zinc-100">
                          {event.type}
                        </p>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500 break-words">
                      {previewJson(event.data)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TraceSection({
  title,
  rows,
  emptyLabel,
  onSelectEvidence,
}: {
  title: string;
  rows: Array<{
    key: string;
    title: string;
    subtitle?: string;
    timestamp?: string;
    eventIds?: string[];
  }>;
  emptyLabel: string;
  onSelectEvidence: (eventIds: string[], sourceLabel: string) => void;
}) {
  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <span className="text-xs text-zinc-500">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const evidenceIds = uniqueNonEmptyStrings(row.eventIds);
            return (
              <div key={row.key} className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{row.title}</p>
                  <span className="text-xs text-zinc-600">{formatTimestamp(row.timestamp)}</span>
                </div>
                {row.subtitle && (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500 break-words">
                    {row.subtitle}
                  </p>
                )}
                {evidenceIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectEvidence(evidenceIds, `${title}: ${row.title}`)}
                    className="mt-2 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Show evidence ({evidenceIds.length})
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function RunUsageCard({ usageSummary }: { usageSummary: RunUsageSummary | null }) {
  if (!usageSummary) return null;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Run usage</h2>
          <p className="text-sm text-zinc-500">
            Model token and cost summary for this run.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricChip
          label="Total Model Tokens"
          value={
            usageSummary.totalModelTokens != null
              ? formatInteger(usageSummary.totalModelTokens)
              : "—"
          }
        />
        <MetricChip
          label="Total Cost"
          value={
            usageSummary.totalCostUsd != null
              ? formatUsd(usageSummary.totalCostUsd)
              : "—"
          }
        />
        <MetricChip
          label="Parser Tokens"
          value={formatInteger(usageSummary.parseModelTokens)}
        />
        <MetricChip
          label="Judge Tokens"
          value={
            usageSummary.judgeModelTokens != null
              ? formatInteger(usageSummary.judgeModelTokens)
              : "—"
          }
        />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        {usageSummary.note} Pricing uses {formatUsd(usageSummary.costPerMillionTokens)} per 1M tokens.
      </p>
    </div>
  );
}

function ProsConsList({ value }: { value?: string }) {
  if (!value || !value.trim()) return <p className="text-sm text-zinc-600">—</p>;
  const items = value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length <= 1) return <p className="text-sm text-zinc-400 leading-relaxed">{value}</p>;
  return (
    <ul className="list-disc list-inside space-y-1.5 text-sm text-zinc-400 leading-relaxed">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function humanizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseFinalScorecard(value: unknown): FinalScorecard | null {
  if (!value) return null;
  try {
    const parsed =
      typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as FinalScorecard;
  } catch {
    return null;
  }
}

function parseNormalizedTrace(value?: string): NormalizedTracePayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return { trace: parsed as TraceEvent[] };
    }
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as NormalizedTracePayload;
  } catch {
    return null;
  }
}

function parseJudgePacket(value: unknown): JudgePacketPayload | null {
  if (!value) return null;
  try {
    const parsed =
      typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as JudgePacketPayload;
  } catch {
    return null;
  }
}

function uniqueNonEmptyStrings(values?: string[]) {
  return [...new Set((values ?? []).filter((value): value is string => Boolean(value?.trim())))];
}

function previewJson(value: unknown) {
  if (value == null) return "—";
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  } catch {
    return String(value);
  }
}

function formatTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDurationMs(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function mergeTraceMetrics(
  persistedMetrics: RunMetrics | null | undefined,
  packetMetrics: RunMetrics | undefined,
  normalizedMetrics: RunMetrics | undefined,
  traceStepCount: number,
  packetStepCount?: number
): RunMetrics | null {
  const merged: RunMetrics = {
    totalSteps:
      normalizedMetrics?.totalSteps ??
      persistedMetrics?.totalSteps ??
      packetStepCount ??
      (traceStepCount > 0 ? traceStepCount : undefined),
    totalToolCalls:
      normalizedMetrics?.totalToolCalls ??
      packetMetrics?.totalToolCalls ??
      persistedMetrics?.totalToolCalls,
    totalErrors:
      normalizedMetrics?.totalErrors ??
      packetMetrics?.totalErrors ??
      persistedMetrics?.totalErrors,
    totalRetries:
      normalizedMetrics?.totalRetries ??
      packetMetrics?.totalRetries ??
      persistedMetrics?.totalRetries,
    totalDurationMs:
      normalizedMetrics?.totalDurationMs ??
      packetMetrics?.totalDurationMs ??
      persistedMetrics?.totalDurationMs,
  };

  return Object.values(merged).some((value) => value != null) ? merged : null;
}

function formatInteger(value: number) {
  return value.toLocaleString();
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 2,
  }).format(value);
}

function getSeverityClass(severity: string) {
  switch (severity.toLowerCase()) {
    case "high":
      return "bg-red-500/10 border-red-500/20";
    case "medium":
      return "bg-yellow-500/10 border-yellow-500/20";
    default:
      return "bg-sky-500/10 border-sky-500/20";
  }
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
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
      <h2 className="text-lg font-semibold text-zinc-100 mb-2">Judge panel</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Per-model overall scores and agreement with the combined result
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {panel.map((entry) => {
          const s = Math.round(entry.scorecard.overallScore ?? 0);
          const diff = s - finalScore;
          return (
            <div
              key={entry.model}
              className="rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2 flex items-center gap-3"
            >
              <span className="text-zinc-300 font-medium truncate max-w-[120px]" title={entry.model}>
                {entry.model}
              </span>
              <span className="text-indigo-400 font-semibold">{s}/100</span>
              {diff !== 0 && (
                <span className={diff > 0 ? "text-emerald-400 text-xs" : "text-rose-400 text-xs"}>
                  {diff > 0 ? "+" : ""}{diff}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500">{agreementLabel}</p>
    </div>
  );
}
