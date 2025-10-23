import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  toolCreatePayloadSchema,
  buildInputJsonSchema,
  buildOutputJsonSchema,
  parseInputJsonSchema,
  parseOutputJsonSchema,
} from '@/lib/toolSchemas';
import { ZodError } from 'zod';

async function getWorkspaceIdForUser(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceIdForUser(user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
  }

  const tool = await prisma.tool.findFirst({
    where: { id, workspaceId },
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

  if (!tool) {
    return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
  }

  const currentVersion = tool.versions[0];

  return NextResponse.json({
    id: tool.id,
    name: tool.name,
    description: tool.description ?? '',
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
    versionId: currentVersion?.id ?? null,
    version: currentVersion?.version ?? '1.0.0',
    parameters: currentVersion ? parseInputJsonSchema(currentVersion.inputSchema) : [],
    output: currentVersion ? parseOutputJsonSchema(currentVersion.outputSchema) : { format: 'text' as const },
  });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = toolCreatePayloadSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
      return NextResponse.json({ error: 'Invalid input', issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const workspaceId = await getWorkspaceIdForUser(user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
  }

  const tool = await prisma.tool.findFirst({
    where: { id, workspaceId },
    select: { id: true, name: true },
  });

  if (!tool) {
    return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
  }

  const duplicate = await prisma.tool.findFirst({
    where: {
      workspaceId,
      name: payload.name,
      id: { not: id },
    },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json(
      { error: 'A tool with this name already exists in your workspace.' },
      { status: 409 }
    );
  }

  const inputSchema = toPrismaJson(buildInputJsonSchema(payload.parameters));
  const outputSchema = toPrismaJson(buildOutputJsonSchema(payload.output));

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const updatedTool = await tx.tool.update({
        where: { id },
        data: {
          name: payload.name,
          description: payload.description,
        },
        select: { id: true },
      });

      const activeVersion = await tx.toolVersion.findFirst({
        where: { toolId: updatedTool.id, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (activeVersion) {
        await tx.toolVersion.update({
          where: { id: activeVersion.id },
          data: {
            inputSchema,
            outputSchema,
          },
        });
      } else {
        await tx.toolVersion.create({
          data: {
            toolId: updatedTool.id,
            version: '1.0.0',
            endpointType: 'MOCK',
            inputSchema,
            outputSchema,
            isActive: true,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'TOOL_UPDATE',
          targetType: 'Tool',
          targetId: updatedTool.id,
          metadata: {
            name: payload.name,
            inputParameterCount: payload.parameters.length,
            outputFormat: payload.output.format,
          },
        },
      });

      return updatedTool.id;
    });

    return NextResponse.json({ ok: true, toolId: updated });
  } catch (error) {
    console.error('Failed to update tool', error);
    return NextResponse.json({ error: 'Failed to update tool. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceIdForUser(user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
  }

  const tool = await prisma.tool.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });

  if (!tool) {
    return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tool.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'TOOL_DELETE',
          targetType: 'Tool',
          targetId: id,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete tool', error);
    return NextResponse.json({ error: 'Failed to delete tool. Please try again.' }, { status: 500 });
  }
}

