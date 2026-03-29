import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  apiGet,
  apiPatch,
  createProject,
  signupAndGetCookie,
  uniqueName,
} from "../helpers/api";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

async function createCompletedRun(args: {
  projectId: string;
  triggeredById: string;
  testSuiteId?: string;
  totalScore: number;
  dimensions: Record<string, number>;
  totalErrors: number;
  totalRetries: number;
  totalDurationMs: number;
  packetSizeBytes: number;
}) {
  return prisma.agentRun.create({
    data: {
      projectId: args.projectId,
      testSuiteId: args.testSuiteId,
      triggeredById: args.triggeredById,
      status: "COMPLETED",
      taskName: "Regression candidate",
      taskDefinition: {},
      startedAt: new Date(),
      completedAt: new Date(),
      evaluations: {
        create: {
          projectId: args.projectId,
          testSuiteId: args.testSuiteId,
          status: "COMPLETED",
          totalScore: args.totalScore,
          summary: "Completed evaluation",
          metricBreakdown: {
            overallComment: "Completed evaluation",
            dimensions: Object.fromEntries(
              Object.entries(args.dimensions).map(([key, value]) => [
                key,
                {
                  score: value,
                  summary: `${key} summary`,
                },
              ])
            ),
          },
        },
      },
      metrics: {
        create: {
          totalSteps: 5,
          totalToolCalls: 4,
          totalErrors: args.totalErrors,
          totalRetries: args.totalRetries,
          totalDurationMs: args.totalDurationMs,
          parserVersion: "1.2.1",
        },
      },
      judgePacket: {
        create: {
          packet: JSON.stringify({ ok: true }),
          packetSizeBytes: args.packetSizeBytes,
          parserVersion: "1.2.1",
        },
      },
    },
    include: {
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      metrics: true,
      judgePacket: true,
    },
  });
}

describe("Use case: Baselines and regression gates", () => {
  it("persists a project baseline and returns a regression verdict on run detail", async () => {
    const name = uniqueName("RegressionUser");
    const email = uniqueEmail("regression-project");
    const { cookie } = await signupAndGetCookie(name, email, "Test123!@#");
    if (!cookie) throw new Error("No auth cookie");

    const projectRes = await createProject(cookie, `Project-${name}`, "Regression coverage");
    expect(projectRes.status).toBe(200);
    const project = await projectRes.json();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });

    const baselineRun = await createCompletedRun({
      projectId: project.id,
      triggeredById: user.id,
      totalScore: 90,
      dimensions: {
        accuracy: 92,
        reliability: 88,
      },
      totalErrors: 0,
      totalRetries: 0,
      totalDurationMs: 4_000,
      packetSizeBytes: 4_000,
    });

    const candidateRun = await createCompletedRun({
      projectId: project.id,
      triggeredById: user.id,
      totalScore: 84,
      dimensions: {
        accuracy: 84,
        reliability: 87,
      },
      totalErrors: 1,
      totalRetries: 0,
      totalDurationMs: 4_500,
      packetSizeBytes: 6_000,
    });

    const saveRes = await apiPatch(
      `/api/projects/${project.id}/regression`,
      {
        baselineRunId: baselineRun.id,
        regressionConfig: {
          maxDimensionDrop: 5,
          maxCostIncreasePct: 20,
          blockErrorIncrease: true,
          blockRetryIncrease: true,
          noiseThreshold: 2,
        },
      },
      { cookie }
    );
    expect(saveRes.status).toBe(200);

    const detailRes = await apiGet(`/api/runs/${candidateRun.id}`, { cookie });
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();

    expect(detail.projectRegression.baseline.runId).toBe(baselineRun.id);
    expect(detail.projectRegression.assessment.verdict).toBe("REGRESSED");
    expect(detail.projectRegression.assessment.gatePassed).toBe(false);
  });

  it("persists a suite baseline and returns a suite regression verdict on run detail", async () => {
    const name = uniqueName("RegressionSuiteUser");
    const email = uniqueEmail("regression-suite");
    const { cookie } = await signupAndGetCookie(name, email, "Test123!@#");
    if (!cookie) throw new Error("No auth cookie");

    const projectRes = await createProject(cookie, `SuiteProject-${name}`, "Regression coverage");
    const project = await projectRes.json();

    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        user: {
          email,
        },
      },
      select: {
        userId: true,
        workspaceId: true,
      },
    });

    const suite = await prisma.testSuite.create({
      data: {
        workspaceId: membership.workspaceId,
        name: `Suite-${name}`,
        corePrompt: "Evaluate the suite run",
      },
    });

    const baselineRun = await createCompletedRun({
      projectId: project.id,
      triggeredById: membership.userId,
      testSuiteId: suite.id,
      totalScore: 82,
      dimensions: {
        planning: 82,
      },
      totalErrors: 0,
      totalRetries: 1,
      totalDurationMs: 4_800,
      packetSizeBytes: 5_000,
    });

    const candidateRun = await createCompletedRun({
      projectId: project.id,
      triggeredById: membership.userId,
      testSuiteId: suite.id,
      totalScore: 87,
      dimensions: {
        planning: 87,
      },
      totalErrors: 0,
      totalRetries: 1,
      totalDurationMs: 4_300,
      packetSizeBytes: 5_200,
    });

    const saveRes = await apiPatch(
      `/api/suites/${suite.id}/regression`,
      {
        baselineRunId: baselineRun.id,
      },
      { cookie }
    );
    expect(saveRes.status).toBe(200);

    const detailRes = await apiGet(`/api/runs/${candidateRun.id}`, { cookie });
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();

    expect(detail.suiteRegression.baseline.runId).toBe(baselineRun.id);
    expect(detail.suiteRegression.assessment.verdict).toBe("IMPROVED");
    expect(detail.suiteRegression.assessment.gatePassed).toBe(true);
  });

  it("returns 401 when updating regression settings without auth", async () => {
    const res = await apiPatch("/api/projects/project_123/regression", {
      baselineRunId: null,
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
