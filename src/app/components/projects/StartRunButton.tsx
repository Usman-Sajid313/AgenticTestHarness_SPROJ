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
        className="rounded-xl bg-purple-600 px-6 py-3 text-white font-medium hover:bg-purple-700 transition"
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
