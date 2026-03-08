"use client";

import { useState } from "react";
import CompareRunsModal from "./CompareRunsModal";

type RunForCompare = {
  id: string;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  evaluations?: Array<{
    status: string;
    totalScore: number | null;
  }>;
};

type CompareRunsButtonProps = {
  projectId: string;
  projectName?: string;
  runs: RunForCompare[];
};

export default function CompareRunsButton({
  projectId,
  projectName,
  runs,
}: CompareRunsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-800 text-zinc-300 px-6 py-3 font-medium hover:bg-zinc-700 transition"
      >
        Compare Runs
      </button>
      <CompareRunsModal
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        projectName={projectName}
        runs={runs}
      />
    </>
  );
}
