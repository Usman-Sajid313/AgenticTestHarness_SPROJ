import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { validateJudgeBudget } from "@/lib/runBudgetValidator";

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

  // Validate budget before calling edge function
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
      { status: 429 } // 429 Too Many Requests (budget exhausted)
    );
  }

  console.log(`Judge budget validation passed for run ${id}:`, {
    estimatedCost: budgetValidation.estimatedCost,
    estimatedTokens: budgetValidation.estimatedTokens,
    budgetLimit: budgetValidation.budgetLimit,
  });

  // Call Supabase Edge Function
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseUrl}/functions/v1/judge_run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: JSON.stringify({ runId: id }),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      const errorText = responseText || JSON.stringify(data);
      const isRetryable =
        response.status >= 500 ||
        response.status === 429 ||
        errorText.includes("WORKER_LIMIT") ||
        errorText.includes("timeout") ||
        errorText.includes("rate limit");

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

      return NextResponse.json(
        {
          error: "Judge function failed",
          details: `Function returned ${response.status}: ${errorText}`,
          retryable: isRetryable,
        },
        { status: isRetryable ? 503 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      runId: id,
      status: "JUDGING",
      data,
    });
  } catch (err) {
    console.error("Failed to invoke judge function:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);

    const isQuotaError = errorMessage.includes("429") ||
                         errorMessage.includes("quota") ||
                         errorMessage.includes("rate limit");
    const isWorkerLimit = errorMessage.includes("WORKER_LIMIT") ||
                          errorMessage.includes("546") ||
                          errorMessage.includes("timeout") ||
                          errorMessage.includes("504");

    if (isQuotaError || isWorkerLimit) {
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
        retryable: isQuotaError || isWorkerLimit,
      },
      { status: statusCode }
    );
  }
}

