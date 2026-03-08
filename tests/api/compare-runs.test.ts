import { describe, it, expect } from 'vitest';
import { apiGet, apiPostFormData, createUploadedRun, uniqueName } from '../helpers/api';

function uniqueEmail() {
  return `compare-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

describe('Use case: Compare runs', () => {
  it('Variation 1 (Happy path): two run ids in same project with cookie returns 200', async () => {
    const name = uniqueName('CompareUser');
    const { runId: runId1, cookie, projectId } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const form = new FormData();
    form.append('file', new Blob(['{"x":2}\n'], { type: 'application/json' }), 'run2.jsonl');
    form.append('projectId', projectId);
    const uploadRes = await apiPostFormData('/api/runs/upload-logfile', form, { cookie });
    const uploadData = await uploadRes.json();
    const runId2 = uploadData.runId;
    const res = await apiGet(`/api/runs/compare?ids=${runId1},${runId2}`, { cookie });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.runs).toBeDefined();
    expect(Array.isArray(data.runs)).toBe(true);
    expect(data.runs.length).toBe(2);
  });

  it('Variation 2 (Auth): no cookie returns 401', async () => {
    const name = uniqueName('CompareUser2');
    const { runId } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiGet(`/api/runs/compare?ids=${runId},${runId}`, {});
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('Variation 3 (Invalid): missing ids returns 400', async () => {
    const name = uniqueName('CompareUser3');
    const { cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiGet('/api/runs/compare', { cookie });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('ids');
  });

  it('Variation 4 (Invalid): single id returns 400', async () => {
    const name = uniqueName('CompareUser4');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiGet(`/api/runs/compare?ids=${runId}`, { cookie });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('At least 2');
  });

  it('Variation 5 (Invalid): more than 4 ids returns 400', async () => {
    const name = uniqueName('CompareUser5');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const ids = [runId, runId, runId, runId, runId].join(',');
    const res = await apiGet(`/api/runs/compare?ids=${ids}`, { cookie });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Maximum 4');
  });
});
