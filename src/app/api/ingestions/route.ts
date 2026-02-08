import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { validateParseBudget } from "@/lib/runBudgetValidator";

type IngestionRequest = {
  runId?: string;
  sourceType?: string;
  formatHint?: string;
  mappingConfig?: Record<string, unknown> | null;
  fileRef?: string;
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: IngestionRequest;
  try {
    body = (await req.json()) as IngestionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const runId = body.runId?.trim();
  const sourceType = body.sourceType?.trim() || "generic_jsonl";

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
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

  const logfile = run.logfiles[0];
  if (!logfile) {
    return NextResponse.json(
      { error: "No logfile found for this run" },
      { status: 400 }
    );
  }

  const ingestion = await prisma.runIngestion.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      sourceType,
      formatHint: body.formatHint || null,
      mappingConfig:
        (body.mappingConfig as Prisma.InputJsonValue | undefined) || undefined,
      fileRef: body.fileRef || logfile.storageKey,
      status: "CREATED",
    },
  });

  await prisma.runLogfile.update({
    where: { id: logfile.id },
    data: {
      metadata: {
        ...(logfile.metadata as Record<string, unknown> | null),
        sourceType,
        formatHint: body.formatHint || null,
        mappingConfig:
          (body.mappingConfig as Prisma.InputJsonValue | null) || null,
        ingestionId: ingestion.id,
      } as Prisma.InputJsonValue,
    },
  });

  const budgetValidation = await validateParseBudget(run.id);
  if (!budgetValidation.allowed) {
    await prisma.runIngestion.update({
      where: { id: ingestion.id },
      data: {
        status: "FAILED",
        failureDetails: budgetValidation.reason,
      },
    });

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

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseUrl}/functions/v1/parse_run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        runId: run.id,
        ingestionId: ingestion.id,
        sourceType,
        formatHint: body.formatHint || null,
        mappingConfig: body.mappingConfig || null,
      }),
    });

    const responseText = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      throw new Error(`Function returned ${response.status}: ${responseText}`);
    }

    return NextResponse.json({
      ingestionId: ingestion.id,
      jobId: ingestion.id,
      status: "PARSING",
      data,
    });
  } catch (err) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED" },
    });

    await prisma.runIngestion.update({
      where: { id: ingestion.id },
      data: {
        status: "FAILED",
        failureDetails: err instanceof Error ? err.message : String(err),
      },
    });

    return NextResponse.json(
      {
        error: "Failed to invoke ingestion parser",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
