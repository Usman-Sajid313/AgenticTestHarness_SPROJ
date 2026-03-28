import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getScopedUser } from "@/lib/auth";
import { validateParseBudget } from "@/lib/runBudgetValidator";
import { parseRun } from "@/lib/parser";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  let body: {
    sourceType?: string;
    formatHint?: string;
    mappingConfig?: Record<string, unknown> | null;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // Keep defaults for empty body
  }

  const user = await getScopedUser("write");
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

  const logfile = run.logfiles[0];
  const logfileMeta = isObject(logfile.metadata) ? logfile.metadata : {};
  const bodySourceType =
    typeof body.sourceType === "string" && body.sourceType.trim()
      ? body.sourceType.trim()
      : undefined;
  const bodyFormatHint =
    typeof body.formatHint === "string" && body.formatHint.trim()
      ? body.formatHint.trim()
      : undefined;
  const bodyMappingConfig =
    body.mappingConfig && isObject(body.mappingConfig)
      ? body.mappingConfig
      : undefined;

  const effectiveSourceType =
    bodySourceType ||
    (typeof logfileMeta.sourceType === "string" ? logfileMeta.sourceType : undefined) ||
    "generic_jsonl";
  const effectiveFormatHint =
    bodyFormatHint ||
    (typeof logfileMeta.formatHint === "string" ? logfileMeta.formatHint : undefined) ||
    null;
  const effectiveMappingConfig =
    bodyMappingConfig ||
    (isObject(logfileMeta.mappingConfig) ? logfileMeta.mappingConfig : null);

  const ingestion = await prisma.runIngestion.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      sourceType: effectiveSourceType,
      formatHint: effectiveFormatHint,
      mappingConfig:
        (effectiveMappingConfig as Prisma.InputJsonValue | undefined) || undefined,
      fileRef: logfile.storageKey,
      status: "CREATED",
    },
  });

  // Validate budget before calling parser
  const budgetValidation = await validateParseBudget(id);
  if (!budgetValidation.allowed) {
    await prisma.runIngestion.update({
      where: { id: ingestion.id },
      data: {
        status: "FAILED",
        failureDetails: budgetValidation.reason,
      },
    });
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
      { status: 429 }
    );
  }

  console.log(`Parse budget validation passed for run ${id}:`, {
    estimatedCost: budgetValidation.estimatedCost,
    estimatedTokens: budgetValidation.estimatedTokens,
    budgetLimit: budgetValidation.budgetLimit,
  });

  try {
    const data = await parseRun({
      runId: id,
      ingestionId: ingestion.id,
      sourceType: effectiveSourceType,
      formatHint: effectiveFormatHint ?? undefined,
      mappingConfig: effectiveMappingConfig,
    });

    return NextResponse.json({
      success: true,
      runId: id,
      ingestionId: ingestion.id,
      status: "PARSING",
      data,
    });
  } catch (err) {
    console.error("Failed to run parser:", err);
    await prisma.agentRun.update({
      where: { id },
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
        error: "Failed to invoke parsing function",
        details: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}
