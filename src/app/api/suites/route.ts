// Import required modules and utilities
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z, ZodError } from 'zod';

// Schema to validate DELETE request payload
const deleteSuiteSchema = z.object({
  suiteId: z.string().cuid('suiteId is required'),
});

// Handler for deleting an existing test suite
export async function DELETE(req: Request) {
  // Authenticate user
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Validate incoming request payload
    const body = await req.json();
    const { suiteId } = deleteSuiteSchema.parse(body);

    // Fetch workspace membership
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    });

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    // Ensure Prisma delegate exists
    if (!('testSuite' in prisma)) {
      console.error('[api/suites] Prisma client missing TestSuite delegate. Run `npx prisma generate`.');
      return NextResponse.json(
        { error: 'Server is still compiling Prisma models. Restart the dev server so `npx prisma generate` can run.' },
        { status: 500 }
      );
    }

    // Verify suite exists and belongs to workspace
    const suite = await prisma.testSuite.findFirst({
      where: { id: suiteId, workspaceId: membership.workspaceId },
      select: { id: true, name: true },
    });

    if (!suite) {
      return NextResponse.json({ error: 'Test suite not found' }, { status: 404 });
    }

    // Delete suite + record audit log transactionally
    await prisma.$transaction(async (tx) => {
      await tx.testSuite.delete({ where: { id: suite.id } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'SUITE_DELETE',
          targetType: 'TestSuite',
          targetId: suite.id,
          metadata: { name: suite.name },
        },
      });
    });

    // Successful deletion
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/suites] Failed to delete suite', err);
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
