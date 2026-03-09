import { NextResponse } from "next/server";
import { getScopedUser } from "@/lib/auth";
import { getWorkspaceIdForUser } from "@/lib/modelConfig";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getScopedUser("read");
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId)
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );

    // Get all non-archived project IDs in this workspace
    const projects = await prisma.project.findMany({
      where: { workspaceId, isArchived: false },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    const totalProjects = projectIds.length;

    // Total runs across workspace projects
    const totalRuns = await prisma.agentRun.count({
      where: { projectId: { in: projectIds } },
    });

    // Runs grouped by status
    const statusGroups = await prisma.agentRun.groupBy({
      by: ["status"],
      where: { projectId: { in: projectIds } },
      _count: { status: true },
    });

    const runsByStatus: Record<string, number> = {};
    for (const group of statusGroups) {
      runsByStatus[group.status] = group._count.status;
    }

    const completedRuns = runsByStatus["COMPLETED"] ?? 0;
    const failedRuns = runsByStatus["FAILED"] ?? 0;
    const lowConfidenceRuns = runsByStatus["COMPLETED_LOW_CONFIDENCE"] ?? 0;

    const inProgressStatuses = [
      "CREATED",
      "UPLOADING",
      "UPLOADED",
      "PARSING",
      "READY_FOR_JUDGING",
      "JUDGING",
      "PENDING",
      "PROCESSING",
    ];
    const inProgressRuns = inProgressStatuses.reduce(
      (sum, s) => sum + (runsByStatus[s] ?? 0),
      0
    );

    // Average score across all completed evaluations
    const scoreAggregate = await prisma.runEvaluation.aggregate({
      where: {
        projectId: { in: projectIds },
        status: "COMPLETED",
        totalScore: { not: null },
      },
      _avg: { totalScore: true },
    });
    const avgScore = scoreAggregate._avg.totalScore ?? null;

    // Score distribution — fetch all completed evaluation scores and bucket in JS
    const completedEvaluations = await prisma.runEvaluation.findMany({
      where: {
        projectId: { in: projectIds },
        status: "COMPLETED",
        totalScore: { not: null },
      },
      select: { totalScore: true },
    });

    const buckets = [
      { bucket: "0-20", upperBound: 20, count: 0 },
      { bucket: "21-40", upperBound: 40, count: 0 },
      { bucket: "41-60", upperBound: 60, count: 0 },
      { bucket: "61-80", upperBound: 80, count: 0 },
      { bucket: "81-100", upperBound: 100, count: 0 },
    ];

    for (const evaluation of completedEvaluations) {
      const score = evaluation.totalScore!;
      for (const b of buckets) {
        if (score <= b.upperBound) {
          b.count++;
          break;
        }
      }
    }

    const scoreDistribution = buckets.map(({ bucket, count }) => ({
      bucket,
      count,
    }));

    return NextResponse.json({
      totalProjects,
      totalRuns,
      runsByStatus,
      completedRuns,
      failedRuns,
      inProgressRuns,
      avgScore,
      scoreDistribution,
      lowConfidenceRuns,
    });
  } catch (error) {
    console.error("[analytics/summary] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
