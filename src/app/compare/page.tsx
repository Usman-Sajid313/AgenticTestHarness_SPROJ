"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import ComparisonView from "@/app/components/runs/ComparisonView";

type ComparisonData = {
  runs: Array<{
    id: string;
    projectId: string;
    projectName?: string;
    status: string;
    createdAt: string | Date;
    completedAt?: string | Date | null;
    evaluation: {
      id: string;
      status: string;
      totalScore: number | null;
      confidence: number | null;
      summary: string | null;
      metricBreakdown: {
        overallComment?: string;
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
    metrics: {
      totalSteps: number;
      totalToolCalls: number;
      totalErrors: number;
      totalRetries: number;
      totalDurationMs: number | null;
    } | null;
    ruleFlags: Array<{
      flagType: string;
      severity: string;
      message: string;
    }>;
  }>;
  dimensionComparison: Record<
    string,
    {
      name: string;
      scores: Array<{ runId: string; score: number | null; delta: number | null }>;
      baseline: number | null;
    }
  >;
  metricComparison: Record<
    string,
    Array<{ runId: string; value: number | null; delta: number | null }>
  >;
  comparedAt: string;
};

function ComparePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ids = searchParams.get("ids");
  const projectId = searchParams.get("projectId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(
    null
  );

  useEffect(() => {
    if (!ids) {
      setError("No runs selected for comparison");
      setLoading(false);
      return;
    }

    const runIds = ids.split(",").filter((id) => id.trim());
    if (runIds.length < 2) {
      setError("At least 2 runs are required for comparison");
      setLoading(false);
      return;
    }

    if (runIds.length > 4) {
      setError("Maximum 4 runs can be compared at once");
      setLoading(false);
      return;
    }

    loadComparison(ids);
  }, [ids]);

  const loadComparison = async (runIds: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/runs/compare?ids=${runIds}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load comparison");
      }

      const data = (await response.json()) as ComparisonData;
      setComparisonData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comparison");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRun = (runId: string) => {
    if (!ids) return;
    const runIds = ids.split(",").filter((id) => id.trim() !== runId);
    if (runIds.length < 2) {
      setError("At least 2 runs are required for comparison");
      return;
    }
    const query = new URLSearchParams({ ids: runIds.join(",") });
    if (projectId) query.set("projectId", projectId);
    router.push(`/compare?${query.toString()}`);
  };

  const handleExportJSON = () => {
    if (!comparisonData) return;

    const dataStr = JSON.stringify(comparisonData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `comparison-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />

      <div className="relative mx-auto max-w-7xl px-6 py-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            {projectId ? (
              <Link
                href={`/projects/${projectId}`}
                className="text-sm text-purple-300 hover:text-purple-200 mb-2 inline-block"
              >
                ← Back to Project
              </Link>
            ) : (
              <Link
                href="/projects"
                className="text-sm text-purple-300 hover:text-purple-200 mb-2 inline-block"
              >
                ← Back to Projects
              </Link>
            )}
            <h1 className="text-3xl font-semibold text-white">
              Run Comparison
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Compare multiple runs side-by-side to understand improvements and
              regressions
            </p>
          </div>
          {comparisonData && (
            <button
              onClick={handleExportJSON}
              className="rounded-lg bg-white/10 px-5 py-2 text-sm text-white ring-1 ring-white/20 transition hover:bg-white/15"
            >
              Export JSON
            </button>
          )}
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-white/5 p-10 ring-1 ring-white/10 backdrop-blur-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
              <p className="text-white/70">Loading comparison...</p>
            </div>
          </div>
        ) : comparisonData ? (
          <ComparisonView
            data={comparisonData}
            onRemoveRun={handleRemoveRun}
          />
        ) : (
          <div className="rounded-2xl bg-white/5 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
            <p className="text-white/70">
              {error || "Select runs from a project to compare them"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-screen w-full bg-black">
          <div className="absolute inset-0 bg-deep-space" />
          <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
          <div className="relative mx-auto max-w-7xl px-6 py-12">
            <div className="flex h-64 items-center justify-center rounded-2xl bg-white/5 p-10 ring-1 ring-white/10 backdrop-blur-xl">
              <div className="text-center">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                <p className="text-white/70">Loading...</p>
              </div>
            </div>
          </div>
        </main>
      }
    >
      <ComparePageContent />
    </Suspense>
  );
}
