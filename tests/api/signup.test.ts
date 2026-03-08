import { describe, it, expect } from 'vitest';
import { apiPost, getAuthCookieFromResponse, uniqueName } from '../helpers/api';

function uniqueEmail() {
  return `signup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

const VALID_PASSWORD = 'Test123!@#';

describe('Use case: Signup', () => {
  it('Variation 1 (Happy path): valid name, email, password returns 200 and sets auth cookie', async () => {
    const res = await apiPost('/api/auth/signup', {
      name: uniqueName('NewUser'),
      email: uniqueEmail(),
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    const cookie = getAuthCookieFromResponse(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain('__auth=');
  });

  it('Variation 2 (Invalid): duplicate email returns 409', async () => {
    const email = uniqueEmail();
    await apiPost('/api/auth/signup', {
      name: uniqueName('FirstUser'),
      email,
      password: VALID_PASSWORD,
    });
    const res = await apiPost('/api/auth/signup', {
      name: uniqueName('SecondUser'),
      email,
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('An account with this email already exists.');
  });

  it('Variation 3 (Invalid): password without symbol returns 400', async () => {
    const res = await apiPost('/api/auth/signup', {
      name: uniqueName('NoSymbol'),
      email: uniqueEmail(),
      password: 'Test12345', // no symbol
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('symbol');
  });

  it('Variation 4 (Invalid): invalid email format returns 400', async () => {
    const res = await apiPost('/api/auth/signup', {
      name: uniqueName('BadEmail'),
      email: 'not-an-email',
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('email');
  });

  it('Variation 5 (Invalid): name too short returns 400', async () => {
    const res = await apiPost('/api/auth/signup', {
      name: 'x',
      email: uniqueEmail(),
      password: VALID_PASSWORD,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Name');
  });
});
