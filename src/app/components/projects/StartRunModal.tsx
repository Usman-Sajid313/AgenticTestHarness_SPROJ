"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StartRunModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: () => void;
};

export default function StartRunModal({
  open,
  onClose,
  projectId,
  onSuccess,
}: StartRunModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);

    const res = await fetch("/api/runs/upload-logfile", {
      method: "POST",
      body: formData,
    });

    setLoading(false);

    if (res.ok) {
      const data: { runId: string } = await res.json();
      const runId = data.runId;

      onClose();
      onSuccess?.(); 
      router.push(`/runs/${runId}`);
    } else {
      alert("Failed to upload logfile.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white/5 p-8 ring-1 ring-white/10">
        <h2 className="text-xl font-semibold text-white mb-4">
          Upload Logfile
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="file"
            accept=".txt,.log,.json"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-xl bg-black/30 px-4 py-2 text-white ring-1 ring-white/10"
            required
          />

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
              {loading ? "Uploading…" : "Start Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
