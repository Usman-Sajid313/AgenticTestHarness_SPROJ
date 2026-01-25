'use client';

import { useMemo, useState } from 'react';
import { Space_Grotesk } from 'next/font/google';
import { encode } from 'gpt-tokenizer';

// Load the font used throughout the UI
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// For converting token count into million tokens
const MILLION = 1_000_000;

// Predefined dropdown options for model budget
const BUDGET_OPTIONS = [
  { label: '$5 • smoke testing', value: 5 },
  { label: '$10 • basic regression', value: 10 },
  { label: '$25 • daily run', value: 25 },
  { label: '$50 • extended run', value: 50 },
  { label: '$100 • load test', value: 100 },
];

// Shape of each recorded API call entry
type TokenLogEntry = {
  id: string;
  targetUrl: string;
  tokens: number;
  cost: number;
  recordedAt: string;
};

// Generates a unique ID for each call entry
const makeEntryId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// Counts tokens using gpt-tokenizer
const countTokens = (payload: string) => encode(payload ?? '').length;

// Formats numbers into USD currency
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);

export default function LimitModelBudgetPage() {
  // Budget and pricing inputs
  const [selectedBudget, setSelectedBudget] = useState<number>(BUDGET_OPTIONS[1]!.value);
  const [costPerMillion, setCostPerMillion] = useState<number>(0.1);
  
  // Request + response payloads (user input)
  const [requestBody, setRequestBody] = useState<string>('');
  const [responseBody, setResponseBody] = useState<string>('');
  
  // Simulated API endpoint URL
  const [targetUrl, setTargetUrl] = useState<string>('https://api.model-gateway.example.com/v1/chat/completions');
  
  // Log of all simulated calls
  const [tokenLog, setTokenLog] = useState<TokenLogEntry[]>([]);
  
  // For displaying validation errors
  const [error, setError] = useState<string | null>(null);

  // Sum of all recorded costs
  const totalSpent = useMemo(() => tokenLog.reduce((sum, entry) => sum + entry.cost, 0), [tokenLog]);
  
  // Sum of all tokens across all calls
  const totalTokens = useMemo(() => tokenLog.reduce((sum, entry) => sum + entry.tokens, 0), [tokenLog]);
  
  // Remaining money after previous calls
  const remainingBudget = Math.max(0, selectedBudget - totalSpent);
  
  // Percentage of budget consumed (for progress bar)
  const percentUsed = selectedBudget > 0 ? Math.min(100, (totalSpent / selectedBudget) * 100) : 0;

  // Handles adding a new simulated API call
  const handleRecordCall = () => {
    setError(null);

    // Validate endpoint
    const sanitizedUrl = targetUrl.trim();
    if (!sanitizedUrl) {
      setError('Target endpoint is required.');
      return;
    }

    // Validate price
    if (costPerMillion <= 0) {
      setError('Model cost must be greater than 0.');
      return;
    }

    // Count request + response tokens
    const payloadTokens = countTokens(requestBody.trim());
    const responseTokens = countTokens(responseBody.trim());
    
    // Guarantee a minimum of 100 tokens 
    const totalCallTokens = Math.max(100, payloadTokens + responseTokens);

    if (totalCallTokens === 0) {
      setError('Enter either a request or response payload to measure tokens.');
      return;
    }

    // Convert token usage into cost in USD
    const callCost = Number(((totalCallTokens / MILLION) * costPerMillion).toFixed(6));

    // Prevent exceeding budget
    if (totalSpent + callCost > selectedBudget) {
      setError('Budget exceeded. Block this request before calling the model API.');
      return;
    }

    // Add new entry to the log
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

    // Reset inputs after logging call
    setRequestBody('');
    setResponseBody('');
  };

  // Clears token log + errors
  const handleReset = () => {
    setTokenLog([]);
    setError(null);
  };

  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}>
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Limit Model Budget</h1>
          <p className="max-w-3xl text-sm text-white/70">
            Gate outbound model calls with a hard budget. Select a budget, configure the model cost per million tokens,
            and track how many tokens (and dollars) each call consumes using deterministic token counts powered by
            <code className="mx-1 rounded bg-black/60 px-1 py-0.5 text-xs text-white/80">gpt-tokenizer</code>.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <article className="space-y-5 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <header>
                <h2 className="text-xl font-semibold text-white">Budget Controls</h2>
                <p className="text-sm text-white/60">Set the cap, cost, and payloads that drive token usage.</p>
              </header>

              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}

              <label className="block space-y-2 text-sm text-white/80">
                <span>Model budget</span>
                <select
                  value={selectedBudget}
                  onChange={(event) => {
                    setTokenLog([]);
                    setSelectedBudget(Number(event.target.value));
                  }}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  {BUDGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 text-sm text-white/80">
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
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 pr-16 text-white focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-white/60">
                    USD / 1M
                  </span>
                </div>
              </label>

              <label className="block space-y-2 text-sm text-white/80">
                <span>Model API endpoint</span>
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2 text-sm text-white/80">
                  <span>Request payload (JSON sent to the API)</span>
                  <textarea
                    value={requestBody}
                    onChange={(event) => setRequestBody(event.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                    placeholder='{"messages":[{"role":"user","content":"Draft release notes..."}]}'
                  />
                </label>

                <label className="block space-y-2 text-sm text-white/80">
                  <span>Response payload (optional)</span>
                  <textarea
                    value={responseBody}
                    onChange={(event) => setResponseBody(event.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                    placeholder='{"id":"run_123","choices":[{"message":{"content":"Here are the release notes..."}}]}'
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={handleRecordCall}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Record API Call
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  Reset usage
                </button>
              </div>
            </article>
          </div>

          <article className="flex flex-col gap-5 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <header>
              <h2 className="text-xl font-semibold text-white">Budget Monitor</h2>
              <p className="text-sm text-white/60">Automatic calculations block calls that would exceed the cap.</p>
            </header>

            <div className="space-y-4 rounded-xl bg-black/40 p-4 ring-1 ring-white/5">
              <div className="flex items-center justify-between text-sm text-white/70">
                <span>Budget used</span>
                <span>
                  {formatCurrency(totalSpent)} / {formatCurrency(selectedBudget)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-purple-400" style={{ width: `${percentUsed}%` }} />
              </div>
              <div className="flex flex-wrap gap-6 text-sm text-white/70">
                <div>
                  <p className="text-xs uppercase text-white/40">Remaining</p>
                  <p className="text-lg font-semibold text-white">{formatCurrency(remainingBudget)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-white/40">Tokens sent</p>
                  <p className="text-lg font-semibold text-white">{totalTokens.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-white/70">Recent calls</p>
              {tokenLog.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/20 px-4 py-8 text-center text-sm text-white/50">
                  No calls recorded yet. Enter a payload and click &ldquo;Record API Call&rdquo; to simulate usage.
                </div>
              ) : (
                <ul className="space-y-3">
                  {tokenLog.map((entry) => (
                    <li key={entry.id} className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/80">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
                        <span>{new Date(entry.recordedAt).toLocaleString()}</span>
                        <span>Endpoint: {entry.targetUrl}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-6 text-base text-white">
                        <div>
                          <p className="text-xs uppercase text-white/40">Tokens</p>
                          <p className="font-semibold">{entry.tokens.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-white/40">Cost</p>
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
