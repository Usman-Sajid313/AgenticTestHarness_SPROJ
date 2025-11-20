// Import required modules and utilities
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { testSuiteSchema } from '@/lib/suiteSchemas';
import { ZodError, z } from 'zod';
import { Prisma } from '@prisma/client';

// Utility to safely convert unknown input to Prisma JSON format
const toPrismaJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

// Schema to validate DELETE request payload
const deleteSuiteSchema = z.object({
  suiteId: z.string().cuid('suiteId is required'),
});

// Handler for creating a new test suite
export async function POST(req: Request) {
  // Ensure the user is authenticated
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Parse and validate incoming request body
    const body = await req.json();
    const payload = testSuiteSchema.parse(body);

    // Fetch the user's workspace membership
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    });

    if (!membership) {
      // User must belong to a workspace
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    // Validate that Prisma has generated the TestSuite model delegate
    if (!('testSuite' in prisma)) {
      console.error('[api/suites] Prisma client missing TestSuite delegate. Run `npx prisma generate`.');
      return NextResponse.json(
        { error: 'Server is still compiling Prisma models. Restart the dev server so `npx prisma generate` can run.' },
        { status: 500 }
      );
    }

    // Perform transactional creation of test suite + audit log
    const suite = await prisma.$transaction(async (tx) => {
      // Create new test suite
      const newSuite = await tx.testSuite.create({
        data: {
          workspaceId: membership.workspaceId,
          name: payload.name,
          corePrompt: payload.corePrompt,
          toolIds: toPrismaJson(payload.toolIds),
          config: payload.config ? toPrismaJson(payload.config) : undefined,
          variables: payload.variables ? toPrismaJson(payload.variables) : undefined,
        },
      });

      // Log creation event
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

    // Respond with the newly created suite
    return NextResponse.json({ suite }, { status: 201 });
  } catch (err) {
    // Log failure
    console.error('[api/suites] Failed to create suite', err);
    if (err instanceof ZodError) {
      // Validation failure
      return NextResponse.json({ error: 'Validation failed', issues: err.issues }, { status: 400 });
    }
    // Generic server error
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Handler for listing suites belonging to the user's workspace
export async function GET() {
  // Authenticate user
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch workspace membership
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  // If user has no workspace, return empty list
  if (!membership) return NextResponse.json({ suites: [] });

  let suites;
  try {
    // Fetch all suites in the user's workspace
    suites = await prisma.testSuite.findMany({
      where: { workspaceId: membership.workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  } catch (err) {
    console.error('[api/suites] Failed to list suites', err);
    return NextResponse.json(
      { error: 'Server is still compiling Prisma models. Restart the dev server so `npx prisma generate` can run.' },
      { status: 500 }
    );
  }

  // Return all found suites
  return NextResponse.json({ suites });
}

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
