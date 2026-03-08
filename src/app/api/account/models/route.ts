import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import type { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDefaultWorkspaceModelConfig,
  getWorkspaceIdForUser,
  resolveWorkspaceModelConfig,
} from "@/lib/modelConfig";

const BodySchema = z.object({
  evaluatorModel: z.string().trim().min(1, "Evaluator model is required.").max(200),
  judgePrimaryModel: z.string().trim().min(1, "Judge primary model is required.").max(200),
  judgeVerifierModel: z.string().trim().min(1, "Judge verifier model is required.").max(200),
  judgePanelModels: z
    .array(z.string().trim().min(1, "Judge panel models cannot be empty.").max(200))
    .min(1, "Add at least one judge panel model.")
    .max(12, "Judge panel cannot exceed 12 models."),
});

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function buildResponse(config: Awaited<ReturnType<typeof resolveWorkspaceModelConfig>>, workspaceId: string) {
  return {
    workspaceId,
    source: config.source,
    isCustomized: config.isCustomized,
    evaluator: {
      provider: config.evaluatorProvider,
      model: config.evaluatorModel,
    },
    judge: {
      provider: config.judgeProvider,
      primaryModel: config.judgePrimaryModel,
      verifierModel: config.judgeVerifierModel,
      panelModels: config.judgePanelModels,
    },
    defaults: getDefaultWorkspaceModelConfig(),
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getWorkspaceIdForUser(user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const config = await resolveWorkspaceModelConfig(workspaceId);
  return NextResponse.json(buildResponse(config, workspaceId));
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getWorkspaceIdForUser(user.id);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const raw = (await req.json()) as unknown;
    const parsed = BodySchema.parse(raw);
    const judgePanelModels = uniqueStrings(parsed.judgePanelModels);

    if (judgePanelModels.length === 0) {
      return NextResponse.json(
        { field: "judgePanelModels", error: "Add at least one judge panel model." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceModelConfig.upsert({
        where: { workspaceId },
        update: {
          evaluatorModel: parsed.evaluatorModel,
          judgePrimaryModel: parsed.judgePrimaryModel,
          judgeVerifierModel: parsed.judgeVerifierModel,
          judgePanelModels,
        },
        create: {
          workspaceId,
          evaluatorModel: parsed.evaluatorModel,
          judgePrimaryModel: parsed.judgePrimaryModel,
          judgeVerifierModel: parsed.judgeVerifierModel,
          judgePanelModels,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "WORKSPACE_UPDATE_MODEL_CONFIG",
          targetType: "Workspace",
          targetId: workspaceId,
          metadata: {
            evaluatorModel: parsed.evaluatorModel,
            judgePrimaryModel: parsed.judgePrimaryModel,
            judgeVerifierModel: parsed.judgeVerifierModel,
            judgePanelModels,
          } as Prisma.InputJsonValue,
        },
      });
    });

    const savedConfig = await resolveWorkspaceModelConfig(workspaceId);
    return NextResponse.json({
      ok: true,
      message: "Model settings saved.",
      ...buildResponse(savedConfig, workspaceId),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      const field = typeof first?.path?.[0] === "string" ? first.path[0] : undefined;
      return NextResponse.json(
        {
          field,
          error: first?.message ?? "Invalid input",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
