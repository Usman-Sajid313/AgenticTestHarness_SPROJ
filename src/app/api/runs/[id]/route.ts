import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedUser } from "@/lib/auth";
import { buildRunUsageSummary } from "@/lib/runUsage";
import { resolveMetricBreakdown } from "@/lib/evaluationSummary";
import { buildRegressionContext } from "@/lib/regression";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getScopedUser("read");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      logfiles: true,
      traceSummary: true,
      metrics: true,
      ruleFlags: true,
      judgePacket: true,
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      workspaceId: run.project.workspaceId,
    },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const evaluationRecord = run.evaluations[0] ?? null;
  const evaluation = evaluationRecord
    ? {
        ...evaluationRecord,
        metricBreakdown: resolveMetricBreakdown(evaluationRecord),
      }
    : null;

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

  return NextResponse.json({
    run: {
      ...run,
      usageSummary,
      projectRegression,
      suiteRegression,
    },
    evaluation,
    traceSummary: run.traceSummary,
    metrics: run.metrics,
    ruleFlags: run.ruleFlags,
    usageSummary,
    projectRegression,
    suiteRegression,
    judgePacket: run.judgePacket ? {
      ...run.judgePacket,
      packet: run.judgePacket.packet ? JSON.parse(run.judgePacket.packet) : null,
    } : null,
  });
}
