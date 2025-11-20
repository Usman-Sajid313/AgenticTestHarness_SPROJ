import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { testSuiteSchema } from '@/lib/suiteSchemas';
import { ZodError } from 'zod';

// UC-007: Create Test Suite
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // 1. Parse Body
    const body = await req.json();
    const payload = testSuiteSchema.parse(body);

    // 2. Get User's Workspace
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    });

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    // 3. Persist to DB
    const suite = await prisma.$transaction(async (tx) => {
      const newSuite = await tx.testSuite.create({
        data: {
          workspaceId: membership.workspaceId,
          name: payload.name,
          corePrompt: payload.corePrompt,
          toolIds: payload.toolIds,
          config: payload.config ?? {},
          variables: payload.variables ?? {},
        },
      });

      // 4. Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'SUITE_CREATE',
          targetType: 'TestSuite',
          targetId: newSuite.id,
          metadata: { name: newSuite.name },
        },
      });

      return newSuite;
    });

    return NextResponse.json({ suite }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Helper to Fetch Suites (for the Dashboard list)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  if (!membership) return NextResponse.json({ suites: [] });

  const suites = await prisma.testSuite.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ suites });
}