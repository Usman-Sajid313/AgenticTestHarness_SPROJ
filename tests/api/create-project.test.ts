import { describe, it, expect } from 'vitest';
import {
  apiPost,
  signupAndGetCookie,
  createProject,
  uniqueName,
} from '../helpers/api';

function uniqueEmail() {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

describe('Use case: Create project', () => {
  it('Variation 1 (Happy path): with auth and valid name/description returns 200 and project', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('ProjectUser'), uniqueEmail(), 'Test123!@#');
    expect(cookie).toBeTruthy();
    const res = await createProject(cookie!, 'My Agent Project', 'Test agent description');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe('My Agent Project');
    expect(data.description).toBe('Test agent description');
  });

  it('Variation 2 (Auth): no cookie returns 401', async () => {
    const res = await apiPost('/api/projects', {
      name: 'NoAuth',
      description: 'Desc',
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('Variation 3 (Invalid): missing name/description still creates (API does not validate)', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('ProjectUser2'), uniqueEmail(), 'Test123!@#');
    const res = await apiPost(
      '/api/projects',
      { name: 'OnlyName', description: '' },
      { cookie: cookie! }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('OnlyName');
  });

  it('Variation 4 (Edge): valid cookie and long name succeeds', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('ProjectUser3'), uniqueEmail(), 'Test123!@#');
    const longName = 'A'.repeat(100);
    const res = await createProject(cookie!, longName, 'Description');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe(longName);
  });

  it('Variation 5 (Edge): second project for same user succeeds', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('ProjectUser4'), uniqueEmail(), 'Test123!@#');
    const res1 = await createProject(cookie!, 'First', 'Desc1');
    const res2 = await createProject(cookie!, 'Second', 'Desc2');
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const p1 = await res1.json();
    const p2 = await res2.json();
    expect(p1.id).not.toBe(p2.id);
  });
});
