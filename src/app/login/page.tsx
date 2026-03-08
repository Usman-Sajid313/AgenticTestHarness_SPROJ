import LoginPageClient from './LoginPageClient';

function normalizeRedirectTo(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate && candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate;
  }
  return '/';
}

export default async function LoginPage(context: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const searchParams = await context.searchParams;
  const redirectTo = normalizeRedirectTo(searchParams.redirectTo);

  return <LoginPageClient redirectTo={redirectTo} />;
}
