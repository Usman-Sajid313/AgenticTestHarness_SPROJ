import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RunView, { type Evaluation as RunViewEvaluation } from "@/app/components/runs/RunView";
import type { Evaluation } from "@/types/evaluation";
import { buildRunUsageSummary } from "@/lib/runUsage";
import { resolveMetricBreakdown } from "@/lib/evaluationSummary";
import { buildRegressionContext } from "@/lib/regression";

export default async function RunPage(context: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await context.params;

  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: {
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      project: {
        select: {
          id: true,
          name: true,
          workspaceId: true,
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
      },
      testSuite: {
        select: {
          id: true,
          name: true,
          baselineRunId: true,
          regressionConfig: true,
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
      },
      traceSummary: true,
      metrics: true,
      ruleFlags: true,
      judgePacket: true,
    },
  });

  if (!run) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Link href="/" className="mb-4 inline-flex text-sm text-zinc-400 transition hover:text-zinc-200">
            ← Back to Dashboard
          </Link>
          <p>Run not found.</p>
        </div>
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
        metricBreakdown: resolveMetricBreakdown(ev),
        geminiJudgement: ev.geminiJudgement,
        groqJudgement: ev.groqJudgement,
        finalScorecard: ev.finalScorecard,
        confidence: ev.confidence,
      };
    }
  }

  const evaluationRecord = run.evaluations[0] ?? null;
  const usageSummary = buildRunUsageSummary({
    judgePacket: run.judgePacket,
    evaluation: evaluationRecord,
    workspace: run.project.workspace,
  });
  const projectBaseline = run.project.baselineRun;
  const projectBaselineUsageSummary = projectBaseline
    ? buildRunUsageSummary({
        judgePacket: projectBaseline.judgePacket,
        evaluation: projectBaseline.evaluations[0] ?? null,
        workspace: run.project.workspace,
      })
    : null;
  const projectRegression = buildRegressionContext({
    scope: "project",
    scopeId: run.project.id,
    scopeName: run.project.name,
    config: run.project.regressionConfig,
    baselineRun: projectBaseline
      ? {
          id: projectBaseline.id,
          createdAt: projectBaseline.createdAt,
          evaluation: projectBaseline.evaluations[0] ?? null,
          metrics: projectBaseline.metrics,
          usageSummary: projectBaselineUsageSummary,
        }
      : null,
    candidateRun: {
      id: run.id,
      createdAt: run.createdAt,
      evaluation: evaluationRecord,
      metrics: run.metrics,
      usageSummary,
    },
  });
  const suiteBaseline = run.testSuite?.baselineRun ?? null;
  const suiteBaselineUsageSummary = suiteBaseline
    ? buildRunUsageSummary({
        judgePacket: suiteBaseline.judgePacket,
        evaluation: suiteBaseline.evaluations[0] ?? null,
        workspace: run.project.workspace,
      })
    : null;
  const suiteRegression = run.testSuite
    ? buildRegressionContext({
        scope: "suite",
        scopeId: run.testSuite.id,
        scopeName: run.testSuite.name,
        config: run.testSuite.regressionConfig,
        baselineRun: suiteBaseline
          ? {
              id: suiteBaseline.id,
              createdAt: suiteBaseline.createdAt,
              evaluation: suiteBaseline.evaluations[0] ?? null,
              metrics: suiteBaseline.metrics,
              usageSummary: suiteBaselineUsageSummary,
            }
          : null,
        candidateRun: {
          id: run.id,
          createdAt: run.createdAt,
          evaluation: evaluationRecord,
          metrics: run.metrics,
          usageSummary,
        },
      })
    : null;

  return (
    <main className="min-h-screen w-full bg-zinc-950">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href={run.project?.id ? `/projects/${run.project.id}` : "/"}
          className="mb-6 inline-flex text-sm text-zinc-400 transition hover:text-zinc-200"
        >
          {run.project?.id ? "← Back to Project" : "← Back to Dashboard"}
        </Link>

        <RunView
          initialRun={{
            ...run,
            usageSummary,
            projectRegression,
            suiteRegression,
          }}
          initialEvaluation={evaluation as RunViewEvaluation | null}
        />
      </div>
    </main>
  );
}
