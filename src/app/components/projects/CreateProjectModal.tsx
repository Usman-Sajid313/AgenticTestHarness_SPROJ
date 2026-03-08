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
      <div className="w-full max-w-lg rounded-xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl">
        <h2 className="text-xl font-semibold text-zinc-100 mb-4">
          Create New Project
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-zinc-400 mb-2 text-sm">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              required
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none"
              placeholder="My Agent"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-2 text-sm">
              Agent Description
            </label>
            <textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              required
              rows={4}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none"
              placeholder="Describe what the agent does…"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium hover:bg-zinc-200 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
