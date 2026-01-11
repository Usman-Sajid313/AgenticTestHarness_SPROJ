import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  // Call Supabase Edge Function
  try {
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
      throw new Error(`Function returned ${response.status}: ${responseText}`);
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

    if (!isQuotaError) {
      await prisma.agentRun.update({
        where: { id },
        data: { status: "FAILED" },
      });
    }

    const statusCode = errorMessage.includes("429") ? 429 : 500;

    return NextResponse.json(
      {
        error: "Failed to trigger judging",
        details: errorMessage
      },
      { status: statusCode }
    );
  }
}

