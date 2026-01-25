"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { generateRunPDF } from "@/lib/pdf-generator";

type Run = {
  id: string;
  status: string;
  taskName?: string | null;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  evaluations?: Array<{
    id: string;
    status: string;
    totalScore: number | null;
  }>;
};

type ProjectRunsTableProps = {
  runs: Run[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  projectId: string;
};

export default function ProjectRunsTable({
  runs,
  totalCount,
  currentPage,
  pageSize,
  projectId
}: ProjectRunsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(totalCount / pageSize);
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("page");
    } else {
      params.set("page", newPage.toString());
    }
    router.push(`/projects/${projectId}?${params.toString()}`);
  };

  const handleDownloadPDF = async (runId: string) => {
    if (downloadingRunId) return;

    setDownloadingRunId(runId);
    try {
      const response = await fetch(`/api/runs/${runId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch run data");
      }

      const data = await response.json();
      const run = data.run;
      const evaluation = data.evaluation;

      if (!evaluation || !evaluation.metricBreakdown) {
        alert("No evaluation data available for this run.");
        return;
      }

      await generateRunPDF({
        runId: run.id,
        projectName: run.project?.name,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        totalScore: evaluation.totalScore,
        confidence: evaluation.confidence,
        summary: evaluation.summary,
        metricBreakdown: evaluation.metricBreakdown,
      });
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloadingRunId(null);
    }
  };

  const handleToggleRun = (runId: string) => {
    setSelectedRuns((prev) =>
      prev.includes(runId)
        ? prev.filter((id) => id !== runId)
        : [...prev, runId]
    );
  };

  const handleCompare = () => {
    if (selectedRuns.length >= 2 && selectedRuns.length <= 4) {
      router.push(`/compare?ids=${selectedRuns.join(",")}`);
    }
  };

  const handleSelectAll = () => {
    if (selectedRuns.length === runs.length) {
      setSelectedRuns([]);
    } else {
      setSelectedRuns(runs.map((run) => run.id));
    }
  };

  if (!runs || runs.length === 0) {
    return (
      <div className="rounded-2xl bg-white/5 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl mt-10">
        <p className="text-white/70">There are no runs for this project yet.</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    if (status === "COMPLETED" || status === "COMPLETED_LOW_CONFIDENCE") {
      return "text-emerald-400";
    }
    if (status === "FAILED") {
      return "text-rose-400";
    }
    if (status === "JUDGING" || status === "PARSING" || status === "READY_FOR_JUDGING") {
      return "text-yellow-400";
    }
    return "text-white/70";
  };

  return (
    <div className="mt-10 space-y-4">
      {selectedRuns.length >= 2 && (
        <div className="flex items-center justify-between rounded-2xl bg-purple-500/10 px-6 py-4 ring-1 ring-purple-500/30">
          <p className="text-sm text-purple-200">
            {selectedRuns.length} run{selectedRuns.length !== 1 ? "s" : ""} selected
            {selectedRuns.length > 4 && " (max 4 for comparison)"}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedRuns([])}
              className="px-4 py-2 rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/15 transition ring-1 ring-white/20 text-sm"
            >
              Clear Selection
            </button>
            <button
              onClick={handleCompare}
              disabled={selectedRuns.length < 2 || selectedRuns.length > 4}
              className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
            >
              Compare Runs
            </button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-white/70">
              <th className="px-6 py-3 w-12">
                <input
                  type="checkbox"
                  checked={selectedRuns.length === runs.length && runs.length > 0}
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
                />
              </th>
              <th className="px-6 py-3">Run ID</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Score</th>
            <th className="px-6 py-3">Created</th>
            <th className="px-6 py-3">Completed</th>
            <th className="px-6 py-3">Actions</th>
          </tr>
        </thead>

        <tbody>
          {runs.map((run: Run) => {
            const evaluation = run.evaluations?.[0];
            const score = evaluation?.totalScore !== null && evaluation?.totalScore !== undefined
              ? Math.round(evaluation.totalScore)
              : null;

            return (
              <tr
                key={run.id}
                className="border-b border-white/5 text-white/90 hover:bg-white/5 transition"
              >
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    checked={selectedRuns.includes(run.id)}
                    onChange={() => handleToggleRun(run.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
                  />
                </td>
                <td className="px-6 py-4">
                  <Link
                    href={`/runs/${run.id}`}
                    className="font-mono text-sm text-purple-300 hover:text-purple-200 underline"
                  >
                    {run.id.slice(0, 12)}...
                  </Link>
                </td>
                <td className={`px-6 py-4 ${getStatusColor(run.status)}`}>
                  {run.status}
                </td>
                <td className="px-6 py-4">
                  {score !== null ? (
                    <span className="font-semibold text-purple-300">{score}/100</span>
                  ) : (
                    <span className="text-white/40">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {new Date(run.createdAt).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  {run.completedAt
                    ? new Date(run.completedAt).toLocaleString()
                    : "—"}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadPDF(run.id);
                    }}
                    disabled={downloadingRunId === run.id || !run.evaluations?.[0]}
                    className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition ring-1 ring-purple-500/30 text-sm font-medium flex items-center gap-2"
                    title={!run.evaluations?.[0] ? "No evaluation available" : "Download PDF report"}
                  >
                    {downloadingRunId === run.id ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </>
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {totalPages > 1 && (
        <div className="border-t border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-white/60">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} runs
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition ring-1 ring-white/10"
            >
              Previous
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((pageNum) => {
                  return (
                    pageNum === 1 ||
                    pageNum === totalPages ||
                    (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                  );
                })
                .map((pageNum, index, array) => {
                  const showEllipsisBefore = index > 0 && pageNum - array[index - 1] > 1;

                  return (
                    <div key={pageNum} className="flex items-center gap-2">
                      {showEllipsisBefore && (
                        <span className="text-white/40 px-2">...</span>
                      )}
                      <button
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-1 rounded-lg text-sm transition ${
                          currentPage === pageNum
                            ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30"
                            : "bg-white/5 text-white/70 hover:text-white hover:bg-white/10 ring-1 ring-white/10"
                        }`}
                      >
                        {pageNum}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition ring-1 ring-white/10"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
