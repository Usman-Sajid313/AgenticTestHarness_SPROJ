"use client";

import React, { useEffect } from "react";
import { Space_Grotesk } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
      className={`${spaceGrotesk.className} fixed inset-0 z-50 flex items-center justify-center`}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl shadow-2xl neon">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold text-white">Delete project</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-white/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            ✕
          </button>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-white/80">
          Are you sure you want to delete this project? It will delete all of its
          data.
          {projectName && (
            <span className="mt-2 block font-medium text-white">
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
              rounded-lg px-4 py-2 text-white
              bg-white/10 ring-1 ring-white/20 hover:bg-white/15
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
              rounded-lg px-4 py-2 text-white
              bg-red-500/20 ring-1 ring-red-400/40 hover:bg-red-500/25
              shadow-[0_8px_40px_rgba(244,63,94,0.20)]
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
