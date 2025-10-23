import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  toolCreatePayloadSchema,
  buildInputJsonSchema,
  buildOutputJsonSchema,
  parseInputJsonSchema,
  parseOutputJsonSchema,
  createEmptyParameter,
} from '@/lib/toolSchemas';
import { ZodError } from 'zod';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    const raw = (await req.json()) as unknown;
    payload = toolCreatePayloadSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      }));
      return NextResponse.json({ error: 'Invalid input', issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true },
  });

  if (!membership) {
    return NextResponse.json(
      { error: 'No workspace found for user' },
      { status: 400 }
    );
  }

  const existing = await prisma.tool.findFirst({
    where: {
      workspaceId: membership.workspaceId,
      name: payload.name,
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'A tool with this name already exists in your workspace.' },
      { status: 409 }
    );
  }

  const inputSchema = buildInputJsonSchema(payload.parameters);
  const outputSchema = buildOutputJsonSchema(payload.output);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tool = await tx.tool.create({
        data: {
          workspaceId: membership.workspaceId,
          ownerId: user.id,
          name: payload.name,
          description: payload.description,
        },
        select: { id: true, workspaceId: true },
      });

      const version = await tx.toolVersion.create({
        data: {
          toolId: tool.id,
          version: '1.0.0',
          endpointType: 'MOCK',
          inputSchema,
          outputSchema,
          isActive: true,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'TOOL_CREATE',
          targetType: 'Tool',
          targetId: tool.id,
          metadata: {
            name: payload.name,
            workspaceId: tool.workspaceId,
            toolVersionId: version.id,
            inputParameterCount: payload.parameters.length,
            outputFormat: payload.output.format,
          },
        },
      });

      return { toolId: tool.id, toolVersionId: version.id };
    });

    return NextResponse.json(
      {
        ok: true,
        toolId: result.toolId,
        toolVersionId: result.toolVersionId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create tool', error);
    return NextResponse.json(
      { error: 'Failed to create tool. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true },
  });

  if (!membership) {
    return NextResponse.json({ tools: [] });
  }

  const tools = await prisma.tool.findMany({
    where: { workspaceId: membership.workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      versions: {
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          version: true,
          inputSchema: true,
          outputSchema: true,
        },
      },
    },
  });

  const normalized = tools.map((tool) => {
    const currentVersion = tool.versions[0];
    const parameters = currentVersion
      ? parseInputJsonSchema(currentVersion.inputSchema)
      : [createEmptyParameter()];
    const output = currentVersion
      ? parseOutputJsonSchema(currentVersion.outputSchema)
      : { format: 'text' as const };

    return {
      id: tool.id,
      name: tool.name,
      description: tool.description ?? '',
      createdAt: tool.createdAt,
      updatedAt: tool.updatedAt,
      versionId: currentVersion?.id ?? null,
      version: currentVersion?.version ?? '1.0.0',
      parameters,
      output,
    };
  });

  return NextResponse.json({ tools: normalized });
}

