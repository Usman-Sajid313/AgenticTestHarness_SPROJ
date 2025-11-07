import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z, ZodError } from 'zod';
import bcrypt from 'bcryptjs';
import { signAuthJWT } from '@/lib/jwt';
import { ensureDefaultSuiteForUser } from '@/lib/testSuiteStore';

const LoginSchema = z.object({
  identifier: z.string().trim().min(2, 'Enter your name'),
  password: z.string().min(8, 'Invalid credentials'),
});

type LoginInput = z.infer<typeof LoginSchema>;

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as unknown;
    const { identifier, password } = LoginSchema.parse(raw) as LoginInput;

    let user:
      | { id: string; email: string; name: string | null; passwordHash: string; status: 'ACTIVE' | 'DELETED' }
      | null = null;

    const isEmail = identifier.includes('@');

    if (isEmail) {
      user = await prisma.user.findUnique({
        where: { email: identifier.toLowerCase() },
        select: { id: true, email: true, name: true, passwordHash: true, status: true },
      });
    } else {
      const matches = await prisma.user.findMany({
        where: { name: identifier },
        select: { id: true, email: true, name: true, passwordHash: true, status: true },
        take: 2, 
      });
      if (matches.length === 1) user = matches[0];
      else if (matches.length > 1) {
        return NextResponse.json(
          { field: 'identifier', error: 'Multiple accounts share this name. Please log in with your email.' },
          { status: 400 }
        );
      }
    }

    if (!user || user.status === 'DELETED') {
      return NextResponse.json(
        { field: 'identifier', error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { field: 'password', error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const token = await signAuthJWT({ sub: user.id, email: user.email });
    ensureDefaultSuiteForUser(user.id);

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: '__auth',
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: Number(process.env.JWT_EXPIRES_DAYS ?? '14') * 24 * 60 * 60,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        targetType: 'User',
        targetId: user.id,
        metadata: { via: isEmail ? 'email' : 'name' },
      },
    });

    return res;
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const first = err.issues?.[0];
      const field = (first?.path?.[0] as 'identifier' | 'password' | undefined) ?? 'identifier';
      return NextResponse.json({ field, error: first?.message ?? 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
