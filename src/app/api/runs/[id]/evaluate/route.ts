import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateRunFromLogfile } from "@/lib/evaluator";
import { getSessionUser } from "@/lib/auth";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: { evaluations: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status === "PROCESSING" || run.evaluations.length > 0) {
    return NextResponse.json({ status: "already-processing" });
  }

  await prisma.agentRun.update({
    where: { id },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  try {
    const evaluation = await evaluateRunFromLogfile(id);

    return NextResponse.json({
      status: "completed",
      evaluation,
    });
  } catch (err) {
    console.error("Evaluation failed", err);

    await prisma.agentRun.update({
      where: { id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { status: "failed", error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
