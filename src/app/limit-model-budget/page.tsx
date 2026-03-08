'use client';

import { useMemo, useState } from 'react';
import { encode } from 'gpt-tokenizer';

const MILLION = 1_000_000;

const BUDGET_OPTIONS = [
  { label: '$5 - smoke testing', value: 5 },
  { label: '$10 - basic regression', value: 10 },
  { label: '$25 - daily run', value: 25 },
  { label: '$50 - extended run', value: 50 },
  { label: '$100 - load test', value: 100 },
];

type TokenLogEntry = {
  id: string;
  targetUrl: string;
  tokens: number;
  cost: number;
  recordedAt: string;
};

const makeEntryId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const countTokens = (payload: string) => encode(payload ?? '').length;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);

export default function LimitModelBudgetPage() {
  const [selectedBudget, setSelectedBudget] = useState<number>(BUDGET_OPTIONS[1]!.value);
  const [costPerMillion, setCostPerMillion] = useState<number>(0.1);
  const [requestBody, setRequestBody] = useState<string>('');
  const [responseBody, setResponseBody] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState<string>('https://api.model-gateway.example.com/v1/chat/completions');
  const [tokenLog, setTokenLog] = useState<TokenLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const totalSpent = useMemo(() => tokenLog.reduce((sum, entry) => sum + entry.cost, 0), [tokenLog]);
  const totalTokens = useMemo(() => tokenLog.reduce((sum, entry) => sum + entry.tokens, 0), [tokenLog]);
  const remainingBudget = Math.max(0, selectedBudget - totalSpent);
  const percentUsed = selectedBudget > 0 ? Math.min(100, (totalSpent / selectedBudget) * 100) : 0;

  const handleRecordCall = () => {
    setError(null);

    const sanitizedUrl = targetUrl.trim();
    if (!sanitizedUrl) {
      setError('Target endpoint is required.');
      return;
    }

    if (costPerMillion <= 0) {
      setError('Model cost must be greater than 0.');
      return;
    }

    const payloadTokens = countTokens(requestBody.trim());
    const responseTokens = countTokens(responseBody.trim());
    const totalCallTokens = Math.max(100, payloadTokens + responseTokens);

    if (totalCallTokens === 0) {
      setError('Enter either a request or response payload to measure tokens.');
      return;
    }

    const callCost = Number(((totalCallTokens / MILLION) * costPerMillion).toFixed(6));

    if (totalSpent + callCost > selectedBudget) {
      setError('Budget exceeded. Block this request before calling the model API.');
      return;
    }

    setTokenLog((prev) => [
      {
        id: makeEntryId(),
        targetUrl: sanitizedUrl,
        tokens: totalCallTokens,
        cost: callCost,
        recordedAt: new Date().toISOString(),
      },
      ...prev,
    ]);

    setRequestBody('');
    setResponseBody('');
  };

  const handleReset = () => {
    setTokenLog([]);
    setError(null);
  };

  return (
    <main className="min-h-screen w-full bg-zinc-950">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-zinc-100">Limit Model Budget</h1>
          <p className="max-w-3xl text-sm text-zinc-400">
            Gate outbound model calls with a hard budget. Select a budget, configure the model cost per million tokens,
            and track how many tokens (and dollars) each call consumes using deterministic token counts powered by
            <code className="mx-1 rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-300">gpt-tokenizer</code>.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <article className="space-y-5 rounded-xl bg-zinc-900 border border-zinc-800 p-6">
              <header>
                <h2 className="text-xl font-semibold text-zinc-100">Budget Controls</h2>
                <p className="text-sm text-zinc-500">Set the cap, cost, and payloads that drive token usage.</p>
              </header>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

              <label className="block space-y-2 text-sm text-zinc-300">
                <span>Model budget</span>
                <select
                  value={selectedBudget}
                  onChange={(event) => {
                    setTokenLog([]);
                    setSelectedBudget(Number(event.target.value));
                  }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                >
                  {BUDGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm text-zinc-300">
                <span>Model cost (per 1M tokens)</span>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={costPerMillion}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/,/g, '.');
                      const parsed = Number(raw);
                      setCostPerMillion(Number.isFinite(parsed) ? parsed : 0);
                    }}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 pr-16 text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-zinc-500">
                    USD / 1M
                  </span>
                </div>
              </label>

              <label className="block space-y-2 text-sm text-zinc-300">
                <span>Model API endpoint</span>
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2 text-sm text-zinc-300">
                  <span>Request payload (JSON sent to the API)</span>
                  <textarea
                    value={requestBody}
                    onChange={(event) => setRequestBody(event.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                    placeholder='{"messages":[{"role":"user","content":"Draft release notes..."}]}'
                  />
                </label>

                <label className="block space-y-2 text-sm text-zinc-300">
                  <span>Response payload (optional)</span>
                  <textarea
                    value={responseBody}
                    onChange={(event) => setResponseBody(event.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                    placeholder='{"id":"run_123","choices":[{"message":{"content":"Here are the release notes..."}}]}'
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={handleRecordCall}
                  className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 transition"
                >
                  Record API Call
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition"
                >
                  Reset usage
                </button>
              </div>
            </article>
          </div>

          <article className="flex flex-col gap-5 rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <header>
              <h2 className="text-xl font-semibold text-zinc-100">Budget Monitor</h2>
              <p className="text-sm text-zinc-500">Automatic calculations block calls that would exceed the cap.</p>
            </header>

            <div className="space-y-4 rounded-lg bg-zinc-950 p-4 border border-zinc-800">
              <div className="flex items-center justify-between text-sm text-zinc-400">
                <span>Budget used</span>
                <span>
                  {formatCurrency(totalSpent)} / {formatCurrency(selectedBudget)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${percentUsed}%` }} />
              </div>
              <div className="flex flex-wrap gap-6 text-sm text-zinc-400">
                <div>
                  <p className="text-xs uppercase text-zinc-500">Remaining</p>
                  <p className="text-lg font-semibold text-zinc-100">{formatCurrency(remainingBudget)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-zinc-500">Tokens sent</p>
                  <p className="text-lg font-semibold text-zinc-100">{totalTokens.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-zinc-400">Recent calls</p>
              {tokenLog.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 px-4 py-8 text-center text-sm text-zinc-500">
                  No calls recorded yet. Enter a payload and click &ldquo;Record API Call&rdquo; to simulate usage.
                </div>
              ) : (
                <ul className="space-y-3">
                  {tokenLog.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                        <span>{new Date(entry.recordedAt).toLocaleString()}</span>
                        <span>Endpoint: {entry.targetUrl}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-6 text-base text-zinc-100">
                        <div>
                          <p className="text-xs uppercase text-zinc-500">Tokens</p>
                          <p className="font-semibold">{entry.tokens.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-zinc-500">Cost</p>
                          <p className="font-semibold">{formatCurrency(entry.cost)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
