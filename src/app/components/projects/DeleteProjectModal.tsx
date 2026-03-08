"use client";

import React, { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  projectName: string;
  onConfirm: () => Promise<void>;
};

export default function DeleteProjectModal({
  open,
  onClose,
  projectName,
  onConfirm,
}: Props) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-zinc-100">Delete project</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-zinc-500 hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-600"
          >
            ✕
          </button>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-zinc-400">
          Are you sure you want to delete this project? It will delete all of its
          data.
          {projectName && (
            <span className="mt-2 block font-medium text-zinc-100">
              &ldquo;{projectName}&rdquo;
            </span>
          )}
        </p>

        {error && (
          <p className="mb-4 text-xs text-red-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="
              rounded-lg px-4 py-2
              bg-zinc-800 text-zinc-300 hover:bg-zinc-700
              transition active:scale-[0.99] disabled:opacity-60
            "
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleDelete}
            className="
              rounded-lg px-4 py-2
              bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20
              transition active:scale-[0.99] disabled:opacity-60
            "
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
