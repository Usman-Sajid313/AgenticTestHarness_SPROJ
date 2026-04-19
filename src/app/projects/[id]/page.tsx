import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ProjectRunsTable from "@/app/components/projects/ProjectRunsTable";
import StartRunButton from "@/app/components/projects/StartRunButton";
import CompareRunsButton from "@/app/components/projects/CompareRunsButton";
import ScoreTrendChart from "@/app/components/projects/ScoreTrendChart";
import ProjectRegressionPanel from "@/app/components/projects/ProjectRegressionPanel";
import { buildRunUsageSummary } from "@/lib/runUsage";
import { buildRegressionContext, resolveRegressionConfig } from "@/lib/regression";

const PAGE_SIZE = 10;

type ProjectRunRecord = {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
  status: string;
  evaluations: Array<{
    id: string;
    status: string;
    totalScore: number | null;
    geminiJudgement?: unknown;
  }>;
  metrics: {
    totalSteps: number;
    totalToolCalls: number;
    totalErrors: number;
    totalRetries: number;
    totalDurationMs: number | null;
  } | null;
  judgePacket: {
    packetSizeBytes: number;
  } | null;
};

export default async function ProjectPage(context: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id: projectId } = await context.params;
  const searchParams = await context.searchParams;
  const page = parseInt(searchParams.page || "1", 10);
  const skip = (page - 1) * PAGE_SIZE;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      baselineRunId: true,
      regressionConfig: true,
      workspace: {
        select: {
          modelConfig: {
            select: {
              judgePanelModels: true,
              judgeVerifierModel: true,
            },
          },
        },
      },
      baselineRun: {
        select: {
          id: true,
          createdAt: true,
          evaluations: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          metrics: true,
          judgePacket: {
            select: {
              packetSizeBytes: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return (
      <div className="px-6 py-12 text-center text-white">
        <Link href="/" className="mb-4 inline-flex text-sm text-zinc-400 transition hover:text-zinc-200">
          ← Back to Dashboard
        </Link>
        <h2 className="text-2xl font-semibold">Project not found</h2>
      </div>
    );
  }

  const totalCount = await prisma.agentRun.count({
    where: { projectId },
  });

  const runs = await prisma.agentRun.findMany({
    where: { projectId },
    include: {
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      metrics: true,
      judgePacket: {
        select: {
          packetSizeBytes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip,
    take: PAGE_SIZE,
  });

  const allRunsForChart = await prisma.agentRun.findMany({
    where: { projectId },
    include: {
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const projectRegressionConfig = resolveRegressionConfig(project.regressionConfig);
  const baselineRun = project.baselineRun;
  const baselineUsageSummary = baselineRun
    ? buildRunUsageSummary({
        judgePacket: baselineRun.judgePacket,
        evaluation: baselineRun.evaluations[0] ?? null,
        workspace: project.workspace,
      })
    : null;

  const runsWithRegression = (runs as ProjectRunRecord[]).map((run) => {
    const usageSummary = buildRunUsageSummary({
      judgePacket: run.judgePacket,
      evaluation: run.evaluations[0] ?? null,
      workspace: project.workspace,
    });

    return {
      ...run,
      projectRegression: buildRegressionContext({
        scope: "project",
        scopeId: project.id,
        scopeName: project.name,
        config: projectRegressionConfig,
        baselineRun: baselineRun
          ? {
              id: baselineRun.id,
              createdAt: baselineRun.createdAt,
              evaluation: baselineRun.evaluations[0] ?? null,
              metrics: baselineRun.metrics,
              usageSummary: baselineUsageSummary,
            }
          : null,
        candidateRun: {
          id: run.id,
          createdAt: run.createdAt,
          evaluation: run.evaluations[0] ?? null,
          metrics: run.metrics,
          usageSummary,
        },
      }),
    };
  });

  return (
    <main className="min-h-screen w-full bg-zinc-950">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Link href="/" className="mb-6 inline-flex text-sm text-zinc-400 transition hover:text-zinc-200">
          ← Back to Dashboard
        </Link>

        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-white">{project.name}</h1>
            <p className="mt-3 text-zinc-400 max-w-2xl">
              {project.description}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <CompareRunsButton
              projectId={projectId}
              projectName={project.name}
              runs={allRunsForChart}
              baselineRunId={project.baselineRunId}
            />
            <StartRunButton projectId={projectId} />
          </div>
        </div>

        <ProjectRegressionPanel
          projectId={projectId}
          baseline={
            baselineRun
              ? {
                  runId: baselineRun.id,
                  createdAt: baselineRun.createdAt.toISOString(),
                  totalScore: baselineRun.evaluations[0]?.totalScore ?? null,
                }
              : null
          }
          config={projectRegressionConfig}
        />

        <ScoreTrendChart
          runs={allRunsForChart}
          baselineRunId={project.baselineRunId}
          baselineScore={baselineRun?.evaluations[0]?.totalScore ?? null}
        />

        <ProjectRunsTable
          runs={runsWithRegression}
          totalCount={totalCount}
          currentPage={page}
          pageSize={PAGE_SIZE}
          projectId={projectId}
          baselineRunId={project.baselineRunId}
        />
      </div>
    </main>
  );
}
