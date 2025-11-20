'use client'; // Enable client-side rendering

import { useState, useEffect } from 'react'; // React hooks for state and lifecycle
import { useRouter } from 'next/navigation'; // Next.js router for navigation
import { Space_Grotesk } from 'next/font/google'; // Custom Google Font loader

// Font configuration
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// Type for tool objects coming from /api/tools
type ToolSummary = { id: string; name: string; description: string };

// Main component for creating a new suite
export default function NewSuitePage() {
  const router = useRouter();
  const [tools, setTools] = useState<ToolSummary[]>([]); // All available tools
  
  
  const [name, setName] = useState(''); // Suite name input
  const [corePrompt, setCorePrompt] = useState(''); // Core prompt input
  const [selectedTools, setSelectedTools] = useState<string[]>([]); // Tools the user selects
  const [loading, setLoading] = useState(false); // Loading state during submit
  const [error, setError] = useState<string | null>(null); // Error message display

  
  useEffect(() => {
    // Load tools on page mount
    fetch('/api/tools')
      .then((res) => res.json())
      .then((data) => setTools(data.tools || []))
      .catch(() => console.error("Failed to load tools"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic validation
    if (!name || !corePrompt || selectedTools.length === 0) {
      setError("Please fill in all required fields and select at least one tool.");
      setLoading(false);
      return;
    }

    try {
      // Create suite request
      const res = await fetch('/api/suites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          corePrompt,
          toolIds: selectedTools,
          config: { temperature: 0.7 }, // Example config
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create suite');
      }

      
      router.push('/suites'); // Navigate after success
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTool = (id: string) => {
    // Toggle tool selection
    setSelectedTools(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  return (
    <main className={`${spaceGrotesk.className} relative min-h-screen w-full bg-black`}>
      {/* Background Effects */}
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] right-1/4 h-[28rem] w-[28rem] translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-6 py-12">
        
        {/* Header Section */}
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-white">Create New Test Suite</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Define the interface your agent will leverage. Provide a clear description, list the input parameters, and specify the output format so your harness knows how to invoke it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="rounded-lg px-4 py-2 text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition"
          >
            Back to Dashboard
          </button>
        </header>
        
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur-md">
            {error}
          </div>
        )}

        <section className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-xl shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Input: Suite Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/60">Task Name</label>
              <input 
                type="text" 
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/60 focus:ring-4 focus:ring-white/20 outline-none transition"
                placeholder="e.g. Book a Flight to Tokyo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Input: Core Prompt */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/60">Core Prompt</label>
              <textarea 
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/60 focus:ring-4 focus:ring-white/20 outline-none transition"
                placeholder="Describe the goal, constraints, and context for the agent..."
                value={corePrompt}
                onChange={(e) => setCorePrompt(e.target.value)}
              />
            </div>

            {/* Tool Picker */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-white/60">Allowed Tools</label>
              <div className="grid gap-3 md:grid-cols-2">
                {tools.map(tool => {
                  const isSelected = selectedTools.includes(tool.id);
                  return (
                    <div 
                      key={tool.id}
                      onClick={() => toggleTool(tool.id)}
                      className={`cursor-pointer p-4 rounded-xl border transition duration-200 ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-500/50 text-white ring-1 ring-purple-500/30' 
                          : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm">{tool.name}</div>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]"></div>}
                      </div>
                      <div className="text-xs mt-1 opacity-70 line-clamp-2">{tool.description}</div>
                    </div>
                  );
                })}
              </div>
              {selectedTools.length === 0 && (
                <p className="text-xs text-red-300 italic mt-2">* At least one tool is required.</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button 
                type="button" 
                onClick={() => router.push('/')}
                className="rounded-lg px-4 py-2 text-sm text-white bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={loading}
                className="rounded-lg px-6 py-2 text-sm text-white bg-white/10 ring-1 ring-white/20 hover:bg-white/15 transition disabled:opacity-50 font-medium"
              >
                {loading ? 'Creating...' : 'Create Suite'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}