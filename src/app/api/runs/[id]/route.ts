import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const run = await prisma.agentRun.findUnique({
    where: { id },
    include: { evaluations: true, project: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({
    run,
    evaluation: run.evaluations[0] ?? null,
  });
}
