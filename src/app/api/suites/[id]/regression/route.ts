import { NextResponse } from "next/server";
import { z } from "zod";
import { getScopedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveRegressionConfig } from "@/lib/regression";

const RegressionPayloadSchema = z
  .object({
    baselineRunId: z.string().cuid().nullable().optional(),
    regressionConfig: z
      .object({
        maxDimensionDrop: z.number().min(0).max(100).optional(),
        maxCostIncreasePct: z.number().min(0).max(10_000).optional(),
        blockErrorIncrease: z.boolean().optional(),
        blockRetryIncrease: z.boolean().optional(),
        noiseThreshold: z.number().min(0).max(100).optional(),
      })
      .optional(),
  })
  .refine(
    (value) =>
      value.baselineRunId !== undefined || value.regressionConfig !== undefined,
    { message: "baselineRunId or regressionConfig is required" }
  );

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getScopedUser("write");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: suiteId } = await context.params;

  try {
    const payload = RegressionPayloadSchema.parse(await req.json());

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 403 });
    }

    const suite = await prisma.testSuite.findFirst({
      where: {
        id: suiteId,
        workspaceId: membership.workspaceId,
      },
      select: {
        id: true,
        regressionConfig: true,
      },
    });

    if (!suite) {
      return NextResponse.json({ error: "Test suite not found" }, { status: 404 });
    }

    if (payload.baselineRunId) {
      const baselineRun = await prisma.agentRun.findFirst({
        where: {
          id: payload.baselineRunId,
          testSuiteId: suiteId,
          evaluations: {
            some: {
              status: "COMPLETED",
            },
          },
        },
        select: { id: true },
      });

      if (!baselineRun) {
        return NextResponse.json(
          { error: "Baseline run must belong to the suite and have a completed evaluation" },
          { status: 400 }
        );
      }
    }

    const nextRegressionConfig =
      payload.regressionConfig !== undefined
        ? resolveRegressionConfig({
            ...resolveRegressionConfig(suite.regressionConfig),
            ...payload.regressionConfig,
          })
        : undefined;

    const updatedSuite = await prisma.testSuite.update({
      where: { id: suiteId },
      data: {
        baselineRunId: payload.baselineRunId,
        regressionConfig: nextRegressionConfig,
      },
      select: {
        id: true,
        baselineRunId: true,
        regressionConfig: true,
      },
    });

    return NextResponse.json({
      suite: {
        ...updatedSuite,
        regressionConfig: resolveRegressionConfig(updatedSuite.regressionConfig),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid regression payload", issues: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to update suite regression settings", error);
    return NextResponse.json(
      { error: "Failed to update suite regression settings" },
      { status: 500 }
    );
  }
}
