import { NextResponse } from 'next/server';
import { authCookieName, authCookieOptions } from '@/lib/authCookie';

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: authCookieName(),
    value: '',
    ...authCookieOptions(req, 0),
  });
  return res;
}

