'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Space_Grotesk } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type TestSuite = {
  id: string;
  name: string;
  corePrompt: string;
  toolIds: string[]; // JSON array of IDs
  createdAt: string;
  updatedAt: string;
};

type ToolSimple = {
  id: string;
  name: string;
};

export default function SuitesListPage() {
  const router = useRouter();
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [toolsMap, setToolsMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Deletion State
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Suites and Tools in parallel
        const [suitesRes, toolsRes] = await Promise.all([
          fetch('/api/suites'),
          fetch('/api/tools')
        ]);

        const suitesData = await suitesRes.json();
        const toolsData = await toolsRes.json();

        // Create a map of Tool ID -> Tool Name for easy lookup
        const tMap: Record<string, string> = {};
        if (toolsData.tools && Array.isArray(toolsData.tools)) {
          toolsData.tools.forEach((t: ToolSimple) => {
            tMap[t.id] = t.name;
          });
        }

        setSuites(suitesData.suites || []);
        setToolsMap(tMap);
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/suites/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete");
      setSuites(prev => prev.filter(s => s.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      alert("Error deleting suite");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}>
      {/* --- Background Effects --- */}
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">
        
        {/* --- Header --- */}
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">Your Test Suites</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Manage your evaluation scenarios. Review configurations, execute test runs, or modify existing suites.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-lg px-4 py-2 text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
            >
              Back to Dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push('/suites/new')}
              className="rounded-lg px-4 py-2 text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
            >
              Create New Suite
            </button>
          </div>
        </header>

        {/* --- Content --- */}
        {loading ? (
          <div className="flex h-40 items-center justify-center text-white/70">Loading suites...</div>
        ) : suites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-16 text-center text-white/70">
            <p className="max-w-sm text-sm">
              No test suites found. Create one to start evaluating your agents against specific tasks.
            </p>
            <button
              type="button"
              onClick={() => router.push('/suites/new')}
              className="rounded-lg px-4 py-2 text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
            >
              Create New Suite
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {suites.map((suite) => {
              // Process tools for display
              const visibleTools = suite.toolIds.slice(0, 3);
              const remainingCount = suite.toolIds.length - 3;

              return (
                <article
                  key={suite.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl hover:bg-white/[0.07] transition duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-semibold text-white truncate pr-2">{suite.name}</h2>
                        <p className="text-xs text-white/40 mt-1">
                          Updated {new Date(suite.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-black/20 p-3 ring-1 ring-white/5">
                      <p className="text-xs font-medium uppercase tracking-wide text-white/50 mb-1">Core Prompt</p>
                      <p className="text-sm text-white/80 line-clamp-3">
                        {suite.corePrompt}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-white/50 mb-2">Allowed Tools</p>
                      <div className="flex flex-wrap gap-2">
                        {visibleTools.length > 0 ? (
                          visibleTools.map(tid => (
                            <span key={tid} className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/90 border border-white/10">
                              {toolsMap[tid] || tid}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-white/40 italic">No tools selected</span>
                        )}
                        {remainingCount > 0 && (
                          <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-white/60 border border-white/5">
                            +{remainingCount} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-2 border-t border-white/10 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      // Placeholder for Run functionality
                      onClick={() => alert(`Run functionality for ${suite.name} coming soon!`)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-200 bg-emerald-500/10 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 transition"
                    >
                      Run
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/suites/${suite.id}`)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(suite.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-200 bg-red-500/10 ring-1 ring-red-500/30 hover:bg-red-500/20 transition"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* --- Delete Confirmation Modal --- */}
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-[#0b0b0b] p-6 ring-1 ring-white/20 shadow-2xl">
              <h3 className="text-lg font-semibold text-white">Delete Test Suite</h3>
              <p className="mt-2 text-sm text-white/70">
                Are you sure you want to delete this suite? This action cannot be undone and will remove all associated run history.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  disabled={isDeleting}
                  className="rounded-lg px-4 py-2 text-sm text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="rounded-lg px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 transition shadow-lg shadow-red-900/20"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}