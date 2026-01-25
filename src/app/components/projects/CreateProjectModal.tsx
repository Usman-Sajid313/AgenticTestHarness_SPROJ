"use client";

import { useState } from "react";

type CreateProjectModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateProjectModal({
  open,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!name.trim() || !description.trim()) return;

    setLoading(true);

    const res = await fetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });

    setLoading(false);

    if (res.ok) {
      onCreated();
      onClose();
      setName("");
      setDescription("");
    } else {
      alert("Failed to create project.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white/5 p-8 ring-1 ring-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">
          Create New Project
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-white/80 mb-2 text-sm">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              required
              className="w-full rounded-xl bg-black/30 px-4 py-2 text-white ring-1 ring-white/10 focus:ring-purple-500/50 outline-none"
              placeholder="My Agent"
            />
          </div>

          <div>
            <label className="block text-white/80 mb-2 text-sm">
              Agent Description
            </label>
            <textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              required
              rows={4}
              className="w-full rounded-xl bg-black/30 px-4 py-2 text-white ring-1 ring-white/10 focus:ring-purple-500/50 outline-none"
              placeholder="Describe what the agent does…"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:bg-purple-900/40"
            >
              {loading ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
