import { describe, it, expect, beforeAll } from 'vitest';
import {
  apiPost,
  signupAndGetCookie,
  getAuthCookieFromResponse,
  uniqueName,
} from '../helpers/api';

const LOGIN_USER_PASSWORD = 'Test123!@#';

describe('Use case: Login', () => {
  const LOGIN_USER_EMAIL = `login-${Date.now()}@example.com`;
  const LOGIN_USER_NAME = uniqueName('LoginUser');

  beforeAll(async () => {
    const res = await signupAndGetCookie(LOGIN_USER_NAME, LOGIN_USER_EMAIL, LOGIN_USER_PASSWORD);
    if (!res.res.ok) throw new Error(`Signup failed: ${res.res.status}`);
  });

  it('Variation 1 (Happy path): valid email and password returns 200 and sets auth cookie', async () => {
    const res = await apiPost('/api/auth/login', {
      identifier: LOGIN_USER_EMAIL,
      password: LOGIN_USER_PASSWORD,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    const cookie = getAuthCookieFromResponse(res);
    expect(cookie).toBeTruthy();
    expect(cookie).toContain('__auth=');
  });

  it('Variation 2 (Invalid): wrong password returns 401', async () => {
    const res = await apiPost('/api/auth/login', {
      identifier: LOGIN_USER_EMAIL,
      password: 'WrongPass1!',
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.field).toBe('password');
    expect(data.error).toBe('Invalid credentials');
  });

  it('Variation 3 (Invalid): identifier too short returns 400', async () => {
    const res = await apiPost('/api/auth/login', {
      identifier: 'x',
      password: LOGIN_USER_PASSWORD,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.field).toBeDefined();
    expect(data.error).toContain('name');
  });

  it('Variation 4 (Auth/edge): non-existent identifier returns 401', async () => {
    const res = await apiPost('/api/auth/login', {
      identifier: 'nonexistent@example.com',
      password: LOGIN_USER_PASSWORD,
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid credentials');
  });

  it.skip('Variation 5 (Edge): duplicate display name - cannot test via signup (Workspace.name unique)', async () => {
    const name = `DupName-${Date.now()}`;
    await signupAndGetCookie(name, `dup1-${Date.now()}@example.com`, LOGIN_USER_PASSWORD);
    await signupAndGetCookie(name, `dup2-${Date.now()}@example.com`, LOGIN_USER_PASSWORD);
    const res = await apiPost('/api/auth/login', {
      identifier: name,
      password: LOGIN_USER_PASSWORD,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Multiple accounts');
    expect(data.error).toContain('email');
  });
});
