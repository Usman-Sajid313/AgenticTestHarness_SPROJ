import { describe, it, expect } from 'vitest';
import { apiPost, signupAndGetCookie, uniqueName } from '../helpers/api';

function uniqueEmail() {
  return `logout-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

describe('Use case: Logout', () => {
  it('Variation 1 (Happy path): with auth cookie returns 200 and clears cookie', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('LogoutUser'), uniqueEmail(), 'Test123!@#');
    expect(cookie).toBeTruthy();
    const res = await apiPost('/api/auth/logout', {}, { cookie: cookie! });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/__auth=;/);
  });

  it('Variation 2 (Edge): without cookie still returns 200', async () => {
    const res = await apiPost('/api/auth/logout', {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  it('Variation 3 (Edge): empty body is accepted', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('LogoutUser2'), uniqueEmail(), 'Test123!@#');
    const res = await apiPost('/api/auth/logout', {}, { cookie: cookie! });
    expect(res.status).toBe(200);
  });

  it('Variation 4 (Edge): invalid/expired cookie still returns 200', async () => {
    const res = await apiPost('/api/auth/logout', {}, {
      cookie: '__auth=invalid-token-value',
    });
    expect(res.status).toBe(200);
  });

  it('Variation 5 (Edge): POST with no body returns 200', async () => {
    const res = await apiPost('/api/auth/logout', null);
    expect(res.status).toBe(200);
  });
});
