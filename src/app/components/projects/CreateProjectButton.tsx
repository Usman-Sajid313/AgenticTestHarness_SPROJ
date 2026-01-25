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
        className="rounded-xl bg-purple-600 px-5 py-2 text-white hover:bg-purple-700 transition"
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
