"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Rubric = {
  id: string;
  name: string;
  description: string | null;
  dimensions: any;
  isDefault: boolean;
  createdAt: string;
  _count: {
    testSuites: number;
    runs: number;
  };
};

export default function RubricsPage() {
  const router = useRouter();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    // In a real app, you'd get this from context or auth
    // For now, we'll use the first workspace the user has access to
    const fetchWorkspace = async () => {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user?.memberships?.[0]) {
          setWorkspaceId(data.user.memberships[0].workspaceId);
        }
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
          setRubrics(data.rubrics);
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white/60">Loading rubrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      <div className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Evaluation Rubrics
            </h1>
            <p className="text-white/60">
              Define custom evaluation criteria for your AI agent tests
            </p>
          </div>
          <Link
            href="/rubrics/new"
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition shadow-lg shadow-purple-500/25"
          >
            + Create Rubric
          </Link>
        </div>

        {rubrics.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-semibold mb-2">No rubrics yet</h2>
            <p className="text-white/60 mb-6">
              Create your first evaluation rubric to get started
            </p>
            <Link
              href="/rubrics/new"
              className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition"
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
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 hover:border-purple-500/30 transition"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{rubric.name}</h3>
                        {rubric.isDefault && (
                          <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded-lg">
                            Default
                          </span>
                        )}
                      </div>
                      {rubric.description && (
                        <p className="text-white/60 text-sm mb-3">
                          {rubric.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-white/50">
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
                        className="px-4 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(rubric.id)}
                        className={`px-4 py-2 rounded-lg text-sm transition ${
                          deleteConfirm === rubric.id
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-white/5 hover:bg-red-500/20 text-red-400"
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
                      {(rubric.dimensions as any[]).map((dim: any, idx: number) => (
                        <div
                          key={idx}
                          className="px-3 py-1 bg-white/5 rounded-lg text-sm"
                        >
                          <span className="text-white/80">{dim.name}</span>
                          <span className="text-white/40 ml-2">
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
            className="text-white/60 hover:text-white transition text-sm"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
