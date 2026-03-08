"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Rubric = {
  id: string;
  name: string;
  description: string | null;
  dimensions: Array<{ name: string; weight: number; description?: string }>;
  isDefault: boolean;
  createdAt: string;
  _count: {
    testSuites: number;
    runs: number;
  };
};

export default function RubricsPage() {
  useRouter(); // Keep for potential future navigation
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          const wsId =
            data.workspaceId ??
            data.user?.memberships?.[0]?.workspaceId ??
            null;
          setWorkspaceId(wsId);
        }
      } catch {
        // leave workspaceId null
      } finally {
        setLoading(false);
      }
    };
    fetchWorkspace();
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchRubrics = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/rubrics?workspaceId=${workspaceId}`);
        if (res.ok) {
          const data = await res.json();
          setRubrics(data.rubrics ?? []);
        }
      } catch (error) {
        console.error("Error fetching rubrics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRubrics();
  }, [workspaceId]);

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }

    try {
      const res = await fetch(`/api/rubrics/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setRubrics((prev) => prev.filter((r) => r.id !== id));
        setDeleteConfirm(null);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to delete rubric");
      }
    } catch (error) {
      console.error("Error deleting rubric:", error);
      alert("Failed to delete rubric");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-zinc-600 border-t-zinc-100 mx-auto mb-4"></div>
          <p className="text-zinc-500">Loading rubrics...</p>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-zinc-400 mb-4">You are not in any workspace. Rubrics are scoped to a workspace.</p>
          <Link href="/" className="text-indigo-400 hover:text-indigo-300 transition">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100 mb-2">
              Evaluation Rubrics
            </h1>
            <p className="text-zinc-500">
              Define custom evaluation criteria for your AI agent tests
            </p>
          </div>
          <Link
            href="/rubrics/new"
            className="px-6 py-3 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg font-medium transition"
          >
            + Create Rubric
          </Link>
        </div>

        {rubrics.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-semibold text-zinc-100 mb-2">No rubrics yet</h2>
            <p className="text-zinc-500 mb-6">
              Create your first evaluation rubric to get started
            </p>
            <Link
              href="/rubrics/new"
              className="inline-block px-6 py-3 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-lg font-medium transition"
            >
              Create Rubric
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {rubrics.map((rubric) => {
              const dimensionCount = Array.isArray(rubric.dimensions)
                ? rubric.dimensions.length
                : 0;

              return (
                <div
                  key={rubric.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-700 transition"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-zinc-100">{rubric.name}</h3>
                        {rubric.isDefault && (
                          <span className="bg-indigo-500/10 text-indigo-400 text-xs rounded-md px-2 py-0.5">
                            Default
                          </span>
                        )}
                      </div>
                      {rubric.description && (
                        <p className="text-zinc-400 text-sm mb-3">
                          {rubric.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-zinc-500">
                        <span>{dimensionCount} dimensions</span>
                        <span>•</span>
                        <span>
                          Used in {rubric._count.testSuites} test suite
                          {rubric._count.testSuites !== 1 ? "s" : ""}
                        </span>
                        <span>•</span>
                        <span>
                          {rubric._count.runs} run
                          {rubric._count.runs !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/rubrics/${rubric.id}/edit`}
                        className="px-4 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg transition text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(rubric.id)}
                        className={`px-4 py-2 rounded-lg text-sm transition ${
                          deleteConfirm === rubric.id
                            ? "bg-red-500 text-white hover:bg-red-600"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                        }`}
                        disabled={
                          rubric._count.testSuites > 0 || rubric._count.runs > 0
                        }
                      >
                        {deleteConfirm === rubric.id ? "Confirm?" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {dimensionCount > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {rubric.dimensions.map((dim, idx) => (
                        <div
                          key={idx}
                          className="bg-zinc-800 text-zinc-300 text-xs rounded-md px-2 py-0.5"
                        >
                          <span className="text-zinc-300">{dim.name}</span>
                          <span className="text-zinc-500 ml-2">
                            {(dim.weight * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-zinc-500 hover:text-zinc-300 transition text-sm"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
