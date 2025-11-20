import { NextResponse, NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { testSuiteSchema } from '@/lib/suiteSchemas';
import { ZodError } from 'zod';

// Helper to verify ownership
async function getSuiteIfAuthorized(id: string, userId: string) {
  const suite = await prisma.testSuite.findUnique({
    where: { id },
    include: { workspace: { include: { memberships: true } } },
  });

  if (!suite) return null;

  const hasAccess = suite.workspace.memberships.some((m) => m.userId === userId);
  if (!hasAccess) return null;

  return suite;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const suite = await getSuiteIfAuthorized(id, user.id);
  if (!suite) {
    return NextResponse.json({ error: 'Test suite not found or permission denied' }, { status: 404 });
  }

  return NextResponse.json({
    id: suite.id,
    name: suite.name,
    corePrompt: suite.corePrompt,
    toolIds: suite.toolIds,
    config: suite.config,
    variables: suite.variables,
  });
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await getSuiteIfAuthorized(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: 'Test suite not found or permission denied' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const payload = testSuiteSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const suite = await tx.testSuite.update({
        where: { id },
        data: {
          name: payload.name,
          corePrompt: payload.corePrompt,
          toolIds: payload.toolIds,
          config: payload.config ?? {},
          variables: payload.variables ?? {},
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'SUITE_UPDATE',
          targetType: 'TestSuite',
          targetId: id,
          metadata: { name: suite.name },
        },
      });

      return suite;
    });

    return NextResponse.json({ suite: updated });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await getSuiteIfAuthorized(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: 'Test suite not found or permission denied' }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.testSuite.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'SUITE_DELETE',
          targetType: 'TestSuite',
          targetId: id,
          metadata: { name: existing.name },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to delete suite' }, { status: 500 });
  }
}