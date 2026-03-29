"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RegressionBaselineSummary, RegressionConfig } from "@/lib/regression";

type ProjectRegressionPanelProps = {
  projectId: string;
  baseline: RegressionBaselineSummary | null;
  config: RegressionConfig;
};

export default function ProjectRegressionPanel({
  projectId,
  baseline,
  config,
}: ProjectRegressionPanelProps) {
  const router = useRouter();
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/regression`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          regressionConfig: form,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to save regression gates.");
      }

      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleClearBaseline = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/regression`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baselineRunId: null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to clear project baseline.");
      }

      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Regression Gates</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Persist the project baseline and define what counts as a ship-blocking regression.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Baseline</p>
          {baseline ? (
            <div className="mt-2 space-y-1">
              <Link
                href={`/runs/${baseline.runId}`}
                className="font-mono text-zinc-200 hover:text-white"
              >
                {baseline.runId.slice(0, 12)}...
              </Link>
              <p className="text-zinc-500">
                Score {baseline.totalScore != null ? Math.round(baseline.totalScore) : "—"} ·{" "}
                {new Date(baseline.createdAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-zinc-500">No persisted baseline yet.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-2 text-sm">
          <span className="text-zinc-400">Max dimension drop</span>
          <input
            type="number"
            min={0}
            max={100}
            value={form.maxDimensionDrop}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                maxDimensionDrop: Number(event.target.value),
              }))
            }
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-zinc-400">Max cost increase %</span>
          <input
            type="number"
            min={0}
            max={10000}
            value={form.maxCostIncreasePct}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                maxCostIncreasePct: Number(event.target.value),
              }))
            }
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-zinc-400">Noise threshold</span>
          <input
            type="number"
            min={0}
            max={100}
            value={form.noiseThreshold}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                noiseThreshold: Number(event.target.value),
              }))
            }
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.blockErrorIncrease}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                blockErrorIncrease: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
          />
          Block error increases
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.blockRetryIncrease}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                blockRetryIncrease: event.target.checked,
              }))
            }
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
          />
          Block retry increases
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save gates"}
        </button>
        {baseline && (
          <button
            type="button"
            onClick={handleClearBaseline}
            disabled={saving}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
          >
            Clear baseline
          </button>
        )}
      </div>
    </section>
  );
}
