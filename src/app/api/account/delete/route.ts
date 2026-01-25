import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { z, ZodError } from 'zod';

const REQUIRED_SENTENCE =
  'I understand this action will permanently delete my account';

const BodySchema = z.object({
  confirmation: z.string().trim().min(1),
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = (await req.json()) as unknown;
    const { confirmation } = BodySchema.parse(raw);

    if (confirmation !== REQUIRED_SENTENCE) {
      return NextResponse.json(
        { error: 'Confirmation sentence does not match.' },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: user.id, 
          actorEmail: user.email ?? undefined,
          action: 'USER_DELETE',
          targetType: 'User',
          targetId: user.id,
          metadata: { hardDelete: true },
        },
      });
      await tx.user.delete({ where: { id: user.id } });
    });

    const res = new NextResponse(null, { status: 204 });
    res.cookies.set({
      name: '__auth',
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 0,
    });
    return res;
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const first = err.issues?.[0];
      return NextResponse.json(
        { error: first?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export const DELETE_ACCOUNT_SENTENCE = REQUIRED_SENTENCE;
