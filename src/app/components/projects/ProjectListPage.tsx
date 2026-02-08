"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DeleteProjectModal from "./DeleteProjectModal";

type Project = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string | Date;
};

type ProjectListPageProps = {
  projects: Project[];
  totalCount: number;
  pageSize: number;
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

export default function ProjectListPage({
  projects,
  totalCount,
  pageSize,
}: ProjectListPageProps) {
  const [page, setPage] = useState<number>(1);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const router = useRouter();
  const totalPages = Math.ceil(totalCount / pageSize);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/projects/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "Failed to delete project.");
    }
    setDeleteTarget(null);
    router.refresh();
  }

  if (totalCount === 0) {
    return (
      <div className="mt-10 rounded-2xl bg-white/5 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-white/70">
          No projects found — create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DeleteProjectModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        projectName={deleteTarget?.name ?? ""}
        onConfirm={handleConfirmDelete}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((proj: Project) => (
          <div
            key={proj.id}
            className="relative rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur-xl hover:bg-white/10 transition"
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeleteTarget(proj);
              }}
              className="absolute top-3 right-3 z-10 rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              aria-label={`Delete project ${proj.name}`}
            >
              <TrashIcon className="h-5 w-5" />
            </button>

            <Link
              href={`/projects/${proj.id}`}
              className="block p-6 pr-12"
            >
              <h3 className="text-lg font-semibold text-white">{proj.name}</h3>

              <p className="mt-2 text-sm text-white/60 line-clamp-2">
                {proj.description || "No description provided."}
              </p>

              <p className="mt-4 text-xs text-white/40">
                Created on {new Date(proj.createdAt).toLocaleDateString()}
              </p>
            </Link>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-white/70 hover:text-white disabled:text-white/30 transition"
            disabled={page === 1}
          >
            Previous
          </button>

          <span className="text-white/60">
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="text-white/70 hover:text-white disabled:text-white/30 transition"
            disabled={page === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
