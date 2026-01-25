'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Space_Grotesk } from 'next/font/google';
import type { MockToolDefinition, TestSuite } from '@/lib/mockToolCatalog';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type TestRunStatus = 'success' | 'partial' | 'failed' | 'error';

type TestRunToolCall = {
  toolId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
};

type TestRunMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

type TestRunRecord = {
  id: string;
  suiteId: string;
  status: TestRunStatus;
  startedAt: string;
  completedAt: string;
  summary: string;
  transcript: TestRunMessage[];
  toolCalls: TestRunToolCall[];
  metrics?: Record<string, number>;
};

type TestSuiteResponse = {
  suite: TestSuite;
  tools: MockToolDefinition[];
  runs: TestRunRecord[];
  models: string[];
  defaultModel: string;
  activeKeyEnvVar: string;
  activeKeyIndex: number;
  totalApiKeys: number;
};

type RunStreamEvent =
  | {
      type: 'run-start';
      suiteId: string;
      startedAt: string;
      tools?: MockToolDefinition[];
    }
  | {
      type: 'tool-start';
      toolCallId: string;
      toolId: string;
      toolName: string;
      input: unknown;
      startedAt: string;
    }
  | {
      type: 'tool-end';
      toolCallId: string;
      toolId: string;
      toolName: string;
      status: 'success' | 'error';
      output?: unknown;
      errorMessage?: string;
      durationMs: number;
      completedAt: string;
    }
  | {
      type: 'run-error';
      error: string;
    }
  | {
      type: 'run-complete';
      run: TestRunRecord;
      mockTools?: MockToolDefinition[];
      workspaceTools?: { id: string; name: string; description: string | null }[];
    };

type LiveToolCall = {
  toolCallId: string;
  toolId: string;
  toolName: string;
  input: unknown;
  status: 'running' | 'success' | 'error';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  output?: unknown;
  errorMessage?: string;
};

const statusStyles: Record<TestRunStatus, string> = {
  success: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40',
  partial: 'bg-amber-500/20 text-amber-200 border border-amber-400/40',
  failed: 'bg-rose-500/20 text-rose-200 border border-rose-400/40',
  error: 'bg-red-600/25 text-red-200 border border-red-500/40',
};

const liveStatusStyles: Record<LiveToolCall['status'], string> = {
  running: 'bg-amber-500/20 text-amber-200 border border-amber-400/40',
  success: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40',
  error: 'bg-rose-500/20 text-rose-200 border border-rose-400/40',
};

export default function TestHarnessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suite, setSuite] = useState<TestSuite | null>(null);
  const [tools, setTools] = useState<MockToolDefinition[]>([]);
  const [runs, setRuns] = useState<TestRunRecord[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [activeKeyEnvVar, setActiveKeyEnvVar] = useState<string | null>(null);
  const [activeKeyIndex, setActiveKeyIndex] = useState<number>(0);
  const [totalApiKeys, setTotalApiKeys] = useState<number>(0);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [keyRotationMessage, setKeyRotationMessage] = useState<string | null>(null);
  const [keyRotationError, setKeyRotationError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [liveToolCalls, setLiveToolCalls] = useState<Record<string, LiveToolCall>>({});
  const [liveRunStartedAt, setLiveRunStartedAt] = useState<string | null>(null);

  const loadSuite = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/test-suite', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to load test suite.');
      }
      const data = (await res.json()) as TestSuiteResponse;
      setSuite(data.suite);
      setTools(data.tools);
      setRuns(data.runs ?? []);
      setAvailableModels(data.models ?? []);
      setActiveKeyEnvVar(data.activeKeyEnvVar ?? null);
      setActiveKeyIndex(data.activeKeyIndex ?? 0);
      setTotalApiKeys(data.totalApiKeys ?? 0);
      setKeyRotationMessage(null);
      setKeyRotationError(null);
      setSelectedModel((prev) => {
        if (prev && data.models?.includes(prev)) {
          return prev;
        }
        if (data.defaultModel) {
          return data.defaultModel;
        }
        if (data.models?.length) {
          return data.models[0];
        }
        return '';
      });
      setLoading(false);
    } catch (err) {
      setError((err as Error).message ?? 'Unable to load test suite.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuite();
  }, [loadSuite]);

  const handleRunSuite = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setLiveToolCalls({});
    setLiveRunStartedAt(null);

    const modelToUse = selectedModel || availableModels[0] || undefined;
    if (!selectedModel && modelToUse) {
      setSelectedModel(modelToUse);
    }

    const processEvent = (event: RunStreamEvent) => {
      switch (event.type) {
        case 'run-start':
          if (event.tools) {
            setTools(event.tools);
          }
          setLiveRunStartedAt(event.startedAt);
          setLiveToolCalls({});
          break;
        case 'tool-start':
          setLiveToolCalls((prev) => ({
            ...prev,
            [event.toolCallId]: {
              toolCallId: event.toolCallId,
              toolId: event.toolId,
              toolName: event.toolName,
              input: event.input,
              status: 'running',
              startedAt: event.startedAt,
            },
          }));
          break;
        case 'tool-end':
          setLiveToolCalls((prev) => {
            const existing = prev[event.toolCallId];
            const base: LiveToolCall =
              existing ?? {
                toolCallId: event.toolCallId,
                toolId: event.toolId,
                toolName: event.toolName,
                input: null,
                status: 'running',
                startedAt: event.completedAt,
              };

            return {
              ...prev,
              [event.toolCallId]: {
                ...base,
                status: event.status === 'success' ? 'success' : 'error',
                completedAt: event.completedAt,
                durationMs: event.durationMs,
                output: event.output,
                errorMessage: event.errorMessage,
              },
            };
          });
          break;
        case 'run-error':
          setRunError(event.error ?? 'Run failed.');
          setRunning(false);
          break;
        case 'run-complete':
          setRuns((prev) => [event.run, ...prev.filter((run) => run.id !== event.run.id)]);
          if (event.mockTools) {
            setTools(event.mockTools);
          }
          setRunning(false);
          setExpandedRunId(event.run.id);
          setLiveToolCalls({});
          setLiveRunStartedAt(null);
          break;
        default:
          break;
      }
    };

    try {
      const res = await fetch('/api/test-suite/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
        }),
      });

      if (!res.ok) {
        let message = 'Run failed.';
        try {
          const data = await res.json();
          message = (data as { error?: string })?.error ?? message;
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        throw new Error(message);
      }

      if (!res.body) {
        throw new Error('Streaming not supported in this environment.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            try {
              processEvent(JSON.parse(line) as RunStreamEvent);
            } catch (err) {
              console.warn('Failed to parse run event chunk', err, line);
            }
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }

      const trailing = buffer.trim();
      if (trailing) {
        try {
          processEvent(JSON.parse(trailing) as RunStreamEvent);
        } catch (err) {
          console.warn('Failed to parse trailing run event chunk', err, trailing);
        }
      }
    } catch (err) {
      setRunError((err as Error).message ?? 'Run failed.');
      setRunning(false);
      setLiveToolCalls({});
      setLiveRunStartedAt(null);
    }
  }, [availableModels, selectedModel]);

  const handleRotateKeys = useCallback(async () => {
    setRotatingKey(true);
    setKeyRotationMessage(null);
    setKeyRotationError(null);

    try {
      const res = await fetch('/api/test-suite/rotate-key', {
        method: 'POST',
      });

      if (!res.ok) {
        let message = 'Failed to rotate API key.';
        try {
          const data = await res.json();
          message = (data as { error?: string })?.error ?? message;
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        throw new Error(message);
      }

      const data = (await res.json()) as {
        activeKeyEnvVar?: string;
        activeKeyIndex?: number;
        totalApiKeys?: number;
        message?: string;
        rotated?: boolean;
      };

      setActiveKeyEnvVar(data.activeKeyEnvVar ?? null);
      setActiveKeyIndex(data.activeKeyIndex ?? 0);
      setTotalApiKeys(data.totalApiKeys ?? 0);
      setKeyRotationMessage(
        data.message ?? (data.rotated ? 'API key rotated.' : 'Only one API key configured.'),
      );
    } catch (err) {
      setKeyRotationError((err as Error).message ?? 'Failed to rotate API key.');
    } finally {
      setRotatingKey(false);
    }
  }, []);

  const latestRun = useMemo(() => runs[0], [runs]);
  const liveToolCallList = useMemo(
    () =>
      Object.values(liveToolCalls).sort(
        (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      ),
    [liveToolCalls],
  );
  const hasLiveActivity = running || liveToolCallList.length > 0;
  const resolvedSelectedModel = selectedModel || (availableModels[0] ?? '');

  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}> 
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-white/40">Agentic Test Harness</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Tokyo Weekender Suite</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70">
              Run a guided scenario that exercises six production-like mock APIs, evaluates planning quality, and stores transcripts for audit.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3 text-right">
            <div className="flex items-center gap-2">
              <label
                htmlFor="model-select"
                className="text-xs uppercase tracking-wide text-white/50"
              >
                Model
              </label>
              <select
                id="model-select"
                value={resolvedSelectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={running || loading || availableModels.length === 0}
                className="rounded-lg bg-black/40 px-3 py-2 text-sm text-white ring-1 ring-white/20 transition focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {availableModels.length === 0 ? (
                  <option value="">No models configured</option>
                ) : (
                  availableModels.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button
              type="button"
              disabled={running || loading}
              onClick={handleRunSuite}
              className="rounded-lg bg-white/10 px-5 py-2 text-sm text-white ring-1 ring-white/20 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? 'Running…' : 'Run Test Suite'}
            </button>
            <button
              type="button"
              disabled={rotatingKey || loading}
              onClick={handleRotateKeys}
              className="rounded-lg bg-white/10 px-5 py-2 text-sm text-white ring-1 ring-white/20 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rotatingKey ? 'Rotating…' : 'Rotate API Keys'}
            </button>
            {activeKeyEnvVar && (
              <p className="text-xs text-white/50">
                Active key {activeKeyEnvVar}
                {totalApiKeys > 0 ? ` (${activeKeyIndex + 1}/${totalApiKeys})` : ''}
              </p>
            )}
            {keyRotationMessage && (
              <p className="text-xs text-emerald-300">{keyRotationMessage}</p>
            )}
            {keyRotationError && (
              <p className="text-xs text-rose-300">{keyRotationError}</p>
            )}
            {latestRun && (
              <p className="text-xs text-white/50">
                Last run {new Date(latestRun.startedAt).toLocaleString()}
              </p>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {runError && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {runError}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-white/70">Loading suite…</div>
        ) : suite ? (
          <div className="space-y-10">
            {hasLiveActivity && (
              <section className="space-y-4 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Live Tool Calls</h2>
                    <p className="text-sm text-white/60">Watch each mock API invocation as it happens.</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      running ? 'bg-white/10 text-white' : 'bg-white/5 text-white/70'
                    }`}
                  >
                    {running ? 'IN PROGRESS' : 'COMPLETED'}
                  </span>
                </div>
                {liveRunStartedAt && (
                  <p className="text-xs text-white/50">Started {new Date(liveRunStartedAt).toLocaleString()}</p>
                )}
                <div className="space-y-3">
                  {liveToolCallList.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/20 bg-black/30 p-6 text-sm text-white/60">
                      Awaiting tool activity…
                    </div>
                  ) : (
                    liveToolCallList.map((call) => (
                      <div key={call.toolCallId} className="rounded-xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{call.toolName}</p>
                            <p className="text-xs text-white/50">{call.toolId}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${liveStatusStyles[call.status]}`}>
                            {call.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-3 space-y-2 text-xs text-white/70">
                          <p>
                            <span className="font-semibold text-white/80">Input:</span>{' '}
                            <code className="rounded bg-white/10 px-1">{JSON.stringify(call.input)}</code>
                          </p>
                          {call.status === 'running' ? (
                            <p className="italic text-white/60">Awaiting response…</p>
                          ) : call.status === 'success' ? (
                            <p>
                              <span className="font-semibold text-white/80">Output:</span>{' '}
                              <span className="text-white/75">
                                {typeof call.output === 'string'
                                  ? call.output
                                  : JSON.stringify(call.output)}
                              </span>
                            </p>
                          ) : (
                            <p className="text-rose-300">Error: {call.errorMessage}</p>
                          )}
                          {call.durationMs !== undefined && call.status !== 'running' && (
                            <p className="text-white/50">Duration {Math.max(1, Math.round(call.durationMs))}ms</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            <section className="grid gap-6 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl md:grid-cols-[2fr_1fr]">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Scenario</h2>
                <p className="text-sm leading-relaxed text-white/70">{suite.narrative}</p>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/60">Deliverables</h3>
                  <ul className="mt-3 space-y-2 text-sm text-white/75">
                    {suite.deliverables.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <aside className="space-y-3 rounded-xl bg-black/40 p-4 ring-1 ring-white/10">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-white/60">Suite Metadata</h3>
                <dl className="grid gap-2 text-sm text-white/70">
                  <div className="flex justify-between">
                    <dt className="text-white/50">Suite ID</dt>
                    <dd>{suite.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-white/50">Tools Exercised</dt>
                    <dd>{suite.toolIds.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-white/50">Goal</dt>
                    <dd className="max-w-[12rem] text-right text-white/80">{suite.goal}</dd>
                  </div>
                </dl>
              </aside>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <article className="space-y-3 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
                <h2 className="text-lg font-semibold text-white">Steps</h2>
                <p className="text-sm text-white/60">The agent receives these milestones for guidance.</p>
                <ol className="mt-4 space-y-4">
                  {suite.steps.map((step, idx) => (
                    <li key={step.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-wide text-white/40">Step {idx + 1}</p>
                      <h3 className="mt-1 text-base font-semibold text-white">{step.title}</h3>
                      <p className="mt-2 text-sm text-white/70">{step.description}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/50">Success criteria</p>
                      <ul className="mt-2 space-y-1 text-sm text-white/70">
                        {step.successCriteria.map((criterion) => (
                          <li key={criterion} className="flex gap-2">
                            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-white/50" />
                            <span>{criterion}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-white/50">Suggested tools</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/70">
                        {step.suggestedTools.map((toolId) => (
                          <span key={toolId} className="rounded-full bg-white/10 px-2 py-0.5">{toolId}</span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </article>

              <article className="space-y-4 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
                <h2 className="text-lg font-semibold text-white">Mock Tool Catalog</h2>
                <p className="text-sm text-white/60">All tools hit live Next.js mock endpoints under <code className="rounded bg-black/40 px-1">/api/mock</code>.</p>
                <div className="space-y-3">
                  {tools.map((tool) => (
                    <div key={tool.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-white">{tool.name}</h3>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase text-white/70">{tool.method}</span>
                      </div>
                      <p className="mt-1 text-sm text-white/70">{tool.description}</p>
                      <p className="mt-2 text-xs text-white/50">Endpoint: {tool.path}</p>
                      <div className="mt-3 space-y-1 text-xs text-white/70">
                        {tool.parameters.map((param) => (
                          <div key={param.name} className="flex gap-2">
                            <span className="font-semibold text-white/80">{param.name}</span>
                            <span className="text-white/40">({param.type}{param.required ? ', required' : ''})</span>
                            <span className="text-white/60">— {param.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="space-y-4 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Run History</h2>
                  <p className="text-sm text-white/60">Every execution stores full transcripts and tool telemetry.</p>
                </div>
                <button
                  type="button"
                  onClick={loadSuite}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white ring-1 ring-white/20 transition hover:bg-white/15"
                >
                  Refresh
                </button>
              </div>

              {runs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/20 bg-black/30 p-10 text-center text-sm text-white/60">
                  No runs yet. Trigger the suite to see tool call telemetry and transcripts.
                </div>
              ) : (
                <div className="space-y-4">
                  {runs.map((run) => (
                    <article key={run.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-white/40">Run ID</p>
                          <p className="text-sm font-medium text-white">{run.id}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[run.status]}`}>
                          {run.status.toUpperCase()}
                        </span>
                        <div className="text-right text-xs text-white/60">
                          <p>Started {new Date(run.startedAt).toLocaleString()}</p>
                          <p>Duration {run.metrics?.durationMs ? Math.round(run.metrics.durationMs / 1000) : '—'}s</p>
                        </div>
                      </div>

                      <p className="mt-4 text-sm text-white/80">{run.summary}</p>

                      <div className="mt-4 flex items-center justify-between text-xs text-white/60">
                        <p>{run.toolCalls.length} tool calls • {run.metrics?.toolCalls ?? run.toolCalls.length} recorded</p>
                        <button
                          type="button"
                          className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white ring-1 ring-white/20 transition hover:bg-white/15"
                          onClick={() => setExpandedRunId((prev) => (prev === run.id ? null : run.id))}
                        >
                          {expandedRunId === run.id ? 'Hide details' : 'View details'}
                        </button>
                      </div>

                      {expandedRunId === run.id && (
                        <div className="mt-4 space-y-4 text-sm text-white/70">
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">Transcript</h4>
                            <div className="mt-2 space-y-2">
                              {run.transcript.map((msg, idx) => (
                                <div key={`${run.id}-msg-${idx}`} className="rounded-lg bg-black/40 p-3">
                                  <p className="text-xs uppercase tracking-wide text-white/40">{msg.role}</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-white/80">{msg.content}</pre>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-white/50">Tool Calls</h4>
                            <div className="mt-2 space-y-2">
                              {run.toolCalls.map((call, idx) => (
                                <div key={`${run.id}-tool-${idx}`} className="rounded-lg bg-black/40 p-3">
                                  <p className="text-sm font-medium text-white">{call.toolName}</p>
                                  <p className="text-xs text-white/50">{call.success ? 'Successful' : 'Failed'} • {call.durationMs}ms</p>
                                  <div className="mt-2 space-y-1 text-xs text-white/60">
                                    <p>
                                      <span className="font-semibold text-white/70">Input:</span>{' '}
                                      <code className="rounded bg-white/10 px-1">{JSON.stringify(call.input)}</code>
                                    </p>
                                    {call.errorMessage ? (
                                      <p className="text-rose-300">Error: {call.errorMessage}</p>
                                    ) : (
                                      <p>
                                        <span className="font-semibold text-white/70">Output:</span>{' '}
                                        <span className="text-white/75">
                                          {typeof call.output === 'string'
                                            ? call.output
                                            : JSON.stringify(call.output)}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}



