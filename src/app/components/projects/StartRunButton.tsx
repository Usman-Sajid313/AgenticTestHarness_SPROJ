"use client";

import { useState } from "react";
import StartRunModal from "./StartRunModal";

type StartRunButtonProps = {
  projectId: string;
};

export default function StartRunButton({ projectId }: StartRunButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-100 text-zinc-900 px-6 py-3 font-medium hover:bg-zinc-200 transition"
      >
        Start New Run
      </button>

      <StartRunModal
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
      />
    </>
  );
}
