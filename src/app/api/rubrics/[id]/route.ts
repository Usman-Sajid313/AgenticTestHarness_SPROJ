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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const rubric = await prisma.evaluationRubric.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          testSuites: true,
          runs: true,
        },
      },
    },
  });

  if (!rubric) {
    return NextResponse.json({ error: "Rubric not found" }, { status: 404 });
  }

  // Verify user has access to workspace
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      workspaceId: rubric.workspaceId,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ rubric });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();

    const rubric = await prisma.evaluationRubric.findUnique({
      where: { id },
    });

    if (!rubric) {
      return NextResponse.json({ error: "Rubric not found" }, { status: 404 });
    }

    // Verify user has access to workspace
    const membership = await prisma.membership.findFirst({
      where: {
        userId: user.id,
        workspaceId: rubric.workspaceId,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate rubric data
    const validated = RubricSchema.parse(body);

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
    if (validated.isDefault && !rubric.isDefault) {
      await prisma.evaluationRubric.updateMany({
        where: { 
          workspaceId: rubric.workspaceId, 
          isDefault: true,
          id: { not: id }
        },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.evaluationRubric.update({
      where: { id },
      data: {
        name: validated.name,
        description: validated.description || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dimensions: validated.dimensions as any,
        isDefault: validated.isDefault !== undefined ? validated.isDefault : rubric.isDefault,
      },
    });

    return NextResponse.json({ rubric: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating rubric:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const rubric = await prisma.evaluationRubric.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          testSuites: true,
          runs: true,
        },
      },
    },
  });

  if (!rubric) {
    return NextResponse.json({ error: "Rubric not found" }, { status: 404 });
  }

  // Verify user has access to workspace
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      workspaceId: rubric.workspaceId,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if rubric is in use
  if (rubric._count.testSuites > 0 || rubric._count.runs > 0) {
    return NextResponse.json(
      {
        error: "Cannot delete rubric that is in use by test suites or runs",
        testSuitesCount: rubric._count.testSuites,
        runsCount: rubric._count.runs,
      },
      { status: 400 }
    );
  }

  await prisma.evaluationRubric.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
