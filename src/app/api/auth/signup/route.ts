import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z, ZodError } from 'zod';
import bcrypt from 'bcryptjs';
import { signAuthJWT } from '@/lib/jwt';

const SignupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[a-z]/, 'Must include a lowercase letter')
    .regex(/[0-9]/, 'Must include a number')
    .regex(/[^A-Za-z0-9]/, 'Must include a symbol'),
});

type SignupInput = z.infer<typeof SignupSchema>;

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as unknown;
    const { name, email, password } = SignupSchema.parse(raw) as SignupInput;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, name, passwordHash, status: 'ACTIVE' },
        select: { id: true, email: true, name: true },
      });

      const ws = await tx.workspace.create({
        data: { name: `${u.name ?? u.email}'s Workspace` },
        select: { id: true },
      });

      await tx.membership.create({
        data: { userId: u.id, workspaceId: ws.id, role: 'ADMIN' },
      });

      await tx.auditLog.create({
        data: {
          userId: u.id,
          action: 'USER_SIGNUP',
          targetType: 'User',
          targetId: u.id,
          metadata: { email: u.email },
        },
      });

      return u;
    });

    const token = await signAuthJWT({
      sub: user.id,
      email: user.email,
    });

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
