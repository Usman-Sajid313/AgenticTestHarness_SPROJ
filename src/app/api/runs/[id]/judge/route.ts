import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopedUser } from "@/lib/auth";
import { validateJudgeBudget } from "@/lib/runBudgetValidator";
import { judgeRun } from "@/lib/judger";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getScopedUser("write");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const run = await prisma.agentRun.findUnique({
    where: { id },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Allow READY_FOR_JUDGING or JUDGING (for retries)
  if (run.status !== "READY_FOR_JUDGING" && run.status !== "JUDGING") {
    return NextResponse.json(
      { error: `Run is not ready for judging (current: ${run.status})` },
      { status: 400 }
    );
  }

  // If already judging, avoid duplicate expensive invocations.
  if (run.status === "JUDGING") {
    return NextResponse.json(
      { success: true, runId: id, status: "JUDGING", message: "Judge already in progress" },
      { status: 202 }
    );
  }

  // Validate budget before calling judge
  const budgetValidation = await validateJudgeBudget(id);
  if (!budgetValidation.allowed) {
    console.warn(`Judge budget validation failed for run ${id}:`, budgetValidation.reason);
    return NextResponse.json(
      {
        error: "Budget limit exceeded",
        details: budgetValidation.reason,
        budgetInfo: {
          estimatedCost: budgetValidation.estimatedCost,
          budgetLimit: budgetValidation.budgetLimit,
        },
      },
      { status: 429 }
    );
  }

  console.log(`Judge budget validation passed for run ${id}:`, {
    estimatedCost: budgetValidation.estimatedCost,
    estimatedTokens: budgetValidation.estimatedTokens,
    budgetLimit: budgetValidation.budgetLimit,
  });

  try {
    // Acquire judge lock: only one caller should transition READY_FOR_JUDGING -> JUDGING.
    const locked = await prisma.agentRun.updateMany({
      where: { id, status: "READY_FOR_JUDGING" },
      data: { status: "JUDGING" },
    });

    if (locked.count === 0) {
      return NextResponse.json(
        { success: true, runId: id, status: "JUDGING", message: "Judge already started elsewhere" },
        { status: 202 }
      );
    }

    console.log("[judge API] Invoking judger for runId=", id);

    const data = await judgeRun(id);

    return NextResponse.json({
      success: true,
      runId: id,
      status: "JUDGING",
      data,
    });
  } catch (err) {
    console.error("[judge API] Failed to invoke judge function:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);

    const isTerminalPanelFailure =
      errorMessage.includes("All panel evaluators failed") ||
      errorMessage.includes("No GROQ model returned a valid scorecard");
    const isQuotaError = errorMessage.includes("429") ||
                         errorMessage.includes("quota") ||
                         errorMessage.includes("rate limit");
    const isWorkerLimit = errorMessage.includes("WORKER_LIMIT") ||
                          errorMessage.includes("546") ||
                          errorMessage.includes("timeout") ||
                          errorMessage.includes("504");
    const isRetryable = !isTerminalPanelFailure && (isQuotaError || isWorkerLimit);

    if (isRetryable) {
      await prisma.agentRun.updateMany({
        where: { id, status: "JUDGING" },
        data: { status: "READY_FOR_JUDGING" },
      });
    } else {
      await prisma.agentRun.updateMany({
        where: { id, status: "JUDGING" },
        data: { status: "FAILED" },
      });
    }

    const statusCode = isQuotaError ? 429 : isWorkerLimit ? 503 : 500;

    return NextResponse.json(
      {
        error: "Failed to trigger judging",
        details: errorMessage,
        retryable: isRetryable,
      },
      { status: statusCode }
    );
  }
}
