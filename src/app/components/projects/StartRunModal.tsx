"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Rubric = {
  id: string;
  name: string;
  description: string | null;
  isDefault?: boolean;
};

type StartRunModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: () => void;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPublicDataTrajectoryCountFromText(text: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null;
  }

  const isTrajectory = (item: unknown) => {
    if (!isObject(item)) return false;
    const record = item as Record<string, unknown>;
    const toolList = record["tool list"] ?? record.tool_list ?? record.toolList;
    return (
      typeof record.query === "string" &&
      ("final_answer" in record || "final answer" in record) &&
      Array.isArray(toolList)
    );
  };

  if (!isTrajectory(parsed[0])) {
    return null;
  }

  return parsed.filter(isTrajectory).length;
}

export default function StartRunModal({
  open,
  onClose,
  projectId,
  onSuccess,
}: StartRunModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState<string>("");
  const [publicDataTrajectoryCount, setPublicDataTrajectoryCount] = useState<number | null>(null);
  const [selectedTrajectoryNumber, setSelectedTrajectoryNumber] = useState<number>(1);
  const [detectingFileFormat, setDetectingFileFormat] = useState(false);
  const [, setWorkspaceId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      try {
        const meRes = await fetch("/api/me");
        if (meRes.ok) {
          const data = await meRes.json();
          const wsId = data.user?.memberships?.[0]?.workspaceId;
          if (wsId) {
            setWorkspaceId(wsId);

            const rubricsRes = await fetch(`/api/rubrics?workspaceId=${wsId}`);
            if (rubricsRes.ok) {
              const rubricsData = await rubricsRes.json();
              setRubrics(rubricsData.rubrics || []);

              // Auto-select default rubric if available
              const defaultRubric = rubricsData.rubrics?.find((r: Rubric) => r.isDefault);
              if (defaultRubric) {
                setSelectedRubricId(defaultRubric.id);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching rubrics:", error);
      }
    };

    fetchData();
  }, [open]);

  async function handleFileSelect(nextFile: File | null) {
    setFile(nextFile);
    setPublicDataTrajectoryCount(null);
    setSelectedTrajectoryNumber(1);

    if (!nextFile) return;

    const lowerName = nextFile.name.toLowerCase();
    if (!lowerName.endsWith(".json")) return;

    setDetectingFileFormat(true);
    try {
      const text = await nextFile.text();
      const count = getPublicDataTrajectoryCountFromText(text);
      if (typeof count === "number" && count > 0) {
        setPublicDataTrajectoryCount(count);
        setSelectedTrajectoryNumber(1);
      }
    } catch (error) {
      console.error("Failed to inspect selected file:", error);
    } finally {
      setDetectingFileFormat(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setUploadProgress("Uploading file...");

    try {
      // Upload file via server-side API (uses service role, bypasses RLS)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      if (selectedRubricId) {
        formData.append("rubricId", selectedRubricId);
      }
      if (publicDataTrajectoryCount && publicDataTrajectoryCount > 0) {
        const clampedNumber = Math.min(
          publicDataTrajectoryCount,
          Math.max(1, Math.floor(selectedTrajectoryNumber || 1))
        );
        const trajectoryIndex = clampedNumber - 1; // UI is 1-based; parser uses 0-based
        formData.append("sourceType", "public_data");
        formData.append("formatHint", "json");
        formData.append(
          "mappingConfig",
          JSON.stringify({ publicDataTrajectoryIndex: trajectoryIndex })
        );
      }

      const uploadRes = await fetch("/api/runs/upload-logfile", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const error = await uploadRes.json();
        throw new Error(error.error || "Failed to upload");
      }

      const { runId } = await uploadRes.json();

      onClose();
      onSuccess?.();
      router.push(`/runs/${runId}`);
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Failed to upload: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
      setUploadProgress("");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl bg-zinc-900 border border-zinc-800 p-8 shadow-2xl">
        <h2 className="text-xl font-semibold text-zinc-100 mb-4">
          Upload Logfile
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Logfile
            </label>
            <input
              type="file"
              accept=".txt,.log,.json,.jsonl,.ndjson"
              onChange={(e) => {
                void handleFileSelect(e.target.files?.[0] || null);
              }}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700"
              required
            />
            {detectingFileFormat && (
              <p className="text-xs text-zinc-500 mt-2">
                Inspecting file format...
              </p>
            )}
          </div>

          {publicDataTrajectoryCount && publicDataTrajectoryCount > 1 && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Trajectory #
              </label>
              <input
                type="number"
                min={1}
                max={publicDataTrajectoryCount}
                value={selectedTrajectoryNumber}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) {
                    setSelectedTrajectoryNumber(1);
                    return;
                  }
                  setSelectedTrajectoryNumber(next);
                }}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Detected a multi-trajectory `public_data` file with {publicDataTrajectoryCount} trajectories.
                The run will parse and evaluate only the selected trajectory (1-based index).
              </p>
            </div>
          )}

          {publicDataTrajectoryCount === 1 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
              <p className="text-xs text-zinc-400">
                Detected a `public_data` trajectory file. This run will evaluate trajectory #1.
              </p>
            </div>
          )}

          {rubrics.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Evaluation Rubric (Optional)
              </label>
              <select
                value={selectedRubricId}
                onChange={(e) => setSelectedRubricId(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-100 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 outline-none"
              >
                <option value="">Use Default Rubric</option>
                {rubrics.map((rubric) => (
                  <option key={rubric.id} value={rubric.id}>
                    {rubric.name}
                    {rubric.description ? ` - ${rubric.description}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">
                Select a custom rubric or use the default evaluation criteria
              </p>
            </div>
          )}

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
              {loading ? (uploadProgress || "Uploading…") : "Start Run"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
