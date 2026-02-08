"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type RunForCompare = {
  id: string;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  evaluations?: Array<{
    status: string;
    totalScore: number | null;
  }>;
};

type CompareRunsModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  runs: RunForCompare[];
};

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export default function CompareRunsModal({
  open,
  onClose,
  projectId,
  projectName,
  runs,
}: CompareRunsModalProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const completedRuns = runs.filter((run) => {
    const ev = run.evaluations?.[0];
    return (
      ev &&
      ev.status === "COMPLETED" &&
      ev.totalScore != null
    );
  });

  const toggleRun = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (selectedIds.size !== 2) return;
    const ids = Array.from(selectedIds);
    onClose();
    router.push(`/compare?ids=${ids.join(",")}&projectId=${projectId}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-2xl rounded-2xl bg-gray-900 ring-1 ring-white/10 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">Compare Runs</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white transition"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-white/60 mb-4">
            Select exactly 2 runs to compare scores, dimensions, and execution metrics. {projectName && `(Project: ${projectName})`}
          </p>

          {completedRuns.length < 2 ? (
            <div className="rounded-xl bg-white/5 p-6 text-center ring-1 ring-white/10">
              <p className="text-white/70">
                At least 2 completed runs with scores are needed to compare. Run evaluations first from the project page.
              </p>
              <Link
                href={`/projects/${projectId}`}
                className="mt-4 inline-block text-sm text-purple-300 hover:text-purple-200"
              >
                Back to project →
              </Link>
            </div>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto rounded-xl ring-1 ring-white/10">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-white/70">
                      <th className="w-12 px-4 py-3"></th>
                      <th className="px-4 py-3">Run ID</th>
                      <th className="px-4 py-3 whitespace-nowrap">Completed</th>
                      <th className="px-4 py-3 text-right w-20">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRuns.map((run) => {
                      const ev = run.evaluations?.[0];
                      const score = ev?.totalScore != null ? Math.round(ev.totalScore) : null;
                      const checked = selectedIds.has(run.id);
                      return (
                        <tr
                          key={run.id}
                          onClick={() => toggleRun(run.id)}
                          className={`border-b border-white/5 cursor-pointer transition ${
                            checked ? "bg-purple-500/15 ring-1 ring-purple-500/30" : "hover:bg-white/5"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRun(run.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-2 focus:ring-purple-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-purple-300">
                            {run.id.slice(0, 12)}...
                          </td>
                          <td className="px-4 py-3 text-white/80 whitespace-nowrap">
                            {run.completedAt
                              ? dateTimeFormat.format(new Date(run.completedAt))
                              : dateTimeFormat.format(new Date(run.createdAt))}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-purple-300">{score}/100</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-white/50">
                  {selectedIds.size === 2
                    ? "2 runs selected. Click Compare to view the comparison."
                    : `Select 2 runs (${selectedIds.size} selected)`}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition ring-1 ring-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompare}
                    disabled={selectedIds.size !== 2}
                    className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Compare
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
