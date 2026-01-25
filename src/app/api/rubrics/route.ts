import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";

// Validation schema for rubric dimensions
const DimensionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  weight: z.number().min(0).max(1),
  scoringCriteria: z.array(
    z.object({
      scoreRange: z.tuple([z.number().min(0).max(10), z.number().min(0).max(10)]),
      label: z.string(),
      description: z.string(),
    })
  ),
});

const RubricSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  dimensions: z.array(DimensionSchema).min(1).max(10),
  isDefault: z.boolean().optional(),
});

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 }
    );
  }

  // Verify user has access to workspace
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      workspaceId,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rubrics = await prisma.evaluationRubric.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          testSuites: true,
          runs: true,
        },
      },
    },
  });

  return NextResponse.json({ rubrics });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { workspaceId, ...rubricData } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const membership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate rubric data
    const validated = RubricSchema.parse(rubricData);

    // Validate dimension weights sum to 1.0 (or close to it)
    const totalWeight = validated.dimensions.reduce(
      (sum, dim) => sum + dim.weight,
      0
    );
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      return NextResponse.json(
        { error: "Dimension weights must sum to 1.0" },
        { status: 400 }
      );
    }

    // If this is set as default, unset other defaults
    if (validated.isDefault) {
      await prisma.evaluationRubric.updateMany({
        where: { workspaceId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const rubric = await prisma.evaluationRubric.create({
      data: {
        workspaceId,
        name: validated.name,
        description: validated.description || null,
        dimensions: validated.dimensions as any,
        isDefault: validated.isDefault || false,
        createdById: user.id,
      },
    });

    return NextResponse.json({ rubric }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Error creating rubric:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
