import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z, ZodError } from 'zod';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';

const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[0-9]/, 'Must include a number')
  .regex(/[^A-Za-z0-9]/, 'Must include a symbol');

const BodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name must not be empty')
      .max(100)
      .transform((val) => val.trim())
      .optional(),
    oldPassword: z.string().min(8, 'Old password must be at least 8 characters').max(128).optional(),
    newPassword: PasswordSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.name && !data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No changes requested.',
        path: ['name'],
      });
    }
    if (data.newPassword && !data.oldPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter your current password to set a new password.',
        path: ['oldPassword'],
      });
    }
  });

type BodyInput = z.infer<typeof BodySchema>;

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = (await req.json()) as unknown;
    const { name, oldPassword, newPassword } = BodySchema.parse(raw) as BodyInput;

    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data: { name?: string; passwordHash?: string } = {};
    const logs: Array<{ action: string; metadata?: Prisma.InputJsonValue }> = [];

    if (typeof name === 'string' && name.length > 0 && name !== existing.name) {
      data.name = name;
      logs.push({ action: 'USER_UPDATE_PROFILE', metadata: { field: 'name' } });
    }

    if (newPassword) {
      const matches = await bcrypt.compare(oldPassword ?? '', existing.passwordHash);
      if (!matches) {
        return NextResponse.json(
          { field: 'oldPassword', error: 'Incorrect current password.' },
          { status: 400 }
        );
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      data.passwordHash = passwordHash;
      logs.push({ action: 'USER_CHANGE_PASSWORD' });
    }

    if (!Object.keys(data).length) {
      return NextResponse.json(
        { error: 'Nothing to update. Enter a new name or password.' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: existing.id },
        data,
        select: { id: true, email: true, name: true },
      });

      await Promise.all(
        logs.map((log) =>
          tx.auditLog.create({
            data: {
              userId: existing.id,
              action: log.action,
              targetType: 'User',
              targetId: existing.id,
              metadata: log.metadata ?? undefined,
            },
          })
        )
      );

      return saved;
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
      },
      nameChanged: Object.prototype.hasOwnProperty.call(data, 'name'),
      passwordChanged: Object.prototype.hasOwnProperty.call(data, 'passwordHash'),
    });
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const first = err.issues?.[0];
      const path = first?.path?.[0] as 'name' | 'oldPassword' | 'newPassword' | undefined;
      return NextResponse.json(
        {
          field: path,
          error: first?.message ?? 'Invalid input',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

