import { prisma } from "@/lib/prisma";
import RunView from "@/app/components/runs/RunView";
import type { MetricBreakdown, Evaluation } from "@/types/evaluation";

export default async function RunPage(context: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await context.params;

  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: { evaluations: true, project: true },
  });

  if (!run) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Run not found.</p>
      </main>
    );
  }

  let evaluation: Evaluation | null = null;

  if (run.evaluations.length > 0) {
    const ev = run.evaluations[0];

    if (ev.status === "COMPLETED") {
      evaluation = {
        id: ev.id,
        status: ev.status,
        totalScore: ev.totalScore,
        summary: ev.summary,
        createdAt: ev.createdAt,
        updatedAt: ev.updatedAt,
        metricBreakdown: ev.metricBreakdown as MetricBreakdown,
      };
    }
  }

  return (
    <main className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />

      <div className="relative mx-auto max-w-5xl px-6 py-16">
        <RunView initialRun={run} initialEvaluation={evaluation} />
      </div>
    </main>
  );
}
