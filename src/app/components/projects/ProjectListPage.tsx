"use client";

import { useState } from "react";
import Link from "next/link";

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

export default function ProjectListPage({
  projects,
  totalCount,
  pageSize,
}: ProjectListPageProps) {
  const [page, setPage] = useState<number>(1);
  const totalPages = Math.ceil(totalCount / pageSize);

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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((proj: Project) => (
          <Link
            key={proj.id}
            href={`/projects/${proj.id}`}
            className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-xl hover:bg-white/10 transition cursor-pointer block"
          >
            <h3 className="text-lg font-semibold text-white">{proj.name}</h3>

            <p className="mt-2 text-sm text-white/60 line-clamp-2">
              {proj.description || "No description provided."}
            </p>

            <p className="mt-4 text-xs text-white/40">
              Created on {new Date(proj.createdAt).toLocaleDateString()}
            </p>
          </Link>
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
