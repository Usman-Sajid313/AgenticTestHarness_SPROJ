import { prisma } from "@/lib/prisma";
import ProjectRunsTable from "@/app/components/projects/ProjectRunsTable";
import StartRunButton from "@/app/components/projects/StartRunButton";

export default async function ProjectPage(context: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await context.params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-white">
        <h2 className="text-2xl font-semibold">Project not found</h2>
      </div>
    );
  }

  const runs = await prisma.agentRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-deep-space" />
      <div className="absolute inset-0 bg-deep-space-anim opacity-70" />

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-white">{project.name}</h1>
            <p className="mt-3 text-white/70 max-w-2xl">
              {project.description}
            </p>
          </div>

          <StartRunButton projectId={projectId} />
        </div>

        <ProjectRunsTable runs={runs} />
      </div>
    </main>
  );
}
