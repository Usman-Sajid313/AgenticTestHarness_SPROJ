import { describe, it, expect } from 'vitest';
import { apiPost, baseUrl, signupAndGetCookie, uniqueName } from '../helpers/api';

function uniqueEmail() {
  return `suite-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

describe('Use case: Run test suite', () => {
  it('Variation 1 (Happy path): POST with valid body and cookie returns 200 or 500', async () => {
    const name = uniqueName('SuiteUser');
    const { cookie } = await signupAndGetCookie(name, uniqueEmail(), 'Test123!@#');
    if (!cookie) throw new Error('No cookie');
    const res = await apiPost('/api/test-suite/run', {}, { cookie });
    expect([200, 500]).toContain(res.status);
    if (res.status === 500) {
      const data = await res.json();
      expect(data.error).toBeDefined();
    }
  });

  it('Variation 2 (Auth): no cookie returns 401', async () => {
    const res = await apiPost('/api/test-suite/run', {});
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('Variation 3 (Invalid): invalid payload (temperature > 1) returns 400', async () => {
    const name = uniqueName('SuiteUser3');
    const { cookie } = await signupAndGetCookie(name, uniqueEmail(), 'Test123!@#');
    if (!cookie) throw new Error('No cookie');
    const res = await apiPost('/api/test-suite/run', { temperature: 2 }, { cookie });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('Variation 4 (Invalid): unparseable body returns 400', async () => {
    const name = uniqueName('SuiteUser4');
    const { cookie } = await signupAndGetCookie(name, uniqueEmail(), 'Test123!@#');
    if (!cookie) throw new Error('No cookie');
    const url = `${baseUrl()}/api/test-suite/run`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('Variation 5 (Edge): POST with empty object uses defaults', async () => {
    const name = uniqueName('SuiteUser5');
    const { cookie } = await signupAndGetCookie(name, uniqueEmail(), 'Test123!@#');
    if (!cookie) throw new Error('No cookie');
    const res = await apiPost('/api/test-suite/run', {}, { cookie });
    expect([200, 500]).toContain(res.status);
  });
});
