"use client";

import { useState } from "react";
import CreateProjectModal from "./CreateProjectModal";

export default function CreateProjectButton() {
  const [open, setOpen] = useState(false);

  function refreshPage() {
    window.location.reload();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-100 text-zinc-900 px-5 py-2 font-medium hover:bg-zinc-200 transition"
      >
        Create New Project
      </button>

      <CreateProjectModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={refreshPage}
      />
    </>
  );
}
