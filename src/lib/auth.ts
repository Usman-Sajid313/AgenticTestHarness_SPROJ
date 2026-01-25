import 'server-only';
import { cookies } from 'next/headers';
import { verifyAuthJWT } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

type JwtPayload = {
  sub: string;   
  email?: string;
  exp?: number;
  iat?: number;
};

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('__auth')?.value;
  if (!token) return null;

  try {
    const payload = (await verifyAuthJWT(token)) as JwtPayload;
    if (!payload?.sub) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') return null;
    return user;
  } catch {
    return null;
  }
}
