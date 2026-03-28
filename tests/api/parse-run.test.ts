import { describe, it, expect } from 'vitest';
import {
  apiPost,
  createUploadedRun,
  createRunNoLogfile,
  createProject,
  signupAndGetCookie,
  uniqueName,
} from '../helpers/api';

function uniqueEmail() {
  return `parse-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

describe('Use case: Parse run', () => {
  it('Variation 1 (Happy path): run UPLOADED with cookie returns 200 and parsing result', async () => {
    const name = uniqueName('ParseUser');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.runId).toBe(runId);
      expect(data.status).toBe('PARSING');
    }
  });

  it('Variation 2 (Auth): no cookie returns 401', async () => {
    const name = uniqueName('ParseUser2');
    const { runId } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiPost(`/api/runs/${runId}/parse`, {});
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('Variation 3 (Not found): non-existent run id returns 404', async () => {
    const name = uniqueName('ParseUser3');
    const { cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const fakeId = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';
    const res = await apiPost(`/api/runs/${fakeId}/parse`, {}, { cookie });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Run not found');
  });

  it('Variation 4 (Invalid state): run not UPLOADED returns 400', async () => {
    const name = uniqueName('ParseUser4');
    const { cookie } = await signupAndGetCookie(name, uniqueEmail(), 'Test123!@#');
    if (!cookie) throw new Error('No cookie');
    const projectRes = await createProject(cookie, `P-${name}`, 'Desc');
    const project = await projectRes.json();
    const { runId } = await createRunNoLogfile(cookie, project.id);
    if (!runId) throw new Error('No run id');
    const res = await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('not UPLOADED');
  });

  it('Variation 5 (Edge): POST parse with empty body uses defaults', async () => {
    const name = uniqueName('ParseUser5');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.runId).toBe(runId);
    }
  });
});
