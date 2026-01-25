import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { validateParseBudget } from "@/lib/runBudgetValidator";

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
    include: { logfiles: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "UPLOADED") {
    return NextResponse.json(
      { error: `Run is not UPLOADED (current: ${run.status})` },
      { status: 400 }
    );
  }

  if (!run.logfiles || run.logfiles.length === 0) {
    return NextResponse.json(
      { error: "No logfile found for this run" },
      { status: 400 }
    );
  }

  // Validate budget before calling edge function
  const budgetValidation = await validateParseBudget(id);
  if (!budgetValidation.allowed) {
    console.warn(`Parse budget validation failed for run ${id}:`, budgetValidation.reason);
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

  console.log(`Parse budget validation passed for run ${id}:`, {
    estimatedCost: budgetValidation.estimatedCost,
    estimatedTokens: budgetValidation.estimatedTokens,
    budgetLimit: budgetValidation.budgetLimit,
  });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseUrl}/functions/v1/parse_run`, {
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
      throw new Error(`Function returned ${response.status}: ${responseText}`);
    }

    return NextResponse.json({
      success: true,
      runId: id,
      status: "PARSING",
      data,
    });
  } catch (err) {
    console.error("Failed to invoke edge function:", err);
    await prisma.agentRun.update({
      where: { id },
      data: { status: "FAILED" },
    });
    return NextResponse.json(
      {
        error: "Failed to invoke parsing function",
        details: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

