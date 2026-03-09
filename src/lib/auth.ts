import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHash } from 'crypto';
import { verifyAuthJWT } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { sanitizeApiTokenScopes, type ApiTokenScope } from '@/lib/apiTokenScopes';

type JwtPayload = {
  sub: string;   
  email?: string;
  exp?: number;
  iat?: number;
};

type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  status: string;
};

export type { SessionUser };

async function getCookieSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const jwtToken = cookieStore.get('__auth')?.value;

  if (!jwtToken) return null;

  try {
    const payload = (await verifyAuthJWT(jwtToken)) as JwtPayload;
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

async function getBearerTokenUser(requiredScope: ApiTokenScope): Promise<SessionUser | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const plainToken = authHeader.slice(7).trim();
  if (!plainToken) return null;

  try {
    const hashedToken = hashApiToken(plainToken);

    const apiToken = await prisma.apiToken.findUnique({
      where: { hashedToken },
      select: {
        id: true,
        revokedAt: true,
        scopes: true,
        user: {
          select: { id: true, email: true, name: true, status: true },
        },
      },
    });

    if (!apiToken || apiToken.revokedAt) return null;
    if (!apiToken.user || apiToken.user.status !== 'ACTIVE') return null;

    const scopes = sanitizeApiTokenScopes(apiToken.scopes);
    if (!scopes.includes(requiredScope)) return null;

    void prisma.apiToken
      .update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return apiToken.user;
  } catch {
    return null;
  }
}

/**
 * Returns the currently signed-in browser session user.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  return getCookieSessionUser();
}

/**
 * Returns the current user from either a browser session or a scoped API token.
 * Session auth bypasses scope checks; bearer auth must explicitly include the scope.
 */
export async function getScopedUser(requiredScope: ApiTokenScope): Promise<SessionUser | null> {
  const sessionUser = await getCookieSessionUser();
  if (sessionUser) return sessionUser;
  return getBearerTokenUser(requiredScope);
}

/**
 * Hash a plaintext API token with SHA-256.
 * Tokens are stored as hashes in the database and never in plaintext.
 */
export function hashApiToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

