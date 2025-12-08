type Run = {
  id: string;
  status: string;
  taskName?: string | null;
  createdAt: string | Date;
  completedAt?: string | Date | null;
};

type ProjectRunsTableProps = {
  runs: Run[];
};

export default function ProjectRunsTable({ runs }: ProjectRunsTableProps) {
  if (!runs || runs.length === 0) {
    return (
      <div className="rounded-2xl bg-white/5 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl mt-10">
        <p className="text-white/70">There are no runs for this project yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-10 overflow-hidden rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-xl">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 text-white/70">
            <th className="px-6 py-3">Run ID</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Task Name</th>
            <th className="px-6 py-3">Created</th>
            <th className="px-6 py-3">Completed</th>
          </tr>
        </thead>

        <tbody>
          {runs.map((run: Run) => (
            <tr key={run.id} className="border-b border-white/5 text-white/90">
              <td className="px-6 py-4 font-mono text-sm">{run.id}</td>
              <td className="px-6 py-4">{run.status}</td>
              <td className="px-6 py-4">
                {run.taskName || <span className="text-white/40">—</span>}
              </td>
              <td className="px-6 py-4">
                {new Date(run.createdAt).toLocaleString()}
              </td>
              <td className="px-6 py-4">
                {run.completedAt
                  ? new Date(run.completedAt).toLocaleString()
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
