import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { validateParseBudget } from "@/lib/runBudgetValidator";
import { parseRun } from "@/lib/parser";

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
  const formatHint =
    typeof body.formatHint === "string" && body.formatHint.trim()
      ? body.formatHint.trim()
      : undefined;
  const mappingConfig =
    body.mappingConfig && typeof body.mappingConfig === "object"
      ? body.mappingConfig
      : null;

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
      formatHint: formatHint ?? null,
      mappingConfig:
        (mappingConfig as Prisma.InputJsonValue | undefined) || undefined,
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
        formatHint: formatHint ?? null,
        mappingConfig:
          (mappingConfig as Prisma.InputJsonValue | null) || null,
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
    const data = await parseRun({
      runId: run.id,
      ingestionId: ingestion.id,
      sourceType,
      formatHint,
      mappingConfig,
    });

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
