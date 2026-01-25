import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
const expiresDays = Number(process.env.JWT_EXPIRES_DAYS ?? '14');

export async function signAuthJWT(payload: object) {
  const exp = Math.floor(Date.now() / 1000) + expiresDays * 24 * 60 * 60;
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(secret);
}

export async function verifyAuthJWT(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload;
}
