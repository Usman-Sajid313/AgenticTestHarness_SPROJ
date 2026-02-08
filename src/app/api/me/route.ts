import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  return NextResponse.json({
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    user: {
      memberships: membership ? [{ workspaceId: membership.workspaceId }] : [],
    },
    workspaceId: membership?.workspaceId ?? null,
  });
}
