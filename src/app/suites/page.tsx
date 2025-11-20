// 'use client';

// import { useState, useEffect, useCallback } from 'react';
// import { useRouter } from 'next/navigation';
// import { Space_Grotesk } from 'next/font/google';

// const spaceGrotesk = Space_Grotesk({
//   subsets: ['latin'],
//   weight: ['400', '500', '600', '700'],
// });

// type TestSuite = {
//   id: string;
//   name: string;
//   corePrompt: string;
//   toolIds: string[]; 
//   createdAt: string;
//   updatedAt: string;
// };

// type ToolSimple = {
//   id: string;
//   name: string;
// };

// export default function SuitesListPage() {
//   const router = useRouter();
//   const [suites, setSuites] = useState<TestSuite[]>([]);
//   const [toolsMap, setToolsMap] = useState<Record<string, string>>({});
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [deletingId, setDeletingId] = useState<string | null>(null);

//   const loadSuites = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const [suitesRes, toolsRes] = await Promise.all([fetch('/api/suites'), fetch('/api/tools')]);
//       const suitesData = await suitesRes.json();
//       const toolsData = await toolsRes.json();

//       const tMap: Record<string, string> = {};
//       if (toolsData.tools && Array.isArray(toolsData.tools)) {
//         toolsData.tools.forEach((t: ToolSimple) => {
//           tMap[t.id] = t.name;
//         });
//       }

//       setSuites(suitesData.suites || []);
//       setToolsMap(tMap);
//     } catch (err) {
//       console.error('Failed to load data', err);
//       setError('Failed to load suites. Please refresh.');
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     void loadSuites();
//   }, [loadSuites]);

//   const handleDelete = async (suiteId: string) => {
//     const confirmed = window.confirm('Are you sure you want to delete the Test Suite?');
//     if (!confirmed) return;

//     setDeletingId(suiteId);
//     setError(null);
//     try {
//       const response = await fetch('/api/suites', {
//         method: 'DELETE',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ suiteId }),
//       });
//       const data = await response.json().catch(() => ({}));
//       if (!response.ok) {
//         throw new Error(data.error || 'Failed to delete suite');
//       }
//       setSuites((prev) => prev.filter((suite) => suite.id !== suiteId));
//     } catch (err) {
//       setError((err as Error).message);
//     } finally {
//       setDeletingId(null);
//     }
//   };

'use client';

// Import core React utilities for state, effects, and memoized callbacks
import { useState, useEffect, useCallback } from 'react';
// Router hook for client-side navigation
import { useRouter } from 'next/navigation';
// Import Google font
import { Space_Grotesk } from 'next/font/google';

// Configure Space Grotesk font
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// Type definition for a Test Suite
// Represents the structure returned from the backend
type TestSuite = {
  id: string;
  name: string;
  corePrompt: string;
  toolIds: string[]; 
  createdAt: string;
  updatedAt: string;
};

// Minimal structure for Tools to map IDs → Names
type ToolSimple = {
  id: string;
  name: string;
};

export default function SuitesListPage() {
  const router = useRouter();

  // State for list of suites
  const [suites, setSuites] = useState<TestSuite[]>([]);
  // Maps toolId → toolName
  const [toolsMap, setToolsMap] = useState<Record<string, string>>({});
  // Loading indicator
  const [loading, setLoading] = useState(true);
  // Holds any errors from fetching
  const [error, setError] = useState<string | null>(null);
  // Track which suite is currently being deleted
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch suites and tools in parallel
  const loadSuites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Make parallel API requests for suites + tools
      const [suitesRes, toolsRes] = await Promise.all([fetch('/api/suites'), fetch('/api/tools')]);
      const suitesData = await suitesRes.json();
      const toolsData = await toolsRes.json();

      // Build a mapping of toolId → toolName
      const tMap: Record<string, string> = {};
      if (toolsData.tools && Array.isArray(toolsData.tools)) {
        toolsData.tools.forEach((t: ToolSimple) => {
          tMap[t.id] = t.name;
        });
      }

      // Update state with fetched data
      setSuites(suitesData.suites || []);
      setToolsMap(tMap);
    } catch (err) {
      console.error('Failed to load data', err);
      setError('Failed to load suites. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load suites on component mount
  useEffect(() => {
    void loadSuites();
  }, [loadSuites]);

  // Delete handler for removing a suite
  const handleDelete = async (suiteId: string) => {
    // Confirm action with the user
    const confirmed = window.confirm('Are you sure you want to delete the Test Suite?');
    if (!confirmed) return;

    setDeletingId(suiteId);
    setError(null);

    try {
      // Request-suite deletion
      const response = await fetch('/api/suites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suiteId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete suite');
      }

      // Remove it from the UI list
      setSuites((prev) => prev.filter((suite) => suite.id !== suiteId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
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
              Create a Tool Define the interface your agent will leverage. Provide a clear description, list the input parameters, and specify the output format so your harness knows how to invoke it.
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

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* --- Content --- */}
        {loading ? (
          <div className="flex h-40 items-center justify-center text-white/70">Loading suites...</div>
        ) : suites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-16 text-center text-white/70">
            <p className="max-w-sm text-sm">
              No test suites found. Create one to start evaluating your agents.
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
                      <button
                        type="button"
                        onClick={() => handleDelete(suite.id)}
                        disabled={deletingId === suite.id}
                        className="
                          rounded-lg px-3 py-1 text-xs font-medium
                          text-red-200 bg-red-500/10 ring-1 ring-red-500/30
                          hover:bg-red-500/20 transition disabled:opacity-60
                        "
                      >
                        {deletingId === suite.id ? 'Deleting…' : 'Delete'}
                      </button>
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
                      onClick={() => alert(`Run functionality coming soon!`)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-200 bg-emerald-500/10 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 transition"
                    >
                      Run
                    </button>
                    <button
                      type="button"
                      onClick={() => alert(`Edit functionality coming soon!`)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
                    >
                      Edit
                    </button>
                    
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
