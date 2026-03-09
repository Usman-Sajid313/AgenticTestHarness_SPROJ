import { NextResponse } from "next/server";
import { getScopedUser } from "@/lib/auth";
import { getWorkspaceIdForUser } from "@/lib/modelConfig";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
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

    // Parse and validate the "days" query parameter
    const { searchParams } = new URL(req.url);
    const rawDays = parseInt(searchParams.get("days") ?? "30", 10);
    const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 90);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    cutoff.setHours(0, 0, 0, 0);

    // Get all project IDs in workspace
    const projects = await prisma.project.findMany({
      where: { workspaceId, isArchived: false },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    // Fetch runs created after cutoff
    const runs = await prisma.agentRun.findMany({
      where: {
        projectId: { in: projectIds },
        createdAt: { gte: cutoff },
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Fetch completed evaluations after cutoff for workspace runs
    const runIds = runs.map((r) => r.id);
    const evaluations = await prisma.runEvaluation.findMany({
      where: {
        runId: { in: runIds },
        status: "COMPLETED",
        totalScore: { not: null },
        createdAt: { gte: cutoff },
      },
      select: { runId: true, totalScore: true, createdAt: true },
    });

    // Group runs by date
    const runsByDate: Record<
      string,
      { completed: number; failed: number; total: number }
    > = {};

    for (const run of runs) {
      const date = run.createdAt.toISOString().slice(0, 10);
      if (!runsByDate[date]) {
        runsByDate[date] = { completed: 0, failed: 0, total: 0 };
      }
      runsByDate[date].total++;
      if (run.status === "COMPLETED" || run.status === "COMPLETED_LOW_CONFIDENCE") {
        runsByDate[date].completed++;
      } else if (run.status === "FAILED") {
        runsByDate[date].failed++;
      }
    }

    // Group evaluation scores by date
    const scoresByDate: Record<string, number[]> = {};

    for (const evaluation of evaluations) {
      const date = evaluation.createdAt.toISOString().slice(0, 10);
      if (!scoresByDate[date]) {
        scoresByDate[date] = [];
      }
      scoresByDate[date].push(evaluation.totalScore!);
    }

    // Build the full date range, filling missing dates with zeros
    const trends: {
      date: string;
      completedRuns: number;
      failedRuns: number;
      totalRuns: number;
      avgScore: number | null;
    }[] = [];

    const current = new Date(cutoff);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    while (current <= today) {
      const dateStr = current.toISOString().slice(0, 10);
      const dayRuns = runsByDate[dateStr] ?? {
        completed: 0,
        failed: 0,
        total: 0,
      };
      const dayScores = scoresByDate[dateStr];

      let avgScore: number | null = null;
      if (dayScores && dayScores.length > 0) {
        avgScore =
          dayScores.reduce((sum, s) => sum + s, 0) / dayScores.length;
      }

      trends.push({
        date: dateStr,
        completedRuns: dayRuns.completed,
        failedRuns: dayRuns.failed,
        totalRuns: dayRuns.total,
        avgScore,
      });

      current.setDate(current.getDate() + 1);
    }

    return NextResponse.json({ days, trends });
  } catch (error) {
    console.error("[analytics/trends] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
